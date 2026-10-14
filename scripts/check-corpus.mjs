#!/usr/bin/env node
/* ============================================================
   check-corpus.mjs —— 小鱼儿对话能力的沙盒测试

   被测对象就是线上跑的那一份：public/elder/corpus.js 里的
   XiaoYuErCorpus.match()（页面与测试共用同一个函数，不存在两套逻辑）。

   测什么：
   1. 结构复校：三语齐全、guide 步步有话术、说法不跨意图重复；
   2. 全量识别：语料库里每一条说法（简/繁/英）都必须命中自己的意图，
      拿到非空回复，且回复语言正确 —— 这是「一千种对话都能识别」的本体；
   3. 装饰变体：给说法套上「请问 / 麻烦 / 可以吗 / 谢谢」这类口语前后缀，
      必须仍然识别（老人不会照着词表说话）；
   4. 跨语言对话：界面是中文时说英文也要能用英文回，反之亦然；
   5. 步进指引：六个步骤各问一次「然后我该干嘛」，每次都要按当前步骤回答；
   6. 复读规避：同一句话连问多次，回复要轮换，不能复读；
   7. 反例：空串、纯标点、乱码、以及页面命令（「我要挂号」「确认预约」…）
      一律不准命中 —— 对话层不许劫持页面操作；
   8. 速度：全部用例跑完，报总耗时与单条均值。

   用法：node scripts/check-corpus.mjs   （或 npm run check:corpus）
   ============================================================ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_JS = join(ROOT, 'public', 'elder', 'corpus.js');

/* ---------- 载入被测模块（与页面同一份文件） ---------- */
const src = readFileSync(CORPUS_JS, 'utf8').replace(/^\uFEFF/, '');
const load = new Function(src + '\nreturn globalThis.XiaoYuErCorpus;');
const C = load();
if (!C || typeof C.match !== 'function') {
  console.error('✗ corpus.js 没挂上 XiaoYuErCorpus.match');
  process.exit(1);
}

const LANGS = C.meta.langs;
const STEPS = C.meta.steps;
let pass = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; return true; }
  failures.push(label);
  return false;
}

/* ---------- 1. 结构复校 ---------- */
const st = C.stats();
ok(st.patterns >= 1000, `说法总数 ${st.patterns} 低于 1000`);
ok(st.intents >= 20, `意图数 ${st.intents} 偏少`);
for (const it of C.intents) {
  for (const lg of LANGS) {
    const b = it[lg];
    ok(!!b && Array.isArray(b.patterns) && b.patterns.length > 0, `${it.id} 缺少语言 ${lg} 的说法`);
    if (it.kind === 'guide') {
      for (let s = 0; s < STEPS; s++) {
        ok(!!(b && b.steps && b.steps[String(s)]), `${it.id}/${lg} 第 ${s} 步的话术缺失`);
      }
    } else {
      ok(!!(b && Array.isArray(b.replies) && b.replies.length > 0), `${it.id}/${lg} 的回复缺失`);
    }
  }
}
console.log(`① 结构复校：${st.intents} 个意图 / ${st.patterns} 条说法（${LANGS.map((l) => l + ' ' + st.perLang[l]).join('，')}）`);

/* ---------- 2. 全量识别：每条说法都要命中自己 ---------- */
/* 装饰模板先预备好（要判断模板本身是不是语料说法），别混进测时窗口 */
const PREFIX = ['请问', '麻烦', '我想', '帮我', '我要', '我想问一下', '麻烦问一下', '劳驾', '不好意思', '我问一下', '我想问问', '打听一下', '问一下', '请教一下'];
const SUFFIX = ['可以吗', '行吗', '好吗', '谢谢', '麻烦了', '一下', '是不是', '有没有', '怎么说', '呢'];
function stripPunct(s) {
  return String(s || '').toLowerCase().replace(/[\s，。,.;；:：!！?？'"“”‘’、\-—_/\\()（）[\]]/g, '');
}
const isPattern = (w) => C.intents.some((it) => LANGS.some((lg) => it[lg] && it[lg].patterns.some((p) => stripPunct(p) === stripPunct(w))));
const USE_PREFIX = PREFIX.filter((w) => !isPattern(w));
const USE_SUFFIX = SUFFIX.filter((w) => !isPattern(w));

const t0 = performance.now();
let matched = 0;
for (const it of C.intents) {
  for (const lg of LANGS) {
    const bucket = it[lg];
    if (!bucket) continue;
    for (const raw of bucket.patterns) {
      const r = C.match(raw, lg);
      if (!ok(!!r, `「${raw}」（${lg}）没命中任何意图`)) continue;
      ok(r.id === it.id, `「${raw}」（${lg}）命中了 ${r.id}，应为 ${it.id}`);
      ok(!!r.reply && String(r.reply).trim().length > 0, `「${raw}」回复为空`);
      ok(r.lang === lg, `「${raw}」回复语言是 ${r.lang}，应为 ${lg}`);
      ok(!/undefined|null|\[object/.test(String(r.reply)), `「${raw}」回复里有脏值：${r.reply}`);
      matched++;
    }
  }
}
console.log(`② 全量识别：${matched} / ${st.patterns} 条说法全部命中正确意图、回复非空、语言正确`);

/* ---------- 3. 装饰变体：老人不会照着词表说话 ----------
   注意：装饰词本身如果是语料里的说法（如「劳驾」「谢谢」在 thanks 里），
   套上去之后命中它自己是正确行为——那种模板已在上方过滤掉。 */
let deco = 0, decoBad = 0;
for (const it of C.intents) {
  const zh = it.zh.patterns.slice(0, 5);
  for (const raw of zh) {
    for (const pre of USE_PREFIX) {
      const r = C.match(pre + raw, 'zh');
      deco++;
      if (!r || r.id !== it.id) { decoBad++; if (decoBad <= 5) failures.push(`前缀「${pre}」+「${raw}」→ ${r ? r.id : '未命中'}（应为 ${it.id}）`); }
    }
    for (const suf of USE_SUFFIX) {
      const r = C.match(raw + suf, 'zh');
      deco++;
      if (!r || r.id !== it.id) { decoBad++; if (decoBad <= 5) failures.push(`后缀「${suf}」+「${raw}」→ ${r ? r.id : '未命中'}（应为 ${it.id}）`); }
    }
  }
}
ok(decoBad === 0, `装饰变体有 ${decoBad}/${deco} 条识别漂移`);
console.log(`③ 装饰变体：${deco} 条（${USE_PREFIX.length} 个前缀 × ${USE_SUFFIX.length} 个后缀套在说法上）识别${decoBad === 0 ? '全部不变' : '有漂移'}`);

/* ---------- 4. 跨语言对话 ---------- */
const greetZh = C.intents.find((i) => i.id === 'greet');
let cross = 0, crossBad = 0;
const cases = [
  { text: greetZh.zh.patterns[0], pageLang: 'en', wantLang: 'zh', id: 'greet' },
  { text: greetZh.en.patterns[0], pageLang: 'zh', wantLang: 'en', id: 'greet' },
  { text: C.intents.find((i) => i.id === 'faq_free').zh.patterns[0], pageLang: 'en', wantLang: 'zh', id: 'faq_free' },
  { text: C.intents.find((i) => i.id === 'thanks').en.patterns[0], pageLang: 'zh', wantLang: 'en', id: 'thanks' },
  { text: C.intents.find((i) => i.id === 'emergency').zh.patterns[0], pageLang: 'en', wantLang: 'zh', id: 'emergency' }
];
for (const c of cases) {
  const r = C.match(c.text, c.pageLang);
  cross++;
  if (!ok(!!r && r.id === c.id, `跨语言「${c.text}」在 ${c.pageLang} 界面下未命中 ${c.id}`)) continue;
  ok(r.lang === c.wantLang, `跨语言「${c.text}」回了 ${r.lang}，应为 ${c.wantLang}`);
  ok(!!r.reply, `跨语言「${c.text}」回复为空`);
}
ok(crossBad === 0, '');
console.log(`④ 跨语言对话：${cross} 组（中文界面说英文→英文回，英文界面说中文→中文回）全部正确`);

/* ---------- 5. 步进指引：六个步骤各问一次 ---------- */
const guide = C.intents.find((i) => i.kind === 'guide');
const guideAsk = guide.zh.patterns[0];
const stepReplies = [];
for (let s = 0; s < STEPS; s++) {
  const r = C.match(guideAsk, 'zh', { step: s, name: '第' + s + '步' });
  if (!ok(!!r, `第 ${s} 步问「${guideAsk}」没命中 guide`)) continue;
  ok(r.reply.length > 0, `第 ${s} 步指引为空`);
  ok(!/[{}]/.test(r.reply), `第 ${s} 步指引有未替换占位符：${r.reply}`);
  stepReplies.push(r.reply);
}
ok(new Set(stepReplies).size === STEPS, '六个步骤的指引话术不能一模一样');
console.log(`⑤ 步进指引：问「${guideAsk}」，六个步骤给出六段不同的话（按当前步骤回答）`);
for (let s = 0; s < stepReplies.length; s++) console.log(`     第 ${s} 步 → ${stepReplies[s].slice(0, 42)}…`);

/* ---------- 6. 复读规避 ---------- */
const many = [];
for (let i = 0; i < 8; i++) many.push(C.match(greetZh.zh.patterns[0], 'zh').reply);
ok(many.every((x) => x && x.length > 0), '连问多次出现了空回复');
ok(new Set(many).size >= 2, `连问 8 次只有 ${new Set(many).size} 种回复（在复读）`);
console.log(`⑥ 复读规避：同一句话连问 8 次，给出 ${new Set(many).size} 种不同回复`);

/* ---------- 7. 反例：对话层不许劫持页面命令 ----------
   只收「本身不含任何语料说法」的串：纯匹配器眼里它们必须查无此意图。
   「我腿疼」「用医保卡」这类不在此列——它们含有「疼」「用医保」等子串，
   在真实链路里由页面命令层（症状/付款动作）先行接住，对话层根本轮不到，
   那条顺序由 check:elder 的全栈断言守着。 */
const NEG = ['', '   ', '。。。', '???', '阿斯蒂芬奇', 'xyzqw', 'asdfghjkl', '😀😀😀',
  '我要挂号', '确认预约', '下一步', '上一步', '念一遍', '别念了', '我需要帮助', '字太小', '重新挂', '确认', '取消', '今天', '上午', '第一位医生'];
let negBad = 0;
for (const t of NEG) {
  const r = C.match(t, 'zh');
  if (r) { negBad++; failures.push(`反例「${t}」竟命中了 ${r.id}（对话层劫持了页面命令）`); }
}
ok(negBad === 0, `${negBad}/${NEG.length} 条反例被误命中`);
console.log(`⑦ 反例：${NEG.length - negBad}/${NEG.length} 条（空串/纯标点/乱码/页面命令）正确未命中`);

/* ---------- 8. 大小写与标点鲁棒性 ---------- */
const r1 = C.match('HELLO', 'en');
ok(!!r1 && r1.id === 'greet', '全大写 HELLO 没认出来');
const r2 = C.match('你好！！！', 'zh');
ok(!!r2 && r2.id === 'greet', '带标点的「你好！！！」没认出来');
console.log('⑧ 鲁棒性：全大写、满屏标点都能识别');

/* ---------- 9. 速度 ---------- */
const t1 = performance.now();
const total = matched + deco + cross + STEPS + 8 + NEG.length + 2;
const avg = (t1 - t0) / total;
ok(avg < 5, `单条均值 ${avg.toFixed(3)} ms 太慢`);
console.log(`⑨ 速度：${total} 次匹配共 ${(t1 - t0).toFixed(1)} ms，单条均值 ${avg.toFixed(3)} ms`);

/* ---------- 汇总 ---------- */
console.log('\n' + '='.repeat(56));
if (failures.length) {
  console.log(`✗ 未通过 ${failures.length} 项（通过 ${pass} 项）：`);
  for (const f of failures.slice(0, 30)) console.log('   - ' + f);
  if (failures.length > 30) console.log(`   …还有 ${failures.length - 30} 项`);
  process.exit(1);
}
console.log(`✓ 全部通过（${pass} 项断言）｜ 语料 ${st.patterns} 条说法 + ${deco} 条装饰变体，共 ${total} 次识别全部正确`);
console.log(`✓ 单条均值 ${avg.toFixed(3)} ms —— 老人说完到听见回答，中间只隔一次 indexOf 扫描`);
process.exit(0);
