#!/usr/bin/env node
/**
 * 阿渡 WebPilot · 一键演示脚本（零依赖）
 *
 * 做的事：检查环境 → 提示模型配置状态 → 启动本地服务 → 等待就绪 → 打印演示入口。
 * 设计目标：**没有任何 API Key 也能完整演示**（规则引擎兜底），
 *          配了免费模型则升级为真·大模型驱动，两条链路行为一致。
 *
 * 用法：
 *   node scripts/demo.mjs              # 默认 3000 端口
 *   node scripts/demo.mjs --port 4000
 */

import { spawn } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) || 3000 : 3000;
const BASE = `http://127.0.0.1:${PORT}`;

/** 本机在局域网中的 IPv4 地址（手机 / 其他电脑要用这个访问） */
function lanAddresses() {
  const nets = networkInterfaces();
  const out = [];
  for (const list of Object.values(nets)) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

const line = (s = '') => console.log(s);
const ok = (s) => console.log(`  \u2713 ${s}`);
const warn = (s) => console.log(`  ! ${s}`);

line('');
line('  阿渡 WebPilot · 网页代驾 Agent —— 演示启动器');
line('  \u2500'.repeat(28));

// 1) 环境变量：没有则从模板生成，保证「克隆即跑」
if (!existsSync(path.join(ROOT, '.env.local')) && !existsSync(path.join(ROOT, '.env'))) {
  if (existsSync(path.join(ROOT, '.env.example'))) {
    copyFileSync(path.join(ROOT, '.env.example'), path.join(ROOT, '.env.local'));
    ok('未发现环境变量文件，已从 .env.example 生成 .env.local');
  }
}

const hasKey = Boolean(process.env.LLM_API_KEY?.trim());
line('');
line('  [1/3] 模型链路');
if (hasKey) {
  ok(`已配置在线大模型：${process.env.LLM_MODEL || '(默认)'} @ ${process.env.LLM_BASE_URL || '(默认)'}`);
} else {
  warn('未检测到 LLM_API_KEY —— 将使用内置规则引擎兜底，全流程依然可完整演示');
  warn('若要启用真·大模型驱动，请在 .env.local 填入免费模型的 Key（见 README「零成本模型」）');
}

// 2) 启动服务
line('');
line('  [2/3] 启动本地服务');
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  // -H 0.0.0.0：监听所有网卡，这样同一网络下的手机 / 其他电脑也能打开
  ['next', 'dev', '-H', '0.0.0.0', '-p', String(PORT)],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
);

let ready = false;
const onData = (buf) => {
  const s = buf.toString();
  if (!ready && /Ready in|started server|Local:/.test(s)) ready = true;
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);

async function waitReady(timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(8000) });
      if (res.status < 500) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return false;
}

child.on('exit', (code) => {
  if (!ready) {
    line('');
    warn(`服务进程已退出（code=${code}），请检查端口占用或先执行 npm install`);
    process.exit(code ?? 1);
  }
});

const up = await waitReady();
line('');
if (!up) {
  warn('等待服务就绪超时。可手动执行：npm install && npx next dev');
  child.kill();
  process.exit(1);
}
ok(`服务已就绪：${BASE}`);

// 3) 打印演示入口
line('');
line('  [3/3] 演示入口');
line('');
line(`  主控台（老人视角）     ${BASE}/`);
line(`  被代驾站点·医院挂号   ${BASE}/sim/city-hospital`);
line(`  被代驾站点·医保缴费   ${BASE}/sim/citizen-hall`);
line(`  MCP 能力服务器清单   ${BASE}/api/mcp`);
line(`  功能验收报告         docs-site/acceptance.html（离线可打开）`);
line('');

const lans = lanAddresses();
line('  同一网络下的其他设备（手机 / 别的电脑）这样打开：');
if (lans.length) {
  for (const ip of lans) {
    line(`    http://${ip}:${PORT}/`);
  }
  line('');
  warn('如果别的设备打不开，多半是 Windows 防火墙拦了入站：用管理员权限运行一次');
  warn(`    netsh advfirewall firewall add rule name="webpilot-${PORT}" dir=in action=allow protocol=TCP localport=${PORT}`);
} else {
  warn('未检测到局域网地址（可能未联网），其他设备暂时无法访问');
}
line('');
line('  演示脚本建议（约 90 秒）：');
line('   1. 主控台说「我这两天膝盖上下楼疼，想明天上午去医院看看，我叫张桂芳，');
line('      身份证110105195003071234，手机13800138000」→ 看四智能体逐段执行；');
line('   2. 提交前会弹出授权门禁 → 点「我确认，让它提交」→ 生成预约回执；');
line('   3. 右上角切到「市民之家」→ 用同一句话术办缴费，证明能力协议跨站点复用。');
line('');
line('  按 Ctrl+C 结束演示（服务会随之关停，不留后台进程）。');
line('');

/**
 * 退出收尾：演示服务是**故意**常驻的（要给人点开看），
 * 但任何退出路径都必须把它带走，绝不留下孤儿进程占着端口。
 */
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  try {
    child.kill();
  } catch {
    /* 已退出 */
  }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => {
    stop();
    process.exit(0);
  });
}
process.on('exit', stop);
process.on('uncaughtException', (e) => {
  console.error(e);
  stop();
  process.exit(1);
});
