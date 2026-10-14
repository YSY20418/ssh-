#!/usr/bin/env node
/* ============================================================
   build-medic.mjs —— 把「小医灵」本地医学知识库烤进页面

   数据源：data/medic-kb.json（纯 JSON，人可读可改）
   产  物：public/elder/medic-kb.js（挂 window.XiaoYiLingKB，带匹配器）

   为什么和语料库一样要一道构建工序：
   适老页的第一约束是「双击就能开」（file:// 协议），
   file:// 下 fetch 本地 JSON 会被浏览器当跨域请求拦掉，
   所以知识库必须编译成 <script src> 能加载的 JS 文件，
   再由 build-elder-single.mjs 连同其它脚本一起内联进单文件版。

   本脚本同时是知识库的「质检员」——每一条不过就退出非零：
   1. 三语齐全：meta、红旗、主题、兜底的每种语言块都在，说法与话术非空；
   2. 追问数量：每个主题最多 maxQuestions 个问题，每个问题带 2-4 个点选项；
   3. 来源规矩：每条来源必须有机构与资料名，禁止 url 字段（不编造链接），
      year 若给必须是四位数字；
   4. 说法不撞车：同一语言下，任何说法只能属于一个条目；红旗说法与主题
      说法不允许重复——红旗优先，重复会让主题永远匹配不上；
   5. 禁词：任何面向老人的话术里不得出现诊断、处方、剂量类措辞。

   匹配算法（与页面共用，测试也加载这一份）：
   归一（小写 + 去空白与标点）→ 先扫红旗（最长说法赢）→ 再扫主题
   （最长说法赢，平手看 priority）→ 语言跟随（先当前语言，再另外两门）。

   用法：node scripts/build-medic.mjs   （或 npm run build:medic）
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data', 'medic-kb.json');
const OUT = join(ROOT, 'public', 'elder', 'medic-kb.js');
const BOM = '\uFEFF';

/* 与 medic-kb.js 内保持一致：小写 + 去空白与标点 */
const RE_PUNCT = /[\s，。,.;；:：!！?？'"“”‘’、\-—_/\\()（）[\]]/g;
const norm = (s) => String(s || '').toLowerCase().replace(RE_PUNCT, '');

/* 禁词：面向老人的话术里出现这些，要么是越权诊断，要么是变相开药 */
const BANNED = [
  /你就是/, /你这是[^，。]{0,6}(病|炎|癌)/, /确诊为/, /可以确诊/,
  /应该是(偏头痛|心梗|中风|癌症)/, /处方/, /每次服?[0-9]/, /每日[0-9一二三四五六两]?次/,
  /毫克/, /毫升/, /[0-9]+\s*mg/i, /顿服/, /自行服药/, /建议你吃[^，。]{0,10}(药|片|胶囊)/
];

const problems = [];
const die = (msg) => { problems.push(msg); };

if (!existsSync(SRC)) {
  console.error('✗ 找不到数据源 ' + SRC);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(readFileSync(SRC, 'utf8'));
} catch (err) {
  console.error('✗ JSON 解析失败：' + err.message);
  process.exit(1);
}

const langs = (data.meta && data.meta.langs) || ['zh', 'zh-Hant', 'en'];
const maxQ = (data.meta && data.meta.maxQuestions) || 3;
const seen = new Map(); // `${lang}::${pattern}` -> `${kind}:${id}`
let patternTotal = 0;

function scanBanned(id, where, text) {
  const t = String(text || '');
  for (const re of BANNED) {
    if (re.test(t)) die(`${id}/${where}: 话术里出现禁词（${re}）——「${t.slice(0, 40)}…」`);
  }
}

function checkSources(id, where, sources) {
  if (!Array.isArray(sources) || !sources.length) { die(`${id}/${where}: 来源为空`); return; }
  if (sources.length > 3) die(`${id}/${where}: 来源最多 3 条（当前 ${sources.length}）`);
  for (const s of sources) {
    if (!s || !s.org || !String(s.org).trim()) die(`${id}/${where}: 来源缺少机构名`);
    if (!s || !s.title || !String(s.title).trim()) die(`${id}/${where}: 来源缺少资料名`);
    if (s && 'url' in s) die(`${id}/${where}: 来源不允许写死 url（防止编造与失效，机构+资料名即可追溯）`);
    if (s && s.year !== undefined && !/^\d{4}$/.test(String(s.year))) {
      die(`${id}/${where}: 年份必须是四位数字（当前 ${s.year}）——宁可不写，也不能编`);
    }
  }
}

function checkQuestions(id, where, questions) {
  if (!Array.isArray(questions) || !questions.length) { die(`${id}/${where}: 追问为空`); return; }
  if (questions.length > maxQ) die(`${id}/${where}: 追问最多 ${maxQ} 个（当前 ${questions.length}）`);
  questions.forEach((q, i) => {
    if (!q || !q.q || !String(q.q).trim()) die(`${id}/${where}: 第 ${i + 1} 个问题没有题干`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
      die(`${id}/${where}: 第 ${i + 1} 个问题的点选项必须是 2-4 个（当前 ${q.options ? q.options.length : 0}）`);
    }
    (q.options || []).forEach((o, j) => {
      if (!o || !String(o).trim()) die(`${id}/${where}: 第 ${i + 1} 个问题的第 ${j + 1} 个选项是空的`);
    });
  });
}

/* ---------- meta ---------- */
if (!data.meta || !data.meta.name) die('meta.name 缺失');
for (const lg of langs) {
  const d = data.meta && data.meta.disclaimer;
  if (!d || !d[lg] || !String(d[lg]).trim()) die(`meta.disclaimer 缺少语言 ${lg}`);
  const p = data.meta && data.meta.privacyNote;
  if (!p || !p[lg] || !String(p[lg]).trim()) die(`meta.privacyNote 缺少语言 ${lg}`);
}
for (const lv of ['er', '24h', 'appointment', 'home']) {
  const t = data.meta && data.meta.triageLevels && data.meta.triageLevels[lv];
  if (!t) { die(`triageLevels 缺少分级 ${lv}`); continue; }
  for (const lg of langs) {
    if (!t[lg] || !String(t[lg]).trim()) die(`triageLevels.${lv} 缺少语言 ${lg}`);
  }
}

/* ---------- 红旗 ---------- */
if (!Array.isArray(data.redflags) || data.redflags.length < 1) die('redflags 为空');
for (const rf of data.redflags || []) {
  if (!rf.id) die('有红旗条目没有 id');
  if (typeof rf.priority !== 'number') die(`${rf.id}: 缺少 priority`);
  for (const lg of langs) {
    const b = rf[lg];
    if (!b) { die(`${rf.id}: 缺少语言 ${lg}`); continue; }
    if (!Array.isArray(b.patterns) || !b.patterns.length) { die(`${rf.id}/${lg}: 说法为空`); continue; }
    for (const raw of b.patterns) {
      const p = norm(raw);
      if (!p) { die(`${rf.id}/${lg}: 说法「${raw}」归一化后是空的`); continue; }
      const key = `${lg}::${p}`;
      if (seen.has(key)) die(`${rf.id}/${lg}: 说法「${raw}」与 ${seen.get(key)} 重复`);
      else seen.set(key, `redflag:${rf.id}`);
      patternTotal++;
    }
    if (!b.reply || !String(b.reply).trim()) { die(`${rf.id}/${lg}: 回复为空`); continue; }
    scanBanned(rf.id, lg, b.reply);
  }
}

/* ---------- 主题 ---------- */
if (!Array.isArray(data.topics) || !data.topics.length) die('topics 为空');
const topicIds = new Set();
for (const tp of data.topics || []) {
  if (!tp.id) die('有主题没有 id');
  if (topicIds.has(tp.id)) die(`主题 id 重复：${tp.id}`);
  topicIds.add(tp.id);
  if (typeof tp.priority !== 'number') die(`${tp.id}: 缺少 priority`);
  if (!tp.dept) { die(`${tp.id}: 缺少 dept`); continue; }
  for (const lg of langs) {
    if (!tp.dept[lg] || !String(tp.dept[lg]).trim()) die(`${tp.id}: dept 缺少语言 ${lg}`);
  }
  for (const lg of langs) {
    const b = tp[lg];
    if (!b) { die(`${tp.id}: 缺少语言 ${lg}`); continue; }
    if (!Array.isArray(b.patterns) || !b.patterns.length) { die(`${tp.id}/${lg}: 说法为空`); continue; }
    for (const raw of b.patterns) {
      const p = norm(raw);
      if (!p) { die(`${tp.id}/${lg}: 说法「${raw}」归一化后是空的`); continue; }
      const key = `${lg}::${p}`;
      if (seen.has(key)) die(`${tp.id}/${lg}: 说法「${raw}」与 ${seen.get(key)} 重复`);
      else seen.set(key, `topic:${tp.id}`);
      patternTotal++;
    }
    if (!b.empathy || !String(b.empathy).trim()) { die(`${tp.id}/${lg}: 共情话术为空`); continue; }
    if (!b.redflagHint || !String(b.redflagHint).trim()) { die(`${tp.id}/${lg}: 红旗提示为空`); continue; }
    checkQuestions(tp.id, lg, b.questions);
    if (!b.triage || !String(b.triage).trim()) { die(`${tp.id}/${lg}: 分诊话术为空`); continue; }
    if (!b.edu || !String(b.edu).trim()) { die(`${tp.id}/${lg}: 科普话术为空`); continue; }
    checkSources(tp.id, lg, b.sources);
    for (const w of ['empathy', 'redflagHint', 'triage', 'edu']) scanBanned(tp.id, lg, b[w]);
  }
}

/* ---------- 兜底 ---------- */
for (const lg of langs) {
  const b = data.generic && data.generic[lg];
  if (!b) { die(`generic: 缺少语言 ${lg}`); continue; }
  if (!b.empathy || !String(b.empathy).trim()) die(`generic/${lg}: 共情话术为空`);
  checkQuestions('generic', lg, b.questions);
  if (!b.triage || !String(b.triage).trim()) die(`generic/${lg}: 分诊话术为空`);
  if (!b.edu || !String(b.edu).trim()) die(`generic/${lg}: 科普话术为空`);
  checkSources('generic', lg, b.sources);
  for (const w of ['empathy', 'triage', 'edu']) scanBanned('generic', lg, b[w]);
}

if (problems.length) {
  console.error(`✗ 知识库质检未通过（${problems.length} 个问题）：`);
  problems.forEach((p) => console.error('   · ' + p));
  process.exit(1);
}

/* ---------- 编译 ---------- */
const payload = JSON.stringify({
  meta: data.meta,
  redflags: data.redflags,
  topics: data.topics,
  generic: data.generic
});

const js = `${BOM}/* ============================================================
   小医灵 · 本地医学知识库（编译产物，勿手改）
   数据源：data/medic-kb.json —— 改话术请改那里，再跑 npm run build:medic
   由 scripts/build-medic.mjs 生成：五条硬规则质检 + 编译
   ============================================================ */
(function (g) {
  'use strict';
  var DATA = ${payload};

  /* 与语料库同一套归一化：小写 + 去空白与标点；中文不分词，靠子串匹配 */
  var RE_PUNCT = /[\\s，。,.;；:：!！?？'"“”‘’、\\-_/\\\\()（）[\\]]/g;
  function norm(s) { return String(s || '').toLowerCase().replace(RE_PUNCT, ''); }

  var LANGS = (DATA.meta && DATA.meta.langs) || ['zh', 'zh-Hant', 'en'];

  /* 兜底话术的数据先存一份：下面 DATA.generic 要让位给取值函数，
     不存这份的话数据会被同名函数覆盖，页面里就走不了兜底流程。 */
  var GENERIC = DATA.generic;

  /* 每种语言的说法提前归一化：匹配时不再做正则，纯字符串 indexOf */
  var PREP = {
    redflags: (DATA.redflags || []).map(function (it) {
      var per = {};
      LANGS.forEach(function (lg) {
        per[lg] = (it[lg] && it[lg].patterns || []).map(function (raw) {
          var p = norm(raw);
          return { p: p, len: p.length, raw: raw };
        }).filter(function (x) { return x.p; });
      });
      return { id: it.id, priority: it.priority || 0, per: per };
    }),
    topics: (DATA.topics || []).map(function (it) {
      var per = {};
      LANGS.forEach(function (lg) {
        per[lg] = (it[lg] && it[lg].patterns || []).map(function (raw) {
          var p = norm(raw);
          return { p: p, len: p.length, raw: raw };
        }).filter(function (x) { return x.p; });
      });
      return { id: it.id, priority: it.priority || 0, dept: it.dept || null, per: per };
    })
  };

  function langOrder(lang) {
    var l = LANGS.indexOf(lang) >= 0 ? lang : LANGS[0];
    return [l].concat(LANGS.filter(function (x) { return x !== l; }));
  }

  /* 在一组条目里找「最长说法赢」，平手看 priority（小的赢），再平手看语言顺序 */
  function scan(list, t, order) {
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      for (var li = 0; li < order.length; li++) {
        var lg = order[li];
        var arr = it.per[lg];
        if (!arr) continue;
        for (var k = 0; k < arr.length; k++) {
          if (t.indexOf(arr[k].p) < 0) continue;
          var cand = { item: it, lang: lg, pattern: arr[k].raw, len: arr[k].len, li: li };
          if (!best) { best = cand; continue; }
          if (cand.len > best.len) { best = cand; continue; }
          if (cand.len === best.len && it.priority < best.item.priority) best = cand;
        }
      }
    }
    return best;
  }

  /* 对外主入口：先红旗（安全优先），后主题；命中返回 { kind, id, pattern, lang } */
  DATA.match = function (text, lang) {
    var t = norm(text);
    if (!t) return null;
    var order = langOrder(lang);
    var rf = scan(PREP.redflags, t, order);
    if (rf) {
      return { kind: 'redflag', id: rf.item.id, lang: rf.lang, pattern: rf.pattern, score: rf.len };
    }
    var tp = scan(PREP.topics, t, order);
    if (tp) {
      return { kind: 'topic', id: tp.item.id, lang: tp.lang, pattern: tp.pattern, score: tp.len };
    }
    return null;
  };

  function block(id, lang, kind) {
    var list = kind === 'redflag' ? DATA.redflags : DATA.topics;
    var order = langOrder(lang);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      for (var li = 0; li < order.length; li++) {
        var b = list[i][order[li]];
        if (b) return { entry: list[i], body: b, lang: order[li] };
      }
    }
    return null;
  }

  /* 取一条红旗 / 一个主题 / 兜底话术（语言跟随，界面语言没有就退回中文） */
  DATA.redflag = function (id, lang) { return block(id, lang, 'redflag'); };
  DATA.topic = function (id, lang) { return block(id, lang, 'topic'); };
  DATA.generic = function (lang) {
    var order = langOrder(lang);
    for (var i = 0; i < order.length; i++) {
      if (GENERIC && GENERIC[order[i]]) return { body: GENERIC[order[i]], lang: order[i] };
    }
    return null;
  };

  /* 把来源数组格式化成「来源：机构 · 资料名（年份）」；年份宁缺勿编 */
  DATA.cite = function (sources, lang) {
    if (!Array.isArray(sources) || !sources.length) return '';
    var parts = sources.map(function (s) {
      return s.title ? (s.org + ' · ' + s.title) : s.org;
    });
    return parts.join('；');
  };

  /* 主题名（用于点选 chips 与回显） */
  DATA.topicName = function (id, lang) {
    var tp = DATA.topic(id, lang);
    if (!tp || !tp.body || !tp.body.patterns || !tp.body.patterns.length) return id;
    return tp.body.patterns[0];
  };

  DATA.stats = function () {
    var rf = 0, tp = 0;
    LANGS.forEach(function (lg) {
      (DATA.redflags || []).forEach(function (x) { rf += (x[lg] && x[lg].patterns || []).length; });
      (DATA.topics || []).forEach(function (x) { tp += (x[lg] && x[lg].patterns || []).length; });
    });
    return {
      redflags: (DATA.redflags || []).length,
      topics: (DATA.topics || []).length,
      patterns: rf + tp,
      redflagPatterns: rf,
      topicPatterns: tp,
      langs: LANGS.length
    };
  };

  g.XiaoYiLingKB = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
`;

writeFileSync(OUT, js, 'utf8');
console.log(`✓ medic-kb.js 已生成（${(Buffer.byteLength(js, 'utf8') / 1024).toFixed(1)} KB）`);
console.log(`   红旗 ${data.redflags.length} 类 · 主题 ${data.topics.length} 个 · 三语说法 ${patternTotal} 条`);
console.log('   产物：' + OUT);
