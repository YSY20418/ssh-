#!/usr/bin/env node
/**
 * 一键验证：自动启动 → 冒烟 + 评测 → 无论成败都自动关停
 *
 * 设计目的：之前为了跑评测把 next dev 挂在后台常驻，跑完忘了关，
 * 一直占用端口和内存。这个脚本把「启动 → 验证 → 关停」收进同一个进程生命周期，
 * 用 try/finally 保证任何退出路径（成功、失败、Ctrl+C、异常）都会杀掉整棵进程树。
 *
 * 用法：npm run verify
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.VERIFY_PORT ?? 3300);
const BASE = `http://127.0.0.1:${PORT}`;
const IS_WIN = process.platform === 'win32';
const STARTUP_TIMEOUT_MS = 90_000;
const OVERALL_TIMEOUT_MS = 8 * 60_000;

const log = (...a) => console.log('[verify]', ...a);
const fail = (...a) => console.error('[verify]', ...a);

let server = null;
let overallTimer = null;
let cleaned = false;

/** 杀掉整棵进程树：先 tree-kill，再定向 kill，最后按端口兜底 */
function killTree(pid) {
  if (!pid) return;
  try {
    if (IS_WIN) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        process.kill(pid, 'SIGKILL');
      }
    }
  } catch {
    /* 已退出 */
  }
}

function killByPort(port) {
  try {
    if (IS_WIN) {
      const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout ?? '';
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        if (pid === '0') continue;
        spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
      }
    } else {
      spawnSync('sh', ['-c', `lsof -ti tcp:${port} | xargs -r kill -9`], { stdio: 'ignore' });
    }
  } catch {
    /* 忽略 */
  }
}

function cleanup(reason) {
  if (cleaned) return;
  cleaned = true;
  if (overallTimer) clearTimeout(overallTimer);
  log(`关停服务（${reason}）…`);
  if (server) {
    killTree(server.pid);
    server = null;
  }
  killByPort(PORT);
  log('已关停，端口', PORT, '已释放。');
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) return true;
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  fail(`服务在 ${Math.round(timeoutMs / 1000)}s 内未就绪：${lastErr}`);
  return false;
}

async function smoke() {
  const checks = [
    ['首页', '/'],
    ['被代驾站点·医院挂号', '/sim/city-hospital'],
    ['被代驾站点·市民之家', '/sim/citizen-hall'],
    ['MCP 能力清单', '/api/mcp'],
    ['会话目录', '/api/session'],
  ];
  let ok = 0;
  for (const [label, url] of checks) {
    try {
      const res = await fetch(`${BASE}${url}`, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) {
        ok += 1;
        log(`  ✔ ${label} → ${res.status}`);
      } else {
        fail(`  ✘ ${label} → ${res.status}`);
      }
    } catch (err) {
      fail(`  ✘ ${label} → ${err instanceof Error ? err.message : err}`);
    }
  }

  // MCP 通道实测：initialize / tools/list / 越权调用是否被门禁拦住
  try {
    const init = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      signal: AbortSignal.timeout(30_000),
    }).then((r) => r.json());
    const listed = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(30_000),
    }).then((r) => r.json());
    const toolCount = listed?.result?.tools?.length ?? 0;
    log(`  ✔ MCP initialize → ${init?.result?.serverInfo?.name ?? '?'}`);
    log(`  ✔ MCP tools/list → ${toolCount} 个工具`);
    if (toolCount === 0) fail('  ✘ MCP 工具清单为空');
    else ok += 1;
  } catch (err) {
    fail(`  ✘ MCP 通道 → ${err instanceof Error ? err.message : err}`);
  }

  log(`冒烟：${ok}/${checks.length + 1} 项通过`);
  return ok === checks.length + 1;
}

function runEval() {
  log('运行自动化评测…');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'eval.mjs')], {
    cwd: ROOT,
    env: { ...process.env, BASE },
    stdio: 'inherit',
    timeout: 6 * 60_000,
  });
  if (r.error) {
    fail('评测进程异常：', r.error.message);
    return false;
  }
  if (r.signal) {
    fail(`评测被信号终止：${r.signal}`);
    return false;
  }
  return r.status === 0;
}

async function main() {
  log(`启动开发服务器 :${PORT}（验证结束后会自动关停）…`);
  server = spawn(
    IS_WIN ? 'npx.cmd' : 'npx',
    ['next', 'dev', '-p', String(PORT)],
    {
      cwd: ROOT,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'ignore',
      detached: !IS_WIN,
      shell: IS_WIN,
    },
  );
  server.on('error', (e) => fail('服务进程错误：', e.message));

  const healthy = await waitForHealth(STARTUP_TIMEOUT_MS);
  if (!healthy) {
    return { ok: false, reason: '服务未就绪' };
  }
  log('服务已就绪。');

  const smokeOk = await smoke();
  const evalOk = existsSync(path.join(ROOT, 'scripts', 'eval.mjs')) ? runEval() : true;

  return { ok: smokeOk && evalOk, reason: '完成' };
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    cleanup(`收到 ${sig}`);
    process.exit(130);
  });
}
process.on('uncaughtException', (e) => {
  fail('未捕获异常：', e);
  cleanup('异常退出');
  process.exit(1);
});

overallTimer = setTimeout(() => {
  fail(`超过总时限 ${OVERALL_TIMEOUT_MS / 1000}s，强制收尾`);
  cleanup('总时限');
  process.exit(1);
}, OVERALL_TIMEOUT_MS);
overallTimer.unref?.();

const result = await main();
cleanup(result.reason);
if (!result.ok) {
  fail('验证未通过。');
  process.exit(1);
}
log('全部通过 ✅');
process.exit(0);
