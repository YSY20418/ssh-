/**
 * 云端（单端口托管）启动器
 *
 * 托管环境只把一个端口写进 PORT 环境变量，且不同宿主对启动命令的 shell 展开
 * 行为并不一致（有的不展开 $PORT，导致 `next start -p $PORT` 直接报错退出）。
 * 这里不依赖 shell：由 Node 直接读 process.env.PORT，再把端口显式传给 next，
 * 并强制绑定 0.0.0.0，保证反向代理能访问到。
 *
 * 本地也可用：PORT 未设置时回落到 3000。
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = String(process.env.PORT || 3000);
const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

console.log(`[start-cloud] 启动 next start -p ${port} -H 0.0.0.0`);

const r = spawnSync(process.execPath, [nextBin, 'start', '-p', port, '-H', '0.0.0.0'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
});

process.exit(typeof r.status === 'number' ? r.status : 1);
