/**
 * 文档结构与编号自检
 *
 * 检查两类「排序乱了 / 不符合格式」的问题：
 *   1. HTML：标签是否闭合（未闭合会把后面整节吞进前一个容器）、h2 编号是否连续、
 *      侧边目录的锚点是否都能对上真实章节。
 *   2. Markdown：同级标题编号是否连续递增（重复号、跳号、倒序都会被抓出来）。
 *
 * 用法：node scripts/check-docs.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

let pass = 0;
const fails = [];
function ok(msg) { pass++; console.log('  ✓ ' + msg); }
function bad(msg) { fails.push(msg); console.log('  ✗ ' + msg); }

/* ---------------- 编号解析 ---------------- */
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnVal(s) {
  // 支持 十 / 十一 / 二十 这类常见写法
  if (s === '十') return 10;
  if (s.length === 1) return CN[s] || null;
  if (s[0] === '十') return 10 + (CN[s[1]] || 0);
  if (s[1] === '十') return (CN[s[0]] || 0) * 10 + (CN[s[2]] || 0);
  return null;
}
/** 从标题正文里取出编号：返回 { a, b }（b 为子编号，没有则为 null），无编号返回 null */
function seqOf(text) {
  const t = String(text).trim();
  let m = t.match(/^([一二三四五六七八九十]+)/);
  if (m) { const v = cnVal(m[1]); return v == null ? null : { a: v, b: null }; }
  m = t.match(/^([A-Za-z]+)?\s*(\d+)(?:\s*[.．]\s*(\d+))?/);
  if (m && m[2] !== undefined) return { a: Number(m[2]), b: m[3] === undefined ? null : Number(m[3]) };
  return null;
}

/** 检查一组同级标题的编号是否连续递增 */
function checkSeq(items, label) {
  const numbered = items.filter((it) => it.seq);
  if (numbered.length < 2) return true;
  let good = true;
  if (numbered.every((it) => it.seq.b === null)) {
    numbered.forEach((it, i) => {
      if (it.seq.a !== i + 1) {
        bad(`${label} 编号不连续：第 ${i + 1} 个编号为「${it.seq.a}」（应为 ${i + 1}）→ ${it.text}`);
        good = false;
      }
    });
  } else if (numbered.every((it) => it.seq.b !== null)) {
    let lastA = null, run = 0;
    for (const it of numbered) {
      if (it.seq.a !== lastA) { lastA = it.seq.a; run = 0; }
      run++;
      if (it.seq.b !== run) {
        bad(`${label} 子编号不连续：「${it.seq.a}.${it.seq.b}」（应为 ${it.seq.a}.${run}）→ ${it.text}`);
        good = false;
      }
    }
    const as = numbered.map((i) => i.seq.a);
    for (let i = 1; i < as.length; i++) {
      if (as[i] < as[i - 1]) { bad(`${label} 主编号倒序：${as[i - 1]} → ${as[i]}`); good = false; }
    }
  } else {
    const as = numbered.map((i) => i.seq.a);
    for (let i = 1; i < as.length; i++) {
      if (as[i] <= as[i - 1]) { bad(`${label} 编号重复或倒序：${as[i - 1]} → ${as[i]}（${numbered[i].text}）`); good = false; }
    }
  }
  return good;
}

/* ---------------- HTML 检查 ---------------- */
function scanHtml(file, raw) {
  const name = relative(ROOT, file);
  const src = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/i, '');
  // 标签栈
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m, skipUntil = null;
  while ((m = re.exec(src))) {
    const [, close, tag, attrs, selfClose] = m;
    const t = tag.toLowerCase();
    if (skipUntil) { if (close && t === skipUntil) skipUntil = null; continue; }
    if (!close && (t === 'script' || t === 'style')) { skipUntil = t; continue; }
    if (close) {
      if (VOID.has(t)) continue;
      let i = stack.length - 1;
      while (i >= 0 && stack[i].t !== t) i--;
      if (i < 0) { bad(`${name}：多余的 </${t}>`); continue; }
      const unclosed = stack.splice(i);
      for (const u of unclosed.slice(1)) bad(`${name}：<${u.t}> 未闭合（第 ${src.slice(0, u.at).split('\n').length} 行）`);
    } else {
      if (VOID.has(t) || selfClose) continue;
      stack.push({ t, at: m.index });
    }
  }
  for (const u of stack) bad(`${name}：<${u.t}> 未闭合（第 ${src.slice(0, u.at).split('\n').length} 行）`);
  if (stack.length === 0) ok(`${name}：标签全部闭合`);

  // 标题编号
  const heads = [...raw.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/g)]
    .map((x) => ({ level: Number(x[1]), text: x[2].replace(/<[^>]+>/g, '').trim() }))
    .filter((x) => x.text);
  const h2 = heads.filter((x) => x.level === 2).map((x) => ({ text: x.text, seq: seqOf(x.text) }));
  if (h2.length && checkSeq(h2, `${name} h2`)) ok(`${name}：h2 章节编号连续（共 ${h2.length} 节）`);

  // 目录锚点
  const ids = new Set([...raw.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
  const anchors = [...raw.matchAll(/href="#([^"]+)"/g)].map((x) => x[1]);
  const missing = [...new Set(anchors)].filter((a) => !ids.has(a));
  const tocOrdered = anchors.filter((a) => /^[a-z-]+$/.test(a));
  if (missing.length) bad(`${name}：目录锚点找不到对应章节 → ${missing.join('、')}`);
  else if (tocOrdered.length) ok(`${name}：${tocOrdered.length} 个目录锚点全部对得上`);

  // 目录顺序须与正文顺序一致
  if (tocOrdered.length > 1) {
    const pos = tocOrdered.map((a) => raw.indexOf(`id="${a}"`));
    let ordered = true;
    for (let i = 1; i < pos.length; i++) if (pos[i] < pos[i - 1]) ordered = false;
    if (!ordered) bad(`${name}：目录顺序与正文顺序不一致`);
    else ok(`${name}：目录顺序与正文一致`);
  }
}

/* ---------------- Markdown 检查 ---------------- */
function scanMd(file, raw) {
  const name = relative(ROOT, file);
  const lines = raw.split(/\r?\n/);
  const heads = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) return;
    const text = m[2].replace(/[*`_]/g, '').trim();
    heads.push({ level: m[1].length, text, seq: seqOf(text), line: i + 1 });
  });
  if (!heads.length) return;

  // 一级标题只能有一个
  const h1 = heads.filter((h) => h.level === 1);
  if (h1.length > 1) bad(`${name}：有 ${h1.length} 个一级标题（第 ${h1.map((h) => h.line).join('、')} 行）`);

  // 逐级检查同级编号
  const checkLevel = (level, parentIdx, label) => {
    const kids = [];
    for (let i = parentIdx + 1; i < heads.length; i++) {
      if (heads[i].level <= level) break;
      if (heads[i].level === level) kids.push(heads[i]);
    }
    if (kids.length) checkSeq(kids, `${label}`);
    return kids;
  };
  const top = heads.filter((h) => h.level === heads[0].level);
  checkSeq(top, `${name} 顶层`);
  // 分别检查 ## 与 ###
  const h2idx = heads.map((h, i) => (h.level === 2 ? i : -1)).filter((i) => i >= 0);
  h2idx.forEach((i) => checkLevel(3, i, `${name}「${heads[i].text}」下`));
}

/* ---------------- 主流程 ---------------- */
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'out' || e.startsWith('.')) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(html?|md)$/i.test(e)) out.push(p);
  }
  return out;
}

const targets = [
  join(ROOT, 'README.md'),
  ...walk(join(ROOT, 'docs')),
  ...walk(join(ROOT, 'docs-site')),
];

console.log('文档结构与编号自检\n');
for (const f of targets) {
  const raw = readFileSync(f, 'utf-8');
  if (f.endsWith('.md')) scanMd(f, raw); else scanHtml(f, raw);
}

console.log('');
if (fails.length) {
  console.log(`✗ ${fails.length} 项未通过（通过 ${pass} 项）`);
  fails.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log(`✓ 全部通过：${pass} 项，共检查 ${targets.length} 个文档`);
