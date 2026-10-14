#!/usr/bin/env node
/* ============================================================
   check-medic.mjs —— 小医灵沙盒测试

   和语料库同一思路：纯匹配部分直接 new Function 加载线上那一份
   medic-kb.js（页面与测试共用同一个 match，不存在两套逻辑）；
   会话引擎、形态状态机、麦克风授权在 jsdom 里加载真实页面跑。

   十组断言：
     A 结构复校      知识库规模、meta、四级分诊、免责声明三语齐全
     B 全量识别      每一条说法都必须命中它自己的条目
     C 红旗优先      红旗词与症状词混排，必须判成红旗（安全优先）
     D 装饰变体      套上「麻烦问一下…谢谢」仍认得出是同一条
     E 跨语言        跟着界面语言找不到，就找另外两门
     F 会话流程      共情 → 红旗筛查 → 最多 3 问 → 四级分诊 → 来源
     G 禁止事项      任何话术不得出现诊断 / 处方 / 剂量措辞
     H 隐私          不索要身份信息，并主动提醒不要发送
     I 速度          单条匹配均值
     J 麦克风一次    全页共用一次授权，不重复弹窗、不重复查询
   ============================================================ */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ELDER = path.join(ROOT, 'public', 'elder');
const PAGE = path.join(ELDER, 'index.html');
const KB_FILE = path.join(ELDER, 'medic-kb.js');

/* ---------- 断言小框架 ---------- */
const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (err) {
    results.push({ name, ok: false, detail: err && err.message ? err.message : String(err) });
  }
}
async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (err) {
    results.push({ name, ok: false, detail: err && err.message ? err.message : String(err) });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }

/* ---------- 加载线上那一份 medic-kb.js（与页面同一份代码） ---------- */
function loadKb() {
  const src = readFileSync(KB_FILE, 'utf8');
  const fn = new Function('window', src + '\nreturn window.XiaoYiLingKB;');
  return fn({});
}
const KB = loadKb();
const LANGS = (KB.meta && KB.meta.langs) || ['zh', 'zh-Hant', 'en'];

/* 禁词：与 build-medic.mjs 同一套标准，独立再查一遍（双保险） */
const BANNED = [
  /你就是/, /你这是[^，。]{0,6}(病|炎|癌)/, /确诊为/, /可以确诊/,
  /应该是(偏头痛|心梗|中风|癌症)/, /处方/, /每次服?[0-9]/, /每日[0-9一二三四五六两]?次/,
  /毫克/, /毫升/, /[0-9]+\s*mg/i, /顿服/, /自行服药/, /建议你吃[^，。]{0,10}(药|片|胶囊)/
];

/* ============================================================
   A 结构复校
   ============================================================ */
check('A1 知识库规模：10 类红旗 + 12 个主题 + 三语说法', () => {
  const st = KB.stats();
  assert(st.redflags === 10, `红旗应是 10 类，实际 ${st.redflags}`);
  assert(st.topics === 12, `主题应是 12 个，实际 ${st.topics}`);
  assert(st.patterns >= 500, `三语说法应不少于 500 条，实际 ${st.patterns}`);
  assert(st.langs === 3, '应支持三语');
  return `红旗 ${st.redflags} 类 · 主题 ${st.topics} 个 · 三语说法 ${st.patterns} 条`;
});

check('A2 免责声明与隐私提醒三语齐全', () => {
  for (const lg of LANGS) {
    assert(KB.meta.disclaimer[lg] && KB.meta.disclaimer[lg].length > 10, `disclaimer/${lg} 缺失`);
    assert(KB.meta.privacyNote[lg] && KB.meta.privacyNote[lg].length > 5, `privacyNote/${lg} 缺失`);
  }
  assert(/不能替代|cannot|diagnose/i.test(KB.meta.disclaimer.zh), '中文免责声明没有「不能替代」');
  return '三语免责声明 + 三语隐私提醒都在';
});

check('A3 四级分诊标签齐全（er / 24h / appointment / home）', () => {
  for (const lv of ['er', '24h', 'appointment', 'home']) {
    for (const lg of LANGS) {
      const t = KB.meta.triageLevels[lv][lg];
      assert(t && String(t).trim(), `分级 ${lv}/${lg} 缺失`);
    }
  }
  return '四级 × 三语 = 12 个分级标签齐全';
});

check('A4 每个主题三语字段齐全（共情/红旗提示/追问/分诊/科普/来源）', () => {
  const need = ['empathy', 'redflagHint', 'questions', 'triage', 'edu', 'sources'];
  for (const tp of KB.topics) {
    for (const lg of LANGS) {
      const b = tp[lg];
      assert(b, `${tp.id}/${lg} 缺失`);
      for (const k of need) assert(b[k], `${tp.id}/${lg} 缺 ${k}`);
      assert(b.questions.length <= KB.meta.maxQuestions, `${tp.id}/${lg} 追问超过 ${KB.meta.maxQuestions} 个`);
      for (const q of b.questions) {
        assert(q.options && q.options.length >= 2, `${tp.id}/${lg} 有问题没带点选项`);
      }
      for (const s of b.sources) {
        assert(s.org && s.title, `${tp.id}/${lg} 有来源缺机构或资料名`);
        assert(!('url' in s), `${tp.id}/${lg} 来源写死了 url`);
      }
    }
  }
  return '12 主题 × 3 语 × 6 字段全部在位，来源只写机构与资料名';
});

/* ============================================================
   B 全量识别：每条说法都必须命中自己
   ============================================================ */
check('B1 全量识别：520 条三语说法逐条命中正确条目', () => {
  let total = 0, wrong = 0;
  const scan = (list, kind) => {
    for (const it of list) {
      for (const lg of LANGS) {
        for (const raw of (it[lg] && it[lg].patterns) || []) {
          total++;
          const m = KB.match(raw, lg);
          if (!m || m.kind !== kind || m.id !== it.id) {
            wrong++;
            if (wrong <= 5) console.log(`   ✗ ${kind}/${it.id}/${lg}: 「${raw}」→ ${JSON.stringify(m)}`);
          }
        }
      }
    }
  };
  scan(KB.redflags, 'redflag');
  scan(KB.topics, 'topic');
  assert(wrong === 0, `${wrong}/${total} 条说法没有命中自己的条目`);
  return `${total} 条说法全部命中正确条目`;
});

/* ============================================================
   C 红旗优先：混排必须判红旗
   ============================================================ */
check('C1 红旗优先——症状词与红旗词混排，一律按急症处理', () => {
  /* 混排句子可能同时踩中多条红旗（「抽搐」既属意识障碍也属儿童急症），
     两条都通向急症劝导，所以只要求判成红旗；单一意图的句子才要求具体 id。 */
  const anyFlag = [
    '我头痛得厉害，而且胸口疼出大汗',
    '本来拉肚子，现在想自杀',
    '孩子发烧还抽搐了',
    '头晕，突然一边手脚没力气',
    '我胃疼，大便黑色还呕血',
    '怀孕了肚子痛得厉害',
    '喉咙发紧，还喘不上气'   // 同时踩中「喘不上气」与「喉咙发紧」，两条都是急症
  ];
  for (const text of anyFlag) {
    const m = KB.match(text, 'zh');
    assert(m && m.kind === 'redflag', `「${text}」应判成红旗，实际 ${JSON.stringify(m)}`);
  }
  const exact = [
    ['我妈嘴歪了，一边手抬不起来', 'stroke'],
    ['高烧三天了，退烧药也不管用', 'high_fever'],
    ['突然头痛得像要裂开', 'thunder_headache'],
    ['我胸口疼，还出大汗', 'chest_pain']
  ];
  for (const [text, id] of exact) {
    const m = KB.match(text, 'zh');
    assert(m && m.kind === 'redflag' && m.id === id, `「${text}」应命中红旗 ${id}，实际 ${JSON.stringify(m)}`);
  }
  return `${anyFlag.length} 个混排 + ${exact.length} 个单意图句子全部按急症处理`;
});

check('C2 红旗不误伤普通症状——「头痛」 alone 走主题，不走急症', () => {
  const m = KB.match('我头痛三天了', 'zh');
  assert(m && m.kind === 'topic' && m.id === 'headache', `「头痛」应命中主题，实际 ${JSON.stringify(m)}`);
  const m2 = KB.match('就是有点拉肚子', 'zh');
  assert(m2 && m2.kind === 'topic' && m2.id === 'diarrhea', `「拉肚子」应命中主题，实际 ${JSON.stringify(m2)}`);
  return '普通症状照旧走问诊，不制造恐慌';
});

/* ============================================================
   D 装饰变体
   ============================================================ */
check('D1 装饰变体：客气话包着的症状照样认得出', () => {
  const PREFIX = ['麻烦问一下', '请问', '我想问下', '老人家想问', '帮我问问', '劳驾', '请问一下'];
  const SUFFIX = ['谢谢', '麻烦了', '呢', '严重吗', '要不要紧'];
  const probes = [
    ['我胸口疼', 'redflag', 'chest_pain'],
    ['我头痛', 'topic', 'headache'],
    ['一直在拉肚子', 'topic', 'diarrhea'],
    ['浑身起疹子', 'topic', 'rash'],
    ['我想自杀', 'redflag', 'selfharm']
  ];
  let n = 0;
  for (const [base, kind, id] of probes) {
    for (const p of PREFIX) {
      for (const s of SUFFIX) {
        const text = p + '，' + base + '，' + s;
        const m = KB.match(text, 'zh');
        n++;
        if (!m || m.kind !== kind || m.id !== id) {
          throw new Error(`「${text}」应命中 ${kind}/${id}，实际 ${JSON.stringify(m)}`);
        }
      }
    }
  }
  return `${n} 个装饰变体全部命中`;
});

/* ============================================================
   E 跨语言
   ============================================================ */
check('E1 跨语言：界面语言没有的说法，去另外两门里找', () => {
  let m = KB.match('我头痛', 'en');       // 英文界面说中文
  assert(m && m.kind === 'topic' && m.id === 'headache', `英文界面说中文应命中头痛，实际 ${JSON.stringify(m)}`);
  m = KB.match('my chest hurts', 'zh');   // 中文界面说英文
  assert(m && m.kind === 'redflag' && m.id === 'chest_pain', `中文界面说英文应命中胸痛红旗，实际 ${JSON.stringify(m)}`);
  m = KB.match('發燒了', 'en');           // 繁体在英文界面
  assert(m && m.kind === 'topic' && m.id === 'fever', `繁体说法应命中发热，实际 ${JSON.stringify(m)}`);
  return '三语互通：跟着老人说的那一门语言找';
});

/* ============================================================
   I 速度（纯匹配，先测）
   ============================================================ */
check('I1 匹配速度：单条均值远低于 1 毫秒', () => {
  const probes = [];
  for (const it of KB.topics) probes.push(...(it.zh.patterns || []));
  for (const it of KB.redflags) probes.push(...(it.zh.patterns || []));
  const t0 = process.hrtime.bigint();
  for (let r = 0; r < 20; r++) {
    for (const p of probes) KB.match(p, 'zh');
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const per = ms / (probes.length * 20);
  assert(per < 1, `单条均值 ${per.toFixed(3)} ms，超过 1 ms`);
  return `${probes.length} 条 × 20 轮 = ${probes.length * 20} 次匹配，均值 ${per.toFixed(3)} ms/条`;
});

/* ============================================================
   F / G / H / J：jsdom 里跑真实页面
   ============================================================ */
function loadJsdom() {
  const candidates = [
    path.resolve(HERE, '../node_modules/jsdom'),
    path.resolve(HERE, '../../.build-trash/node-tools/node_modules/jsdom'),
    'jsdom'
  ];
  for (const c of candidates) {
    try {
      if (c !== 'jsdom' && !existsSync(c)) continue;
      return createRequire(import.meta.url)(c);
    } catch { /* 下一个 */ }
  }
  return null;
}

const JSDOM_MOD = loadJsdom();
const { JSDOM, VirtualConsole } = JSDOM_MOD || {};
if (!JSDOM) {
  console.error('未找到 jsdom，无法自检。可先安装：npm i jsdom --registry=https://registry.npmjs.org');
  process.exit(2);
}

/* 麦克风计数桩：页面加载前装好，数一辈子弹几次窗 */
let gumCalls = 0;
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});

const dom = await JSDOM.fromFile(PAGE, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'file:///' + PAGE.replace(/\\/g, '/'),
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.scrollTo = () => {};
    class Utter { constructor(text) { this.text = text; } }
    window.SpeechSynthesisUtterance = Utter;
    window.speechSynthesis = {
      cancel: () => {},
      speak: () => {},
      getVoices: () => [{ lang: 'zh-CN' }]
    };
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia() {
          gumCalls++;
          const tracks = [{ stop() {} }];
          return Promise.resolve({ getTracks: () => tracks });
        }
      }
    });
  }
});

const { window } = dom;
const doc = window.document;

/* 资源是异步加载的，等脚本执行完（与 check-elder 同一套等待） */
await new Promise((r) => setTimeout(r, 400));

const M = window.XiaoYiLing;
const KBW = window.XiaoYiLingKB;
const SP = window.XiaoYuErSpeech;
const api = window.XiaoYuEr;

function aiTexts() {
  return Array.prototype.slice.call(doc.querySelectorAll('#medic-log .medic__msg--ai .medic__text'))
    .map((el) => el.textContent);
}
function lastAi() { const a = aiTexts(); return a.length ? a[a.length - 1] : ''; }
function allAi() { return aiTexts().join('\n'); }
function clearLog() { doc.getElementById('medic-log').innerHTML = ''; }

assert(M, '页面里没有挂上 window.XiaoYiLing');
assert(KBW && typeof KBW.match === 'function', '页面里没有挂上知识库');

/* ---------- F 会话流程 ---------- */
await checkAsync('F1 形态状态机：默认漂浮 → 点一下开面板变机器人 → 关闭恢复', async () => {
  assert(M.form() === 'idle', `初始形态应是 idle，实际 ${M.form()}`);
  assert(M.state().speed >= 20 && M.state().speed <= 40, `漂浮速度应在 20-40px/s，实际 ${M.state().speed}`);
  const orb = doc.getElementById('medic-orb');
  assert(orb && doc.getElementById('medic-panel'), '光点或面板不存在');
  assert(orb.getAttribute('aria-haspopup') === 'dialog', '光点没有声明会弹出对话框');
  M.open(false);
  assert(M.form() === 'chat', `打开面板后应是 chat，实际 ${M.form()}`);
  assert(!doc.getElementById('medic-panel').hidden, '面板没有显示');
  assert(doc.getElementById('medic-root').getAttribute('data-form') === 'chat', '根容器状态没切到 chat');
  M.close();
  assert(M.form() === 'idle' && doc.getElementById('medic-panel').hidden, '关闭后面板没收起、形态没恢复');
  return '漂浮 → 点击开面板（机器人形态）→ 关闭恢复漂浮';
});

await checkAsync('F2 预问诊流程：共情 → 红旗提示 → 一次最多 3 问 → 分诊 → 科普 → 免责 → 来源', async () => {
  M.reset();
  M.open(false);
  M.ask('我头痛三天了');
  let s = M.session();
  assert(s.stage === 'ask' && s.topicId === 'headache', `说症状后应进入头痛追问，实际 ${JSON.stringify(s)}`);
  let txt = allAi();
  assert(/难受|折磨/.test(txt), '没有共情那句话');
  assert(/雷击|突然|剧烈/.test(txt), '没有把红旗提示讲给老人听');
  assert(/什么时候开始的/.test(txt), '第一个问题不是问时间');

  M.ask('今天开始的');
  assert(M.session().qi === 1, '回答后没有进到第 2 个问题');
  M.ask('胀胀地痛');
  assert(M.session().qi === 2, '回答后没有进到第 3 个问题');
  M.ask('都没有');
  s = M.session();
  assert(s.stage === 'done', '三个问题答完应给出建议');
  /* 来源是异步补的（本地库 + 可选检索），等一个 tick 再核对 */
  await new Promise((r) => setTimeout(r, 30));
  txt = allAi();
  assert(/我的建议/.test(txt), '没有给出分级建议');
  assert(/预约门诊|居家观察|24 小时|急诊/.test(txt), '没有说清是哪一级');
  assert(/不能替代/.test(txt), '漏了免责声明');
  assert(/来源：/.test(txt), '漏了来源');
  assert(/中华医学会|NHS/.test(txt), '来源不是公开权威机构');
  return '共情 → 红旗提示 → 3 问 → 四级分诊 → 科普 → 免责 → 来源，一环不少';
});

await checkAsync('F3 红旗优先：说「胸口疼」立即建议 120，不进普通问诊', async () => {
  M.reset();
  M.open(false);
  M.ask('我胸口疼得厉害，还出大汗');
  const s = M.session();
  assert(s.stage === 'done' && s.escalated, '红旗没有立即结束问诊并标记急症');
  const txt = allAi();
  assert(/120/.test(txt), '没有建议拨打 120');
  assert(/急诊/.test(txt), '没有建议去急诊');
  assert(/不要自己开车|不要硬撑/.test(txt), '没有给出「别自己开车」这类关键叮嘱');
  return '命中红旗 → 立即 120/急诊劝导，不继续追问';
});

await checkAsync('F4 追问途中改口出红旗：按急症升级，不接着问', async () => {
  M.reset();
  M.open(false);
  M.ask('我头痛');
  M.ask('看东西模糊');
  const s = M.session();
  assert(s.escalated, '回答里出现红旗却没有升级');
  assert(s.stage === 'done', '升级后没有停止追问');
  const txt = allAi();
  assert(/危险信号/.test(txt) && /120/.test(txt), '升级时没有说明原因、也没有给 120');
  return '「看东西模糊」这类回答直接升级为急症处理';
});

await checkAsync('F5 兜底与指令：听不懂走兜底；「重新问一次」复位；「我想挂号」回到挂号流程', async () => {
  api.setLanguage('zh');
  clearLog();
  M.reset();
  M.open(false);
  M.ask('今天天气不错');
  let s = M.session();
  assert(s.stage === 'ask' && s.topicId === '', '没匹配上时应走兜底追问');
  assert(/哪里不舒服/.test(allAi()), '兜底没有先问「哪里不舒服」');

  M.ask('重新问一次');
  s = M.session();
  assert(s.stage === 'idle', '「重新问一次」没有复位会话');

  api.call('reset');
  assert(api.getState().step === 0, 'reset 后不在第 0 步');
  M.ask('我想挂号');
  assert(api.getState().step === 1, '「我想挂号」没有把老人带回挂号流程');
  assert(/挂号/.test(allAi()), '没有告诉老人要去挂号');
  return '兜底追问 · 指令复位 · 一句话跳回挂号流程';
});

await checkAsync('F6 多语言：英文界面用英文问诊，繁体界面用繁体问诊', async () => {
  api.setLanguage('en');
  clearLog();
  M.reset();
  M.open(false);
  M.ask('my head hurts');
  const txt = allAi();
  assert(/[a-zA-Z]/.test(txt) && !/[\u4e00-\u9fa5]/.test(txt), `英文界面下回复不是英文：${txt.slice(0, 60)}`);
  assert(/When did the headache start/.test(txt), '英文界面没有问英文问题');
  clearLog();
  api.setLanguage('zh-Hant');
  M.reset();
  M.ask('我頭痛');
  const txt2 = allAi();
  assert(/頭痛起來真折磨人/.test(txt2), '繁体界面没有繁体共情话术');
  api.setLanguage('zh');
  return '英/繁/简三语问诊各自成句';
});

/* ---------- G 禁止事项 ---------- */
await checkAsync('G1 禁止事项：全库话术 + 引擎产出都没有诊断/处方/剂量措辞', async () => {
  api.setLanguage('zh');
  const texts = [];
  for (const it of KB.redflags) for (const lg of LANGS) texts.push(it[lg].reply);
  for (const tp of KB.topics) {
    for (const lg of LANGS) {
      texts.push(tp[lg].empathy, tp[lg].redflagHint, tp[lg].triage, tp[lg].edu);
      for (const q of tp[lg].questions) texts.push(q.q);
    }
  }
  for (const lg of LANGS) {
    const g = KB.generic(lg).body;
    texts.push(g.empathy, g.triage, g.edu);
    for (const q of g.questions) texts.push(q.q);
  }
  /* 引擎产出：把常见场景全跑一遍，收拢所有气泡 */
  M.reset();
  for (const probe of ['我头痛', '今天开始的', '胀胀地痛', '都没有', '我胸口疼', '我想自杀', '天气不错', '谢谢']) {
    M.ask(probe);
  }
  texts.push(allAi());
  for (const t of texts) {
    for (const re of BANNED) {
      assert(!re.test(String(t)), `话术触犯禁词 ${re}：「${String(t).slice(0, 40)}…」`);
    }
  }
  return `${texts.length} 段话术全部通过禁词检查（不诊断、不开方、不给剂量）`;
});

/* ---------- H 隐私 ---------- */
await checkAsync('H1 隐私：不索要身份信息，并主动提醒不要发送', async () => {
  api.setLanguage('zh');
  clearLog();
  M.reset();
  M.open(false);
  M.ask('我头痛');
  const txt = allAi() + '\n' + (doc.getElementById('medic-disclaimer').textContent || '');
  assert(/姓名|身份證|身份证|手机号/.test(txt), '没有提醒老人不要发送身份信息');
  assert(!/请?(把|提供).{0,6}(姓名|身份证|手机号)/.test(txt), '话术里居然在索要身份信息');
  return '只提醒、不索要';
});

/* ---------- J 麦克风只询问一次 ---------- */
await checkAsync('J1 麦克风全页只授权一次：小鱼儿与小医灵共用，不重复弹窗', async () => {
  assert(SP && typeof SP.ensureMic === 'function', 'speech.js 没有暴露 ensureMic');
  const before = gumCalls;
  await SP.ensureMic();
  const afterFirst = gumCalls;
  assert(afterFirst === before + 1, `第一次授权应恰好弹一次窗，实际弹了 ${afterFirst - before} 次`);
  await SP.ensureMic();
  assert(gumCalls === afterFirst, '第二次调用又弹了一次窗——授权没有记住');
  assert(SP.micGranted() === true, '授权后 micGranted 应为 true');
  const st = await SP.micState();
  assert(st === 'granted', `已授权时 micState 应直接答 granted（不再查浏览器），实际 ${st}`);

  /* 小医灵去听：不能再触发一次授权 */
  const before2 = gumCalls;
  M.startListen();
  await new Promise((r) => setTimeout(r, 30));
  assert(gumCalls === before2, '小医灵启动听写又触发了一次麦克风授权');
  M.stopListen();
  return 'ensureMic 幂等 · micState 命中缓存 · 小医灵不重复要权限';
});

/* ---------- 输出 ---------- */
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log('\n小医灵沙盒测试 · 医疗预问诊智能体');
console.log('─'.repeat(64));
results.forEach((r, i) => {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + String(i + 1).padStart(2, '0') + ' ' + r.name);
  if (r.detail) console.log('       ' + r.detail);
});
console.log('─'.repeat(64));
console.log(`结果：${pass}/${results.length} 项通过${fail ? '，失败 ' + fail + ' 项' : ''}\n`);
dom.window.close();
process.exit(fail ? 1 : 0);
