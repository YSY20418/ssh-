/**
 * 静态产物路径重写：把 /_next/... 、/sim/xxx 这类绝对路径改成相对路径。
 *
 * 为什么需要：Next 静态导出默认写死以 "/" 开头的路径，只有把 out/
 * 放在域名根目录时才能打开。一旦双击用 file:// 打开，或上传到
 * 二级目录（如 example.com/demo/），浏览器会去 /_next/... 找资源，
 * 结果整页白屏、被代驾站点 iframe 也加载不出来。
 *
 * 改成相对路径后：out/ 整个目录丢到哪里都能开。
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');

if (!existsSync(OUT)) {
  console.error('  未找到 out/，请先跑 npm run build:static');
  process.exit(1);
}

function walk(dir, base, acc) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, base, acc);
    } else if (name.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

/** 把以 / 开头的站内路径换成相对路径；站外链接（http、mailto）原样保留 */
function toRelative(p, prefix) {
  if (p.startsWith('/_next/')) return prefix + p.slice(1);
  if (p === '/' || p === '') return prefix + 'index.html';
  if (p.startsWith('/sim/')) {
    const id = p.replace(/\/+$/, '').replace('/sim/', '');
    return prefix + 'sim/' + id + '/index.html';
  }
  if (p.startsWith('/elder/')) return prefix + p.slice(1);
  if (/^\/[A-Za-z0-9._/-]*$/.test(p)) return prefix + p.slice(1); // 其他静态资源
  return p;
}

const files = walk(OUT, OUT, []);
let changed = 0;
let hits = 0;

for (const file of files) {
  const rel = path.relative(OUT, file);
  const depth = rel.split(path.sep).length - 1;
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const src = readFileSync(file, 'utf8');

  const out = src.replace(/(src|href)="\/([^"]*)"/g, (m, attr, p) => {
    if (/^(https?:|mailto:|#|data:)/.test(p)) return m;
    hits += 1;
    return `${attr}="${toRelative('/' + p, prefix)}"`;
  });

  // 兜底：脚本里的资源引用（如 "\\/_next/" 形式的 JSON 字符串）
  const out2 = out.replace(/"\/_next\//g, `"${prefix}_next/`);

  if (out2 !== src) {
    writeFileSync(file, out2, 'utf8');
    changed += 1;
  }
}

console.log(`  路径相对化：${changed}/${files.length} 个页面，${hits} 处绝对引用已改写`);
console.log('  out/ 现在可以：双击 index.html 直接打开，或整个目录上传到任意二级目录');
