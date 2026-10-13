/**
 * 零依赖静态服务器（给手机 / 其他设备访问用）。
 *
 * 与 `python -m http.server` 的关键区别：
 *   它对所有文本类响应都会补上 `; charset=utf-8`。
 *   常见静态服务器只回 `text/html` / `text/javascript` / `text/css` 而不带 charset，
 *   HTML 还能靠 <meta charset> 自救，外链的 JS / CSS 没有任何编码线索，
 *   部分手机浏览器会按系统默认编码（GBK）解析 —— 表现就是电脑上好好的、手机上乱码。
 *
 * 用法：
 *   node scripts/serve-static.mjs              # 服务 out/（静态产物），端口 8080
 *   node scripts/serve-static.mjs elder        # 服务 public/elder
 *   node scripts/serve-static.mjs -p 9000
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
let port = 8080;
let target = path.join(ROOT, 'out');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p' || args[i] === '--port') { port = Number(args[i + 1]) || port; i++; continue; }
  if (args[i] === '-h' || args[i] === '--help') {
    console.log('用法：node scripts/serve-static.mjs [目录] [-p 端口]');
    process.exit(0);
  }
  if (!args[i].startsWith('-')) {
    const a = path.resolve(ROOT, args[i]);
    target = fs.existsSync(a) ? a : path.join(ROOT, 'public', args[i]);
  }
}

if (!fs.existsSync(target)) {
  console.error('目录不存在：' + target);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.htm': 'text/html',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain', '.md': 'text/markdown',
  '.map': 'application/json'
};
const TEXTUAL = /^(text\/|application\/(json|javascript))|image\/svg\+xml/;

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(target, rel);

  // 防目录穿越
  if (!file.startsWith(target)) { res.writeHead(403).end('Forbidden'); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      const nf = path.join(target, '404.html');
      if (fs.existsSync(nf)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(nf).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('找不到：' + rel);
      }
      return;
    }
    const ext = path.extname(file).toLowerCase();
    let type = MIME[ext] || 'application/octet-stream';
    // 文本类一律带 charset：这一行就是「手机上不乱码」的关键
    if (TEXTUAL.test(type) && !/charset=/i.test(type)) type += '; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, '0.0.0.0', () => {
  const rel = path.relative(ROOT, target) || '.';
  console.log('\n静态服务已启动（已强制所有文本响应带 charset=utf-8）');
  console.log('  服务目录：' + rel + '/');
  console.log('\n  本机打开：  http://127.0.0.1:' + port + '/');
  const lan = lanAddresses();
  if (lan.length) {
    console.log('\n  同一 Wi-Fi 下的手机 / 其他电脑打开：');
    lan.forEach((ip) => console.log('    http://' + ip + ':' + port + '/'));
    console.log('\n  若手机打不开，多半是电脑防火墙拦了，放行一次即可：');
    console.log('    netsh advfirewall firewall add rule name="static-' + port +
      '" dir=in action=allow protocol=TCP localport=' + port);
  }
  console.log('\n  停止服务：按 Ctrl + C\n');
});

process.on('SIGINT', () => { console.log('\n已停止。\n'); server.close(() => process.exit(0)); });
