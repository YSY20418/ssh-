#!/usr/bin/env node
/* ============================================================
   build-corpus.mjs —— 把本地对话数据库「烤」进页面

   数据源：data/corpus.json（纯 JSON，人可读可改，这就是「本地数据库」）
   产  物：public/elder/corpus.js（挂 window.XiaoYuErCorpus，带匹配器）

   为什么要一道构建工序，而不是页面直接 fetch JSON：
   适老页的第一约束是「双击就能开」（file:// 协议）。
   file:// 下 fetch 本地 JSON 会被浏览器当跨域请求拦掉，
   所以数据库必须编译成 <script src> 能加载的 JS 文件，
   再由 build-elder-single.mjs 连同其它脚本一起内联进单文件版。

   本脚本同时是数据库的「质检员」——下面每一条不过就退出非零：
   1. 每个意图三语齐全，说法与回复都非空；
   2. guide 意图必须给出全部步骤的话术（0..steps-1）；
   3. 同一语言下，任何说法只能属于一个意图（消除歧义）；
   4. 说法不能归一化成空串（纯标点的说法永远匹配不上，是脏数据）；
   5. 回复里不允许残留未定义的占位符（只允许 {step} {name}）。

   用法：node scripts/build-corpus.mjs   （或 npm run build:corpus）
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data', 'corpus.json');
const OUT = join(ROOT, 'public', 'elder', 'corpus.js');

/* 与 ai.js / corpus.js 保持一致：小写 + 去空白与标点。
   中文不分词，匹配靠「说法是句子的子串」，所以标点必须两边都去掉。 */
const RE_PUNCT = /[\s，。,.;；:：!！?？'"“”‘’、\-—_/\\()（）[\]]/g;
const norm = (s) => String(s || '').toLowerCase().replace(RE_PUNCT, '');

const problems = [];
const die = (msg) => { problems.push(msg); };

if (!existsSync(SRC)) {
  console.error('✗ 找不到数据源 ' + SRC);
  process.exit(1);
}

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const langs = (data.meta && data.meta.langs) || ['zh', 'zh-Hant', 'en'];
const stepCount = (data.meta && data.meta.steps) || 6;
const seen = new Map(); // `${lang}::${pattern}` -> intentId
let patternTotal = 0;

if (!Array.isArray(data.intents) || !data.intents.length) die('intents 为空');

for (const it of data.intents) {
  if (!it.id) die('有意图没有 id');
  if (!['chat', 'guide'].includes(it.kind)) die(`${it.id}: kind 必须是 chat 或 guide（当前 ${it.kind}）`);
  if (typeof it.priority !== 'number') die(`${it.id}: 缺少 priority`);
  for (const lg of langs) {
    const b = it[lg];
    if (!b) { die(`${it.id}: 缺少语言 ${lg}`); continue; }
    if (!Array.isArray(b.patterns) || !b.patterns.length) { die(`${it.id}/${lg}: 说法为空`); continue; }
    for (const raw of b.patterns) {
      const p = norm(raw);
      if (!p) { die(`${it.id}/${lg}: 说法「${raw}」归一化后是空的`); continue; }
      const key = `${lg}::${p}`;
      if (seen.has(key)) die(`${it.id}/${lg}: 说法「${raw}」与意图 ${seen.get(key)} 重复`);
      else seen.set(key, it.id);
      patternTotal++;
    }
    if (it.kind === 'guide') {
      if (!b.steps) { die(`${it.id}/${lg}: guide 意图缺少 steps`); continue; }
      for (let s = 0; s < stepCount; s++) {
        const tpl = b.steps[String(s)];
        if (!tpl || !String(tpl).trim()) die(`${it.id}/${lg}: 缺少第 ${s} 步的话术`);
      }
    } else if (!Array.isArray(b.replies) || !b.replies.length) {
      die(`${it.id}/${lg}: chat 意图的回复为空`);
    }
    const texts = it.kind === 'guide' ? Object.values(b.steps || {}) : (b.replies || []);
    for (const t of texts) {
      const bad = String(t).match(/\{[a-z_]+\}/g);
      const unknown = (bad || []).filter((x) => x !== '{step}' && x !== '{name}');
      if (unknown.length) die(`${it.id}/${lg}: 回复含未知占位符 ${unknown.join(',')}（只允许 {step} {name}）`);
    }
  }
}

if (problems.length) {
  console.error('✗ 语料库校验未通过（%d 处）：', problems.length);
  for (const p of problems.slice(0, 40)) console.error('   - ' + p);
  if (problems.length > 40) console.error('   …还有 ' + (problems.length - 40) + ' 处');
  process.exit(1);
}

/* ---------- 统计（写进产物头部，也供测试断言） ---------- */
const perLang = {};
for (const lg of langs) {
  perLang[lg] = data.intents.reduce((n, it) => n + (it[lg] ? it[lg].patterns.length : 0), 0);
}

/* ---------- 生成 corpus.js ---------- */
const banner = `/* ============================================================
   小鱼儿 · 对话语料库（自动生成，请勿手改）
   数据源：data/corpus.json ｜ 重新生成：npm run build:corpus
   沙盒测试：npm run check:corpus（1000+ 条对话逐条识别 + 测速）

   意图 ${data.intents.length} 个 ｜ 说法 ${patternTotal} 条（${langs.map((l) => l + ' ' + perLang[l]).join('，')}）

   对外只暴露一个入口：XiaoYuErCorpus.match(text, lang, ctx)
     text  归一化前的原话（内部自己去标点、小写）
     lang  当前界面语言（'zh' | 'zh-Hant' | 'en'）
     ctx   { step: 当前步骤号, name: 当前步骤名 }（guide 意图用）
   返回 { id, kind, lang, pattern, reply, score } 或 null（没命中）
   规则：同一语言下说法不重复；最长说法赢；一样长时优先级小的意图赢。
   ============================================================ */
`;

const body = `
(function (g) {
  'use strict';
  var DATA = ${JSON.stringify(data, null, 2)};

  var LANGS = DATA.meta.langs;
  var STEPS = DATA.meta.steps;
  var RE_PUNCT = /[\\s，。,.;；:：!！?？'"“”‘’、\\-_/\\\\()[\\]\\[\\]]/g;
  function norm(s) { return String(s || '').toLowerCase().replace(RE_PUNCT, ''); }

  /* 预编译：按（优先级, id）排好序，每种语言的说法提前归一化，
     这样一次匹配只是若干次 indexOf，不重复做正则。 */
  var PREP = DATA.intents.slice().sort(function (a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id < b.id ? -1 : 1;
  }).map(function (it) {
    var byLang = {};
    LANGS.forEach(function (lg) {
      var b = it[lg];
      byLang[lg] = (b && b.patterns) ? b.patterns.map(function (raw) {
        var p = norm(raw);
        return p ? { p: p, len: p.length, raw: raw } : null;
      }).filter(Boolean) : [];
    });
    return { it: it, byLang: byLang };
  });

  /* 回复轮换：同一意图连问多次时换着说，避免老人看到复读机 */
  var rot = {};

  DATA.match = function (text, lang, ctx) {
    var t = norm(text);
    if (!t) return null;
    ctx = ctx || {};
    var order = [lang].concat(LANGS.filter(function (l) { return l !== lang; }));
    var best = null;
    for (var k = 0; k < PREP.length; k++) {
      var e = PREP[k];
      var hit = null, hitLang = '';
      for (var li = 0; li < order.length; li++) {
        var arr = e.byLang[order[li]] || [];
        for (var pi = 0; pi < arr.length; pi++) {
          var f = arr[pi];
          if (t.indexOf(f.p) >= 0 && (!hit || f.len > hit.len)) { hit = f; hitLang = order[li]; }
        }
      }
      if (hit && (!best || hit.len > best.hit.len)) best = { e: e, hit: hit, lang: hitLang };
    }
    if (!best) return null;

    var it = best.e.it;
    var lg = best.lang;
    var bucket = it[lg] || it[LANGS[0]];
    var out = { id: it.id, kind: it.kind, lang: lg, pattern: best.hit.raw, score: best.hit.len };

    if (it.kind === 'guide') {
      var step = (ctx.step == null) ? 0 : ctx.step;
      var tpl = bucket.steps && bucket.steps[String(step)];
      if (!tpl) tpl = bucket.steps && bucket.steps['0'];
      out.step = step;
      out.reply = String(tpl || '')
        .split('{step}').join(String(step))
        .split('{name}').join(ctx.name == null ? '' : ctx.name);
    } else {
      var key = it.id + '@' + lg;
      var reps = bucket.replies || [];
      var n = rot[key] || 0;
      out.reply = reps[n % reps.length];
      rot[key] = n + 1;
    }
    return out;
  };

  DATA.stats = function () {
    var per = {};
    LANGS.forEach(function (lg) {
      per[lg] = DATA.intents.reduce(function (n, it) { return n + (it[lg] ? it[lg].patterns.length : 0); }, 0);
    });
    return { intents: DATA.intents.length, patterns: Object.keys(per).reduce(function (a, k) { return a + per[k]; }, 0), perLang: per, version: DATA.version };
  };

  g.XiaoYuErCorpus = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
`;

writeFileSync(OUT, '\uFEFF' + banner + body, 'utf8');
console.log('✓ 语料库已生成 public/elder/corpus.js');
console.log(`  意图 ${data.intents.length} 个 ｜ 说法 ${patternTotal} 条（${langs.map((l) => l + ' ' + perLang[l]).join('，')}）`);
console.log(`  产物大小 ${(Buffer.byteLength('\uFEFF' + banner + body)).toLocaleString()} 字节`);
