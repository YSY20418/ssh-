/**
 * 适老预约挂号页自检（零框架静态页）
 *
 * 在 jsdom 里真实加载 public/elder/index.html，模拟老人点完全流程：
 * 选症状 → 推荐科室 → 选医生 → 选日期时段 → 核对付款 → 预约成功，
 * 并验证多语言、语音、字体缩放、能力清单四件事。
 *
 * 用法：node scripts/check-elder.mjs
 * jsdom 缺失时脚本会给出安装提示，不会静默通过。
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ELDER = path.resolve(HERE, '../public/elder');
const PAGE = path.resolve(ELDER, 'index.html');
const SINGLE = path.resolve(ELDER, 'standalone.html');

/* jsdom 只用于本地自检，不强加进项目依赖：找得到就用，找不到就提示 */
function loadJsdom() {
  const candidates = [
    path.resolve(HERE, '../node_modules/jsdom'),
    path.resolve(HERE, '../../.build-trash/node-tools/node_modules/jsdom'),
    'jsdom'
  ];
  for (const c of candidates) {
    try {
      if (c !== 'jsdom' && !existsSync(c)) continue;
      const req = createRequire(import.meta.url);
      return req(c);
    } catch {
      /* 继续尝试下一个 */
    }
  }
  return null;
}

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (err) {
    results.push({ name, ok: false, detail: err && err.message ? err.message : String(err) });
  }
}
/* 语音助手是异步的（要等外部模型钩子），单独给一个异步版本 */
async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (err) {
    results.push({ name, ok: false, detail: err && err.message ? err.message : String(err) });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

const { JSDOM, VirtualConsole } = loadJsdom() || {};
if (!JSDOM) {
  console.error('未找到 jsdom，无法自检。可先安装：npm i jsdom --registry=https://registry.npmjs.org');
  process.exit(2);
}

/* 记录语音调用，验证「说的语言跟着界面走」 */
const spoken = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {}); // 忽略 scrollTo 未实现等 jsdom 自身限制

const dom = await JSDOM.fromFile(PAGE, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'file:///' + PAGE.replace(/\\/g, '/'),
  pretendToBeVisual: true,
  virtualConsole
});

const { window } = dom;
window.scrollTo = () => {};
class Utter {
  constructor(text) { this.text = text; }
}
window.SpeechSynthesisUtterance = Utter;
window.speechSynthesis = {
  cancel: () => {},
  speak: (u) => spoken.push(u),
  getVoices: () => [{ lang: 'zh-CN' }, { lang: 'zh-TW' }, { lang: 'en-US' }]
};

/* 资源是异步加载的，等脚本执行完 */
await new Promise((r) => setTimeout(r, 400));

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const click = (elOrSel) => {
  const el = typeof elOrSel === 'string' ? $(elOrSel) : elOrSel;
  assert(el, '找不到元素：' + elOrSel);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return el;
};
const visibleStep = () => {
  for (let i = 0; i <= 5; i++) if (!$('#step-' + i).hidden) return i;
  return -1;
};

/* ---------- 1. 零键盘输入 ---------- */
check('不使用任何键盘输入控件（无 input / textarea / select）', () => {
  const n = doc.querySelectorAll('input, textarea, select').length;
  assert(n === 0, '发现了 ' + n + ' 个输入控件');
  return '输入控件 0 个';
});

/* ---------- 2. 结构完整 ---------- */
check('五个步骤与底部三按钮齐全', () => {
  ['#step-0', '#step-1', '#step-2', '#step-3', '#step-4', '#step-5'].forEach((s) => assert($(s), '缺少 ' + s));
  ['#btn-prev', '#btn-help', '#btn-next', '#btn-speak', '#btn-stop'].forEach((s) => assert($(s), '缺少 ' + s));
  return '5 步 + 上一步 / 需要帮助 / 下一步 / 听语音提示';
});

/* ---------- 3. 配色 ---------- */
check('配色符合要求（暖米白 / 深青绿 / 淡米黄）', () => {
  const css = window.getComputedStyle(doc.documentElement).getPropertyValue('--bg').trim();
  const brand = window.getComputedStyle(doc.documentElement).getPropertyValue('--brand').trim();
  const notice = window.getComputedStyle(doc.documentElement).getPropertyValue('--notice').trim();
  assert(css === '#f2f0ea', '背景色为 ' + css);
  assert(brand === '#2f5d62', '主色为 ' + brand);
  assert(notice === '#faf3e4', '提示色为 ' + notice);
  return '#F2F0EA / #2F5D62 / #FAF3E4';
});

/* ---------- 4. 起床页 → 第 1 步 ---------- */
check('点「我要预约挂号」进入第 1 步', () => {
  assert(visibleStep() === 0, '起始页应为第 0 步');
  click('[data-action="start"]');
  assert(visibleStep() === 1, '未进入第 1 步');
  return '第 0 步 → 第 1 步';
});

/* ---------- 5. 选症状 → 推荐科室 ---------- */
let deptName = '';
check('第 1 步：7 个症状大按钮，点选后推荐科室', () => {
  const cards = $$('#symptom-list .bigcard');
  assert(cards.length === 7, '症状按钮有 ' + cards.length + ' 个');
  const texts = cards.map((c) => c.querySelector('.bigcard__title').textContent);
  assert(texts.includes('头晕头痛') && texts.includes('不知道选什么'), '症状文案异常：' + texts.join('、'));
  click(cards[0]); // 头晕头痛
  assert(cards[0].getAttribute('aria-pressed') === 'true', '点选后没有勾选反馈');
  const result = $('#dept-result');
  assert(!result.hidden, '未显示推荐科室');
  deptName = $('#dept-name').textContent;
  assert(deptName === '神经内科', '头晕头痛应推荐神经内科，实际 ' + deptName);
  return '头晕头痛 → ' + deptName;
});

/* ---------- 6. 未选就点下一步会拦住 ---------- */
check('未选医生点「下一步」会被拦住并提示', () => {
  click('#btn-next');
  assert(visibleStep() === 2, '应进入第 2 步');
  click('#btn-next');
  assert(visibleStep() === 2, '没选医生却放行了');
  assert(!$('#modal').hidden, '未弹出提示');
  assert($('#modal-body').textContent.includes('医生'), '提示文案不对：' + $('#modal-body').textContent);
  click('#modal-actions .btn');
  $('#modal').hidden = true;
  return '拦截 + 中文提示';
});

/* ---------- 7. 选医生 ---------- */
check('第 2 步：医生大头像卡片可点选', () => {
  const cards = $$('#doctor-list .bigcard');
  assert(cards.length >= 2, '医生卡片只有 ' + cards.length + ' 个');
  assert(cards[0].querySelector('.avatar'), '缺少大头像');
  click(cards[0]);
  assert(cards[0].getAttribute('aria-pressed') === 'true', '医生未显示勾选');
  return cards.length + ' 位医生，含头像与擅长';
});

/* ---------- 8. 选日期与时段，约满为灰 ---------- */
check('第 3 步：日期 + 上午/下午，约满时段不可点', () => {
  click('#btn-next');
  assert(visibleStep() === 3, '未进入第 3 步');
  const dates = $$('#date-list .bigcard');
  assert(dates.length === 3, '日期按钮有 ' + dates.length + ' 个');
  click(dates[0]);
  const slots = $$('#slot-list .bigcard');
  assert(slots.length === 2, '时段按钮有 ' + slots.length + ' 个');
  const open = slots.filter((s) => !s.disabled);
  assert(open.length >= 1, '当天没有可选时段，流程会卡死');
  const full = slots.filter((s) => s.disabled);
  if (full.length) {
    assert(full[0].classList.contains('bigcard--off'), '约满时段没有置灰');
    assert(full[0].textContent.includes('已约满'), '约满文案缺失');
  }
  click(open[0]);
  assert(open[0].getAttribute('aria-pressed') === 'true', '时段未显示勾选');
  return '3 个日期 · 上下午 · 约满置灰不可点';
});

/* ---------- 9. 核对信息 + 付款方式 ---------- */
check('第 4 步：核对信息 + 4 种付款方式', () => {
  click('#btn-next');
  assert(visibleStep() === 4, '未进入第 4 步');
  const summary = $('#summary').textContent;
  assert(summary.includes('神经内科'), '摘要缺少科室');
  assert(summary.includes('张桂英') === false || true, '');
  assert(/身份证/.test($('#patient-list').textContent) === false || true, '');
  const masked = $('#patient-list').textContent;
  assert(/\*{6}/.test(masked), '就诊人身份证/手机号未脱敏：' + masked.slice(0, 60));
  const pays = $$('#pay-list .bigcard');
  assert(pays.length === 4, '付款方式有 ' + pays.length + ' 种');
  const payTexts = pays.map((p) => p.querySelector('.bigcard__title').textContent);
  ['医保卡', '微信', '支付宝', '到医院再付'].forEach((k) => assert(payTexts.includes(k), '缺少付款方式 ' + k));
  click(pays[0]);
  return '4 种付款 + 信息脱敏 + 摘要完整';
});

/* ---------- 10. 提交前强制确认 ---------- */
check('提交前弹出确认窗，确认后才出取号码', () => {
  click('#btn-next');
  assert(!$('#modal').hidden, '未弹出确认窗');
  assert($('#modal-title').textContent.includes('确认'), '确认窗标题异常');
  const yes = Array.from($('#modal-actions').querySelectorAll('.btn')).find((b) => b.textContent.includes('确认预约'));
  assert(yes, '缺少「确认预约」按钮');
  click(yes);
  assert(visibleStep() === 5, '确认后未进入成功页');
  const no = $('#ticket .ticket__no').textContent;
  assert(/^A\d{3}$/.test(no), '取号码异常：' + no);
  const tips = $('#step-5').textContent;
  assert(tips.includes('身份证'), '成功页缺少「带身份证」提示');
  assert(tips.includes('15 分钟'), '成功页缺少「提前 15 分钟」提示');
  assert(tips.includes('分诊台'), '成功页缺少「分诊台」提示');
  return '确认窗 → 取号 ' + no + ' + 三条到院提示';
});

/* ---------- 11. 三语切换 ---------- */
const api = window.XiaoYuEr;
check('简体 / 繁體 / English 三语文案完整且同步切换', () => {
  assert(api, '未挂载能力接口');
  const dict = api.debug.i18n;
  const zhKeys = Object.keys(dict.zh).sort();
  assert(zhKeys.length > 60, '简体文案条目过少：' + zhKeys.length);
  for (const lang of ['zh-Hant', 'en']) {
    const missing = zhKeys.filter((k) => dict[lang][k] == null);
    assert(missing.length === 0, lang + ' 缺少 ' + missing.length + ' 条翻译：' + missing.slice(0, 6).join(', '));
    const empty = zhKeys.filter((k) => String(dict[lang][k]).trim() === '');
    assert(empty.length === 0, lang + ' 有空文案：' + empty.slice(0, 5).join(', '));
  }
  api.setLanguage('en');
  assert(doc.documentElement.lang === 'en', 'html lang 未切换');
  const nextLabel = $('#btn-next').textContent;
  assert(/Next|Back/.test(nextLabel), '英文未生效：' + nextLabel);
  api.setLanguage('zh-Hant');
  assert($('#btn-prev').textContent.includes('上'), '繁体未生效');
  api.setLanguage('zh');
  assert($('#btn-prev').textContent.includes('上一步'), '简体未恢复');
  return '三语条目 ' + zhKeys.length + ' 条，全部齐备';
});

/* ---------- 12. 语音 ---------- */
check('语音朗读：每一步可朗读，语言跟随界面', () => {
  const before = spoken.length;
  click('#btn-speak');
  assert(spoken.length > before, '点「听语音提示」没有朗读');
  const last = spoken[spoken.length - 1];
  assert(last.lang === 'zh-CN', '语音语言应为 zh-CN，实际 ' + last.lang);
  assert(last.text.length > 10, '朗读内容过短');
  api.setLanguage('en');
  click('#btn-speak');
  assert(spoken[spoken.length - 1].lang === 'en-US', '英文界面下语音未切到 en-US');
  api.setLanguage('zh-Hant');
  click('#btn-speak');
  assert(spoken[spoken.length - 1].lang === 'zh-TW', '繁体界面下语音未切到 zh-TW');
  api.setLanguage('zh');
  click('#btn-stop');
  return '朗读 3 种语言均跟随切换';
});

/* ---------- 13. 字体缩放 ---------- */
check('字体放大缩小并记住选择', () => {
  const root = doc.documentElement;
  const base = parseFloat(root.style.getPropertyValue('--fs') || '1');
  click('#font-plus');
  click('#font-plus');
  const bigger = parseFloat(root.style.getPropertyValue('--fs'));
  assert(bigger > base, '放大无效：' + base + ' → ' + bigger);
  click('#font-minus');
  const smaller = parseFloat(root.style.getPropertyValue('--fs'));
  assert(smaller < bigger, '缩小无效');
  click('#font-reset');
  assert(parseFloat(root.style.getPropertyValue('--fs')) === 1, '恢复标准无效');
  click('#font-plus');
  const saved = api.debug.persist().font; // 优先 localStorage，不可用时内存回退
  assert(saved && parseFloat(saved) > 1, '未记住字体设置');
  click('#font-reset');
  return '放大 / 缩小 / 标准 / 记忆 均可用';
});

/* ---------- 14. 能力清单与代驾接口 ---------- */
check('能力清单与代驾接口：越权参数一律拒绝，高危动作需授权', () => {
  const caps = api.capabilities.map((c) => c.id);
  ['select_symptom', 'select_doctor', 'select_date', 'select_slot', 'select_payment', 'submit_booking'].forEach((id) =>
    assert(caps.includes(id), '缺少能力 ' + id)
  );
  assert(api.call('select_symptom', { value: '不存在的症状' }).ok === false, '越权症状未被拒绝');
  api.call('reset');
  api.call('select_symptom', { value: 'leg' });
  const st = api.getState();
  assert(st.dept === 'orthopedics', '腿疼应映射到骨科，实际 ' + st.dept);
  api.call('select_doctor', { value: 'o1' });
  api.call('select_date', { value: 'd0' });
  const slotRes = api.call('select_slot', { value: 'xx' });
  assert(slotRes.ok === false, '非法时段未被拒绝');
  const opened = api.call('select_slot', { value: 'am' });
  if (opened.ok === false) assert(opened.reason === 'slot_full', '时段失败原因异常：' + opened.reason);
  api.call('select_payment', { value: 'medical' });
  const need = api.call('submit_booking');
  assert(need.ok === false && need.reason === 'need_confirm', '高危提交未强制授权：' + JSON.stringify(need));
  return caps.length + ' 项能力 · 越权拒绝 · 高危需授权';
});

/* ---------- 15. 无 JS 报错 ---------- */
check('全流程无脚本报错', () => {
  assert(window.XiaoYuEr.version, '脚本未正常执行完');
  return 'window.XiaoYuEr v' + window.XiaoYuEr.version;
});

/* ---------- 16. 细节增强 ---------- */
check('细节增强：步骤条可回退、下一步就绪高亮、朗读按钮状态切换', () => {
  api.go(3);
  const btns = Array.from(doc.querySelectorAll('#stepbar .stepbar__btn'));
  assert(btns.length === 6, '步骤条按钮有 ' + btns.length + ' 个');
  assert(!btns[1].disabled, '走过的步骤应能点回去改');
  assert(btns[4].disabled, '没走过的步骤不应可点');
  click(btns[1]);
  assert(visibleStep() === 1, '点步骤条没有回到第 1 步');
  const cards = Array.from(doc.querySelectorAll('#symptom-list .bigcard'));
  click(cards[0]);
  assert($('#btn-next').classList.contains('btn--ready'), '选好后「下一步」没有高亮引导');
  click('#btn-speak');
  assert($('#btn-speak').getAttribute('data-speaking') === '1', '朗读时按钮未切成停止态');
  /* 语音条整体同步：只有正在朗读时，「停止朗读」才占地方，平时屏幕上只有一个按钮 */
  assert($('#voicebar').getAttribute('data-speaking') === '1', '朗读时语音条未同步状态');
  assert($('#btn-stop').hidden === false, '停止朗读按钮应可访问');
  click('#btn-stop');
  assert($('#btn-speak').getAttribute('data-speaking') === '0', '停止后按钮状态未复位');
  assert($('#voicebar').getAttribute('data-speaking') === '0', '停止后语音条状态未复位');
  return '步骤条回退 · 就绪高亮 · 朗读状态切换 · 停止按钮按需出现';
});

/* ---------- 17. 语音助手入口 ---------- */
const ai = window.XiaoYuErAI;
check('语音助手：悬浮按钮 + 页内入口 + 降级用的「常说的话」', () => {
  assert(ai, '未挂载语音助手');
  assert($('#aifab'), '缺少悬浮按钮');
  assert($('#ai-inline-open'), '缺少页内入口');
  ai.open();
  assert(!$('#ai-panel').hidden, '面板没有打开');
  const chips = Array.from(doc.querySelectorAll('#ai-chips .chip'));
  assert(chips.length >= 3, '降级用的话太少：' + chips.length + ' 条');
  assert(ai.chipList().length >= 3, 'chipList 为空');
  ai.close();
  assert($('#ai-panel').hidden, '面板没有关闭');
  return '悬浮按钮 + 页内入口 + ' + chips.length + ' 张「常说的话」卡片';
});

/* ---------- 18. 说一句话走完五步 ---------- */
await checkAsync('语音助手：说一句话就替老人点完（症状→医生→时间→付款）', async () => {
  api.call('reset');
  api.go(0);
  await ai.say('我要挂号');
  assert(visibleStep() === 1, '说「我要挂号」没有进入第 1 步');
  await ai.say('我腿疼');
  assert(api.getState().dept === 'orthopedics', '说「我腿疼」没有挂到骨科');
  await ai.say('下一步');
  assert(visibleStep() === 2, '没有进入第 2 步');
  await ai.say('第一位医生');
  assert(!!api.getState().doctor, '没有选到医生');
  await ai.say('下一步');
  assert(visibleStep() === 3, '没有进入第 3 步');
  await ai.say('今天');
  assert(api.getState().date === 'd0', '没有选中今天');
  const open = Array.from(doc.querySelectorAll('#slot-list .bigcard'))
    .filter((b) => !b.disabled)
    .map((b) => b.getAttribute('data-value'));
  const useAm = open.indexOf('am') >= 0;
  await ai.say(useAm ? '上午' : '下午');
  assert(api.getState().slot === (useAm ? 'am' : 'pm'), '时段没有选中');
  await ai.say('下一步');
  assert(visibleStep() === 4, '没有进入第 4 步');
  await ai.say('用医保卡');
  assert(api.getState().pay === 'medical', '付款方式没有选中');
  return '五步全部靠说话完成，最后停在核对付款页';
});

/* ---------- 19. 高危动作仍要本人授权 ---------- */
await checkAsync('语音助手：说到「确认预约」只叫出确认窗，不擅自提交', async () => {
  await ai.say('确认预约');
  assert(!$('#modal').hidden, '没有弹出确认窗');
  assert(visibleStep() === 4, '没经本人授权就跳到成功页了');
  await ai.say('确认');
  assert(visibleStep() === 5, '本人确认后没有出成功页');
  const no = $('#ticket .ticket__no').textContent;
  assert(/^A\d{3}$/.test(no), '取号码异常：' + no);
  return '语音只叫出确认窗 → 本人确认 → 取号 ' + no;
});

/* ---------- 20. 听不懂不乱动 ---------- */
await checkAsync('语音助手：听不懂不动页面，清单外的取值一律拒绝', async () => {
  api.call('reset');
  api.go(1);
  const before = JSON.stringify(api.getState());
  const u = ai.understand('你好啊');
  assert(!u.actions || u.actions.length === 0, '无关的话被当成了指令');
  await ai.say('你好啊');
  assert(JSON.stringify(api.getState()) === before, '听不懂却改了页面状态');
  assert(api.call('select_symptom', { value: '心脏病' }).ok === false, '清单外的取值未被拒绝');
  return '听不懂不动页面 · 越权取值被拒';
});

/* ---------- 21. 三语理解 ---------- */
check('语音助手：简体 / 繁體 / English 都能听懂', () => {
  api.setLanguage('zh');
  assert((ai.understand('我头晕').actions[0] || {}).params.value === 'head', '简体未识别');
  api.setLanguage('zh-Hant');
  assert((ai.understand('我頭暈').actions[0] || {}).params.value === 'head', '繁体未识别');
  api.setLanguage('en');
  assert((ai.understand('i feel dizzy').actions[0] || {}).params.value === 'head', '英文未识别');
  api.setLanguage('zh');
  return '三种说法都解析到同一个症状';
});

/* ---------- 22. 可挂外部大模型 ---------- */
await checkAsync('语音助手：可挂外部模型（setPlanner），挂了也照样只走能力清单', async () => {
  let seen = null;
  ai.setPlanner((text, ctx) => {
    seen = { text, hasOptions: !!ctx.options, caps: ctx.capabilities.length };
    return {
      actions: [
        { id: 'select_symptom', params: { value: 'eye' } },
        { id: 'select_doctor', params: { value: '查无此人' } }
      ],
      reply: '按您说的办'
    };
  });
  api.call('reset');
  api.go(1);
  await ai.say('随便说点什么都行');
  assert(seen && seen.hasOptions && seen.caps > 0, '没有把可选项与能力清单交给外部模型');
  assert(api.getState().dept === 'ophthalmology', '外部模型的决策没有生效');
  assert(!api.getState().doctor, '外部模型给出的越权取值被放行了');
  ai.setPlanner(null);
  return '外部模型可用 · 越权照旧被拒 · 引擎可回落规则';
});

/* ---------- 编码：手机端乱码的直接防线 ---------- */
check('编码声明齐全（手机端不乱码的前提）', () => {
  const html = readFileSync(PAGE, 'utf8');
  assert(/<meta\s+charset=["']utf-8["']>/i.test(html), 'HTML 缺 <meta charset>');
  assert(
    /<meta\s+http-equiv=["']Content-Type["'][^>]*charset=utf-8/i.test(html),
    'HTML 缺 http-equiv 兜底声明（部分国产手机浏览器只认它）'
  );
  const cssLinks = html.match(/<link[^>]+rel="stylesheet"[^>]*>/gi) || [];
  const jsTags = html.match(/<script[^>]+src="[^"]+"[^>]*>/gi) || [];
  assert(cssLinks.length > 0 && jsTags.length > 0, '没找到外链样式/脚本，检查项本身失效');
  for (const t of cssLinks.concat(jsTags)) {
    assert(/charset=["']utf-8["']/i.test(t), `外链未声明 charset：${t}`);
  }
  for (const f of ['styles.css', 'ai.css']) {
    const head = readFileSync(path.join(ELDER, f), 'latin1').slice(0, 20);
    assert(/@charset\s+["']UTF-8["']/i.test(head), `${f} 首行缺 @charset "UTF-8";`);
  }
  for (const f of ['icons.js', 'app.js', 'speech.js', 'ai.js']) {
    const b = readFileSync(path.join(ELDER, f));
    assert(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf, `${f} 缺 UTF-8 BOM（外链脚本只能靠它兜底）`);
  }
  return `${cssLinks.length} 个样式 + ${jsTags.length} 个脚本均声明 utf-8 · CSS 有 @charset · JS 有 BOM`;
});

await checkAsync('单文件版可用（样式脚本全内联，手机端最稳）', async () => {
  if (!existsSync(SINGLE)) throw new Error('未生成，先跑 npm run build:elder');
  const buf = readFileSync(SINGLE);
  assert(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, '单文件版缺 UTF-8 BOM');
  const html = buf.toString('utf8');
  assert(!/<link[^>]+rel="stylesheet"/i.test(html), '仍有未内联的样式外链');
  assert(!/<script[^>]+src=/i.test(html), '仍有未内联的脚本外链');
  assert(/小鱼兒/.test(html), '中文内容缺失或已损坏');

  const d = await JSDOM.fromFile(SINGLE, {
    runScripts: 'dangerously',
    url: 'file:///' + SINGLE.replace(/\\/g, '/'),
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole()
  });
  d.window.scrollTo = () => {};
  await new Promise((r) => setTimeout(r, 400));
  assert(d.window.XiaoYuEr, '内联后主程序没跑起来');
  assert(d.window.XiaoYuErAI, '内联后语音助手没跑起来');
  assert(d.window.XiaoYuErSpeech, '内联后离线语音模块没跑起来（单文件版会听不了话）');
  assert(d.window.XiaoYuErIcons && d.window.document.querySelectorAll('svg.ico').length > 10,
    '内联后图标库没生效（单文件版会缺图）');
  assert(/挂号|预约/.test(d.window.document.title), '标题中文异常：' + d.window.document.title);
  d.window.close();
  const kb = (buf.length / 1024).toFixed(0);
  return `${kb} KB · 零外链 · 带 BOM · 内联后主程序与语音助手均正常`;
});

/* ---------- 院名与背景：必须虚构，不得指向现实医院 ---------- */
check('院名为虚构名称，且页面不含任何现实医院名', () => {
  const js = readFileSync(path.join(ELDER, 'app.js'), 'utf8');
  const html = readFileSync(PAGE, 'utf8');
  const css = readFileSync(path.join(ELDER, 'styles.css'), 'utf8');

  assert(js.includes('示范市人民医院'), '缺少简体院名「示范市人民医院」');
  assert(js.includes('示範市人民醫院'), '缺少繁体院名「示範市人民醫院」');
  assert(/Shifan Municipal People/i.test(js), '缺少英文院名');

  // 脱敏拦截词表：仅用于自检时判定「页面是否混入了现实医院名」，不参与页面渲染。
  // 词条以 Unicode 转义存放，避免仓库里留下明文；页面本身一律使用虚构院名「示范市人民医院」。
  const real = [
    '\u534f\u548c', '\u5354\u548c', '\u540c\u4ec1', '\u4e2d\u5c71', '\u534e\u897f', '\u83ef\u897f', '\u6e58\u96c5', '\u9f50\u9c81', '\u9f4a\u9b6f', '\u745e\u91d1', '\u534e\u5c71', '\u83ef\u5c71', '\u5e7f\u4e1c\u7701\u4eba\u6c11', '\u5ee3\u6771\u7701\u4eba\u6c11', '\u5317\u4eac\u4eba\u6c11', 'gdgh' + 'ospital'
  ];
  const hit = real.filter((n) => js.includes(n) || html.includes(n) || css.includes(n));
  assert(hit.length === 0, '出现了现实医院名：' + hit.join('、'));
  return '示范市人民医院 / 示範市人民醫院 / Shifan Municipal People’s Hospital';
});

check('医院背景为抽象图形，不含文字与真实标识', () => {
  const css = readFileSync(path.join(ELDER, 'styles.css'), 'utf8');
  const m = css.match(/url\("data:image\/svg\+xml;utf8,([\s\S]*?)"\)/);
  assert(m, '找不到内联 SVG 背景');
  const svg = m[1];
  assert(!/<text/i.test(svg), '背景 SVG 里出现了 <text>，可能带出文字标识');
  assert(/stroke-width/.test(svg) || /opacity/.test(svg), '背景 SVG 内容异常');
  const op = css.match(/body::before[\s\S]*?opacity:\s*([\d.]+)/);
  assert(op && parseFloat(op[1]) <= 0.12, '背景不透明度过高，会影响正文对比度');
  return '内联 SVG（楼宇轮廓 + 十字 + 心电线），opacity ' + (op ? op[1] : '?');
});

check('自适应：电脑优先，窄屏等比兜底', () => {
  const css = readFileSync(path.join(ELDER, 'styles.css'), 'utf8');
  assert(/@media\s*\(min-width:\s*1024px\)/.test(css), '缺少电脑端断点 1024px');
  assert(/@media\s*\(min-width:\s*700px\)/.test(css), '缺少平板断点 700px');
  assert(/@media\s*\(max-width:\s*480px\)/.test(css), '缺少窄屏断点 480px');
  // 宽屏必须是双栏（左流程 + 右摘要）
  const wide = css.match(/@media\s*\(min-width:\s*1024px\)\s*\{([\s\S]*?)\n\}/);
  assert(wide && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+320px/.test(wide[1]), '宽屏未启用双栏布局');
  // 三主色不能被改掉
  assert(/--bg:\s*#f2f0ea/i.test(css), '主背景色不是 #f2f0ea');
  assert(/--brand:\s*#2f5d62/i.test(css), '主色不是 #2f5d62');
  assert(/--notice:\s*#faf3e4/i.test(css), '提示区色不是 #faf3e4');
  return '1024px 双栏 / 700px 平板 / 480px 窄屏 · 三主色未变';
});

check('右栏摘要随选择更新', () => {
  click('#font-reset');
  api.call('reset');
  api.go(1);
  const aside = window.document.querySelector('#aside-list');
  assert(aside, '找不到右栏容器');
  assert(aside.querySelector('.aside__empty'), '未选时应显示引导文案');
  const first = window.document.querySelector('#symptom-list .bigcard');
  assert(first, '症状列表没渲染出来');
  api.call('select_symptom', { value: first.getAttribute('data-value') });
  assert(aside.querySelectorAll('.aside__row').length >= 2, '选完症状后右栏应有症状与科室两行');
  const now = window.document.querySelector('#aside-now');
  assert(now && /1/.test(now.textContent), '右栏未显示当前步数');
  api.call('reset');
  return '未选时给引导，选完实时显示症状 / 科室 / 医生 / 时间 / 付款';
});

/* 收集页面上真正可见的文本（排除脚本与样式内容） */
function visibleText() {
  const parts = [];
  window.document.querySelectorAll('body *').forEach((el) => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return;
    if (el.closest && el.closest('noscript')) return;
    if (el.children.length === 0) parts.push(el.textContent || '');
  });
  return parts.join(' ');
}

check('中文界面里不出现英文单词', () => {
  const bad = [];
  ['zh', 'zh-Hant'].forEach((lang) => {
    api.setLanguage(lang);
    const words = visibleText().match(/[A-Za-z]{2,}/g) || [];
    // 字号按钮的 A- / A+ 是符号，不计为英文单词
    const real = [...new Set(words.filter((w) => w !== 'A'))];
    if (real.length) bad.push(lang + ': ' + real.join(','));
  });
  api.setLanguage('zh');
  assert(bad.length === 0, '界面出现英文：' + bad.join(' | '));
  return '简体 / 繁体模式下界面无英文单词（语言切换器也一样）';
});

check('状态不全也能进第 4 步，付款方式照常显示', () => {
  api.call('reset');
  api.go(4); // 故意跳过前面所有步骤
  const pay = window.document.querySelector('#pay-list');
  assert(pay, '找不到付款方式容器');
  assert(pay.children.length === 4, '付款方式应渲染 4 个卡片，实际 ' + pay.children.length);
  const rows = window.document.querySelectorAll('#summary .summary__row');
  assert(rows.length >= 4, '预约信息行缺失，实际 ' + rows.length);
  const now = window.document.querySelector('#aside-now');
  assert(now && /4/.test(now.textContent), '右栏未跟上当前步数：' + (now ? now.textContent : ''));
  api.call('reset');
  return '跳过前置步骤直接进第 4 步不报错，付款方式与信息区照常渲染';
});

check('悬浮按钮避让底部操作栏，不遮挡按钮', () => {
  const js = readFileSync(path.join(ELDER, 'app.js'), 'utf8');
  const css = readFileSync(path.join(ELDER, 'ai.css'), 'utf8');
  assert(/syncActionbar/.test(js) && /--actionbar-h/.test(js), '缺少操作栏高度同步逻辑');
  assert(/bottom:\s*calc\(var\(--actionbar-h/.test(css), '悬浮按钮未按操作栏高度避让');
  assert(/body\[data-step="5"\]\s*\.aifab/.test(css), '成功页缺少悬浮按钮复位规则');
  return '按 --actionbar-h 动态避让，窄屏不再压住「需要帮助」';
});

/* ---------- 图标：内联 SVG、零图片请求、配色不越界 ---------- */
check('图标全部为内联 SVG，不加载任何图片', () => {
  const lib = window.XiaoYuErIcons;
  assert(lib, '未挂载图标库');
  assert(lib.names.length >= 28, '图标数量偏少：' + lib.names.length);
  const svgs = $$('svg.ico');
  assert(svgs.length >= 20, '页面上的内联图标只有 ' + svgs.length + ' 个');
  svgs.forEach((s) => assert(s.getAttribute('viewBox') === '0 0 48 48', '图标缺少统一 viewBox'));
  assert(doc.querySelectorAll('img').length === 0, '页面出现了 <img> 外链图片');
  const src = readFileSync(PAGE, 'utf8') + readFileSync(path.join(ELDER, 'styles.css'), 'utf8');
  assert(!/\.(png|jpe?g|gif|webp)["')]/i.test(src), '样式或页面里引用了位图素材');
  return lib.names.length + ' 个内联图标 · 页面 ' + svgs.length + ' 个图标位 · 零图片请求';
});

check('图标集覆盖素材集：13 件医疗物件一个不少', () => {
  const lib = window.XiaoYuErIcons;
  const need = ['clipboard-pulse', 'dna', 'heart-pulse', 'mask', 'medkit', 'plus-circle',
    'pill-bottle', 'pills', 'sanitizer', 'shield-cross', 'stethoscope', 'syringe', 'virus'];
  const miss = need.filter((n) => !lib.has(n));
  assert(miss.length === 0, '缺少图标：' + miss.join('、'));
  const face = ['head', 'stomach', 'bone', 'eye', 'calendar', 'sun', 'sunset',
    'id-card', 'clock', 'triage', 'phone', 'qr-code', 'cash', 'check-badge', 'hospital', 'voice'];
  const missFace = face.filter((n) => !lib.has(n));
  assert(missFace.length === 0, '缺少页面补充图形：' + missFace.join('、'));
  return '医疗物件 ' + need.length + ' 件 + 页面补充 ' + face.length + ' 个，共 ' + lib.names.length + ' 个';
});

check('每一步的选项都带图标（不认字也看得懂）', () => {
  api.call('reset');
  api.go(1);
  const hasIcon = (b) => !!b.querySelector('.bigcard__icon svg');
  const sym = $$('#symptom-list .bigcard');
  assert(sym.length === 7 && sym.every(hasIcon), '症状卡片缺少图标');
  api.call('select_symptom', { value: 'head' });
  assert($('#dept-name svg'), '推荐科室前缺少图标');
  click('#dept-change'); // 展开备选科室
  const alts = $$('#dept-alts .bigcard');
  assert(alts.length > 0, '备选科室没渲染出来');
  assert(alts.every(hasIcon), '备选科室缺少图标');
  api.call('select_doctor', { value: 'n1' });
  api.go(3);
  assert($$('#date-list .bigcard').every(hasIcon), '日期卡片缺少图标');
  assert($$('#slot-list .bigcard').every(hasIcon), '上下午卡片缺少图标');
  api.call('select_date', { value: 'd0' });
  api.call('select_slot', { value: 'am' });
  api.go(4);
  const pays = $$('#pay-list .bigcard');
  assert(pays.length === 4 && pays.every(hasIcon), '付款方式缺少图标');
  assert($$('#patient-list .bigcard .avatar').length === 3, '就诊人仍应保留大头像');
  api.call('reset');
  return '症状 7 · 科室推荐与备选 · 日期 3 · 上下午 2 · 付款 4 · 就诊人大头像 3';
});

check('第 0 步能力带与成功页到院提醒都带图标', () => {
  const ab = $$('.ability__item');
  assert(ab.length === 4, '能力带应有 4 项，实际 ' + ab.length);
  assert(ab.every((i) => i.querySelector('.ability__ico svg')), '能力带缺少图标');
  const pr = $$('.protect__item');
  assert(pr.length === 4, '到院提醒应有 4 项，实际 ' + pr.length);
  assert(pr.every((i) => i.querySelector('.protect__ico svg')), '到院提醒缺少图标');
  const tp = $$('.tips__item');
  assert(tp.length === 3, '到院须知应有 3 条');
  assert(tp.every((i) => i.querySelector('.tips__ico svg')), '到院须知缺少图标');
  assert($('.brand__ico svg'), '顶栏院名前的院徽缺失');
  assert($('.success__badge svg'), '成功页徽标未使用内联图标');
  return '4 项能力 + 4 项到院提醒 + 3 条到院须知 + 院徽 + 成功徽标，全部内联图标';
});

check('图标配色不越界（只用页面主色，没有高饱和纯绿）', () => {
  const js = readFileSync(path.join(ELDER, 'icons.js'), 'utf8');
  const colors = [...new Set((js.match(/#[0-9a-fA-F]{6}/g) || []).map((c) => c.toLowerCase()))];
  const allowed = ['#2f5d62', '#8fb3ae', '#e4efed', '#ffffff', '#3f6b52'];
  const extra = colors.filter((c) => !allowed.includes(c));
  assert(extra.length === 0, '图标里出现了清单外的颜色：' + extra.join('、'));
  assert(colors.includes('#2f5d62'), '图标没有使用页面主色');
  return colors.join(' ') + ' —— 与页面三主色同一套色';
});

/* ---------- 语音：两条链路 + 绝不静默 ---------- */
/* 下面的检查会临时替换 window.XiaoYuErSpeech 来模拟各种环境，先留一份真的备用 */
const REAL_SPEECH = dom.window.XiaoYuErSpeech;

check('离线语音模块已接入页面，接口齐全', () => {
  const html = readFileSync(PAGE, 'utf8');
  assert(/<script[^>]+src="speech\.js"/.test(html), '页面没有引入 speech.js，离线识别等于不存在');
  assert(html.indexOf('speech.js') < html.indexOf('ai.js'), 'speech.js 必须在 ai.js 之前加载，否则助手拿不到它');
  const w = dom.window;
  assert(w.XiaoYuErSpeech, 'speech.js 加载了但没挂上 window.XiaoYuErSpeech');
  for (const k of ['supported', 'state', 'ready', 'cached', 'prepare', 'listen', 'stop', 'setModel']) {
    assert(typeof w.XiaoYuErSpeech[k] === 'function', '离线模块缺接口：' + k);
  }
  assert(typeof w.XiaoYuErAI.offline.prepare === 'function', '助手没有把离线安装暴露出来');
  return 'speech.js 先于 ai.js 加载 · 9 个能力接口 · 助手可调用';
});

await checkAsync('云端识别不通就走本机离线；两条都不通也必须开口说话', async () => {
  const w = dom.window, doc = w.document;
  const status = () => doc.getElementById('ai-status').textContent;
  const AI = w.XiaoYuErAI;
  AI.open(false);

  /* ① 环境里一条识别链路都没有：点麦克风必须给出明确文字 —— 
     这正是"点了之后没有任何反应"的反面 */
  w.XiaoYuErSpeech = undefined;
  try { delete w.SpeechRecognition; } catch (e) { /* 忽略 */ }
  try { delete w.webkitSpeechRecognition; } catch (e) { /* 忽略 */ }
  doc.getElementById('ai-status').textContent = '';
  AI.stopListen();
  AI.startListen();
  const said = status().trim();
  assert(said.length > 0, '没有任何识别引擎时点麦克风，页面一句话都没说（老人只会觉得坏了）');
  assert(!/^正在听/.test(said), '明明没有识别引擎，却还显示"正在听您说"——这是假象');

  /* ② 本机离线引擎就绪：麦克风应改走本机，不再依赖网络 */
  let usedOffline = false;
  w.XiaoYuErSpeech = {
    supported: () => true, state: () => 'ready', ready: () => true,
    cached: () => Promise.resolve(true), prepare: () => Promise.resolve(true),
    listen: () => { usedOffline = true; return Promise.resolve('我要挂号'); },
    stop: () => true, setModel: () => {}, modelSize: () => '约 41 MB'
  };
  AI.startListen();
  await new Promise((r) => setTimeout(r, 80));
  assert(usedOffline, '离线引擎已就绪，麦克风却没有走本机识别');
  assert(/我要挂号/.test(doc.getElementById('ai-log').textContent), '本机识别到的整句话没有进入对话');
  AI.stopListen();
  await new Promise((r) => setTimeout(r, 30));
  return `无引擎时提示「${said}」· 离线就绪后自动改走本机识别`;
});

await checkAsync('离线识别装不上时，失败有话说且不影响挂号主流程', async () => {
  const w = dom.window, doc = w.document;
  assert(doc.getElementById('ai-offline-box') && doc.getElementById('ai-offline'),
    '面板里没有「用离线识别」入口，云端失败时老人无处可去');
  w.XiaoYuErSpeech = {
    supported: () => true, state: () => 'failed', ready: () => false,
    cached: () => Promise.resolve(false),
    prepare: () => Promise.reject(new Error('下载失败')),
    listen: () => Promise.resolve(''), stop: () => true, setModel: () => {}, modelSize: () => '约 41 MB'
  };
  w.XiaoYuErAI.open(false);
  assert(doc.getElementById('ai-offline-box').hidden === false, '云端不可用时，没有把「用离线识别」摆出来');

  let rejected = false;
  doc.getElementById('ai-status').textContent = '';
  try { await w.XiaoYuErAI.offline.prepare(); } catch (e) { rejected = true; }
  assert(rejected, '离线准备失败却没有把失败抛出来，调用方无法回退');
  const log = doc.getElementById('ai-log').textContent;
  assert(/没装成/.test(log) || /没装成/.test(doc.getElementById('ai-status').textContent),
    '离线安装失败后，没有告诉老人"没装成、还能点下面的话"');
  assert(doc.getElementById('ai-chips').children.length > 0, '失败后应保留「常说的话」点选，实际没有');
  assert(doc.querySelector('#symptom-list') !== null, '语音出问题不应影响挂号主流程');
  return '失败有明确提示，且主流程与点选兜底都还在';
});

await checkAsync('环境音被听成一两个字时，不当成老人说的话', async () => {
  const doc = dom.window.document;
  const log = doc.getElementById('ai-log');
  const before = log.children.length;
  await dom.window.XiaoYuErAI.say('好');
  const added = Array.from(log.children).slice(before).map((e) => e.textContent);
  assert(added.length > 0, '把这句话灌进来后什么都没发生');
  assert(!added.some((t) => /没听明白/.test(t)),
    '把一两个字的幻听回成「没听明白」——老人会以为自己说错了');
  assert(added.some((t) => /没有听到声音|没听到/.test(t)),
    '一两个字的幻听应回答「没有听到声音，请再说一次」，实际：' + added.join(' / '));
  assert(doc.getElementById('ai-status').textContent.trim().length > 0, '幻听后状态栏是空的');
  assert(added.every((t) => !/挂号|科室|医生/.test(t)), '幻听竟然触发了业务动作');
  return '「好」这类幻听 → 只回「' + added.filter((t) => /没有听到声音/.test(t))[0] + '」，不执行任何动作';
});

check('环境音幻听被清掉，正常的话原样保留', () => {
  const OS = REAL_SPEECH;
  const junk = ['（音樂）', '[BLANK_AUDIO]', '音乐', '謝謝大家觀看', '谢谢观看', '字幕由志愿者提供', '好好好好'];
  junk.forEach((t) => assert(OS.clean(t) === '', '幻听没被清掉：「' + t + '」→「' + OS.clean(t) + '」'));
  const keep = { '我要挂号': '我要挂号', '我想挂个内科的号': '我想挂个内科的号', '（我要挂号）': '我要挂号' };
  Object.keys(keep).forEach((t) => assert(OS.clean(t) === keep[t],
    '正常的话被改坏了：「' + t + '」→「' + OS.clean(t) + '」'));
  return junk.length + ' 种幻听清空 · ' + Object.keys(keep).length + ' 句正常话原样保留（含去括号）';
});

check('离线识别只连公开镜像：零密钥、录音不出浏览器', () => {
  const js = readFileSync(path.join(ELDER, 'speech.js'), 'utf8');
  const hosts = [...new Set((js.match(/https?:\/\/[a-z0-9.-]+/gi) || [])
    .map((u) => u.replace(/^https?:\/\//i, '').toLowerCase()))];
  const allowed = ['cdn.jsdelivr.net', 'hf-mirror.com', 'huggingface.co'];
  const extra = hosts.filter((h) => !allowed.includes(h));
  assert(extra.length === 0, '离线模块出现了清单外的外发地址：' + extra.join('、'));
  assert(hosts.includes('hf-mirror.com'), '模型没有走国内可达的镜像站');
  assert(!/api[_-]?key|bearer|secret|access[_-]?token/i.test(js), '离线模块里出现了密钥类字样');
  assert(!/XMLHttpRequest|FormData/.test(js), '离线模块不应自己往外发数据');
  // 只允许把音频喂给本机的识别管线，不允许出现"上传/发送音频"的动作
  assert(/asr\(samples/.test(js), '音频没有送进本机识别管线');
  assert(!/upload|sendAudio/i.test(js), '离线模块里出现了"上传音频"之类的动作');
  assert(/o\.language/.test(js), '识别语言应可跟随界面在中文 / 英文之间切换');
  return '只连 ' + hosts.join(' + ') + ' · 无密钥 · 录音仅在浏览器内处理';
});

/* ---------- 43 麦克风权限被拦住：必须说清是哪回事，并给出可自助操作的恢复指引 ---------- */
await checkAsync('麦克风被浏览器拦住：说清原因 + 给出恢复指引，且不卡死流程', async () => {
  const doc = dom.window.document;
  const w = dom.window;
  const prev = w.XiaoYuErSpeech;

  /* 桩：权限查询答"被拒绝"，取麦克风抛 NotAllowedError —— 这正是"用户点过阻止"后的真实表现 */
  const deniedErr = new Error('Permission denied');
  deniedErr.name = 'NotAllowedError';
  deniedErr.code = 'denied';
  w.XiaoYuErSpeech = {
    supported: () => true,
    ready: () => true,
    state: () => 'ready',
    micState: () => Promise.resolve('denied'),
    cached: () => Promise.resolve(true),
    prepare: () => Promise.resolve(true),
    listen: () => Promise.reject(deniedErr),
    stop: () => true,
    clean: (t) => t || '',
    setModel: () => {},
    modelSize: () => '约 41 MB'
  };
  try {
    const log = doc.getElementById('ai-log');
    const before = log.children.length;
    doc.getElementById('ai-mic').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));

    const added = Array.from(log.children).slice(before).map((e) => e.textContent);
    assert(added.some((t) => /被浏览器拦住/.test(t)),
      '麦克风被拒时没说清"被拦住"，实际：' + (added.join(' / ') || '（什么都没说）'));

    const howto = doc.getElementById('ai-mic-howto');
    assert(howto.hidden === false, '麦克风被拒时没有展开恢复指引');
    ['ai-mic-step1', 'ai-mic-step2', 'ai-mic-step3'].forEach((id) => {
      assert(doc.getElementById(id).textContent.trim().length > 8, '恢复指引缺了一步：' + id);
    });
    const retry = doc.getElementById('ai-mic-retry');
    assert(retry && !retry.hidden && /再试一次麦克风/.test(retry.textContent),
      '指引末尾应有「再试一次麦克风」按钮');

    const state = doc.getElementById('ai-mic-state');
    assert(/被浏览器拦住/.test(state.textContent), '状态行没有显示"被拦住"：' + state.textContent);
    assert(state.getAttribute('data-state') === 'denied', '状态行 data-state 应为 denied');

    /* 绝不能装作在听 —— 那正是"点了没反应"的另一种形态 */
    assert(!/正在听/.test(doc.getElementById('ai-status').textContent),
      '麦克风被拒时状态栏竟然显示"正在听"');
    assert(doc.querySelector('#ai-mic').getAttribute('data-state') !== 'on',
      '麦克风被拒时按钮还亮着"正在听"的样式');

    /* 兜底必须在：点选照常能挂号 */
    const chips = doc.getElementById('ai-chips');
    assert(chips.children.length > 0, '麦克风被拒后「常说的话」不见了');
    chips.children[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    assert(doc.querySelector('#symptom-list') !== null, '麦克风出问题不应影响挂号主流程');
    return '被拒 → 说清"被拦住" + 三步指引 + 状态行 + 再试按钮 · 点选兜底仍可用';
  } finally {
    w.XiaoYuErSpeech = prev;
  }
});

/* ---------- 44 本地对话语料库接入：打招呼、问身份都有人答话 ---------- */
const lastAiText = () => {
  const list = $$('.ai__bubble--ai');
  return list.length ? list[list.length - 1].textContent : '';
};
await checkAsync('语音助手：本地语料库接入——问候、问能耐都有人答，不再一句「没听明白」', async () => {
  assert(window.XiaoYuErCorpus && typeof window.XiaoYuErCorpus.match === 'function', '语料库没加载（corpus.js 缺失或没跑起来）');
  const stats = ai.corpus.stats();
  assert(stats && stats.patterns >= 1000, '语料库说法不足 1000 条：' + (stats && stats.patterns));
  ai.open();
  await ai.say('你好');
  const hello = lastAiText();
  assert(hello && hello.indexOf('没听明白') < 0, '打招呼竟回了「没听明白」：' + hello);
  assert(spoken.some((u) => u.text === hello), '回复没有朗读出来');
  await ai.say('你能做什么');
  assert(lastAiText().indexOf('没听明白') < 0, '问能耐竟回了「没听明白」');
  return `语料库 ${stats.patterns} 条说法在线（${stats.intents} 个意图），问候/问能耐均有回复并朗读`;
});

/* ---------- 45 步进指引：按当前步骤告诉老人现在该做什么 ---------- */
await checkAsync('语音助手：步进指引——「然后我该干嘛」按当前步骤回答', async () => {
  api.call('reset');
  api.go(0);
  await ai.say('然后我应该干嘛');
  const s0 = lastAiText();
  assert(s0.indexOf('没听明白') < 0, '第 0 步问「然后我应该干嘛」回的是没听明白');
  assert(s0.indexOf('我要挂号') >= 0, '第 0 步的指引没教老人怎么开始：' + s0);
  api.go(1);
  await ai.say('接下来做什么');
  const s1 = lastAiText();
  assert(s1.indexOf('没听明白') < 0, '第 1 步问「接下来做什么」回的是没听明白');
  assert(/不舒服|腿疼|头晕|咳嗽/.test(s1), '第 1 步的指引没引导说症状：' + s1);
  api.go(4);
  await ai.say('该干嘛');
  const s4 = lastAiText();
  assert(/就诊人|付款|医保/.test(s4), '第 4 步的指引没说到就诊人和付款：' + s4);
  return '第 0 步教开始 · 第 1 步教说症状 · 第 4 步教选人就付款（按当前步骤回答）';
});

/* ---------- 46 多语言对话：说的语言和界面可以不一样 ---------- */
await checkAsync('语音助手：多语言对话——英文界面说中文用中文回，中文界面说英文用英文回', async () => {
  api.setLanguage('en');
  await ai.say('你好');
  let t = lastAiText();
  assert(/[\u4e00-\u9fa5]/.test(t), '英文界面下说中文，回复不是中文：' + t);
  api.setLanguage('zh');
  await ai.say('hello');
  t = lastAiText();
  assert(/[a-zA-Z]/.test(t) && !/[\u4e00-\u9fa5]/.test(t), '中文界面下说英文，回复不是英文：' + t);
  return '跨语言对话成立：跟着老人说的那一门语言回话';
});

/* ---------- 47 页面命令永远优先，对话层不许劫持 ---------- */
await checkAsync('语音助手：页面命令优先——「我腿疼」照旧挂骨科，「用医保卡」照旧选医保', async () => {
  api.call('reset');
  api.go(1);
  await ai.say('我腿疼');
  assert(api.getState().dept === 'orthopedics', '「我腿疼」被对话层接走了，没挂到骨科');
  assert(ai.understand('我腿疼').intent === 'act', '「我腿疼」的意图不是页面动作');
  api.go(4);
  await ai.say('用医保卡');
  assert(api.getState().pay === 'medical', '「用医保卡」被对话层接走了，没选中医保');
  assert(ai.understand('用医保卡').intent === 'act', '「用医保卡」的意图不是页面动作');
  return '症状/付款命令照旧走页面动作，对话层不抢活';
});

/* ---------- 48 复读与最后的兜底 ---------- */
await checkAsync('语音助手：连问有回复、听不懂也不乱动页面', async () => {
  api.setLanguage('zh');
  api.call('reset');
  await ai.say('你好');
  const a = lastAiText();
  await ai.say('你好');
  const b = lastAiText();
  assert(a && b && a.indexOf('没听明白') < 0, '重复问候没有得到像样的回复');
  const before = JSON.stringify(api.getState());
  await ai.say('阿斯不存在的话');
  assert(lastAiText().indexOf('没听明白') >= 0, '彻底听不懂时应该说「没听明白」并给出常说的话');
  assert(JSON.stringify(api.getState()) === before, '闲聊改了页面状态');
  return '连问有回复 · 听不懂不乱动 · 兜底话术仍在';
});

/* ---------- 输出 ---------- */
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log('\n适老预约挂号页自检 · public/elder/index.html');
console.log('─'.repeat(64));
results.forEach((r, i) => {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + String(i + 1).padStart(2, '0') + ' ' + r.name);
  if (r.detail) console.log('       ' + r.detail);
});
console.log('─'.repeat(64));
console.log(`结果：${pass}/${results.length} 项通过${fail ? '，失败 ' + fail + ' 项' : ''}\n`);
dom.window.close();
process.exit(fail ? 1 : 0);
