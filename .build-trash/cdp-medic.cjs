/* CDP 真机测试：小医灵面板可关闭 + 全页只有一个可移动悬浮语音模块
 * Node 22 全局 WebSocket 直连 Chrome DevTools Protocol，不依赖第三方包。
 * 真实鼠标事件（Input.dispatchMouseEvent）——el.click() 会绕过命中测试，
 * 历史上正是因此漏掉了 pointer-events 导致的面板点不动。
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ELDER = path.resolve(__dirname, '..', 'public', 'elder');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 18131;
const CDP_PORT = 9222;

/* ---------- 静态服务（文本响应强制 utf-8） ---------- */
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ELDER, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(p)] || 'text/plain') + '; charset=utf-8' });
    res.end(data);
  });
});

/* ---------- 极简 CDP 客户端 ---------- */
let ws, msgId = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  return r.result.value;
}
async function mouse(type, x, y, extra) {
  await send('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', clickCount: 1 }, extra || {}));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = [];
let fail = 0;
function T(name, ok, extra) { out.push((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '（' + extra + '）' : '')); if (!ok) fail++; }

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-medic-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
    '--window-size=1280,860', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    /* 等 CDP 起来 */
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(250);
      try {
        const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
        target = list.find((t) => t.type === 'page');
      } catch (e) { /* 还没起 */ }
    }
    if (!target) throw new Error('Chrome CDP 未就绪');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    const consoleErrors = [];
    await send('Log.enable');

    const nav = await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
    if (nav.errorText) throw new Error('导航失败: ' + nav.errorText);
    await sleep(1200);

    const html = await evalJs('document.documentElement.outerHTML');
    T('页面无 workbuddy 字眼', !/workbuddy/i.test(html));

    /* ===== 1. 全页只有一个悬浮语音模块（可移动的那个） ===== */
    const fabN = await evalJs("document.querySelectorAll('#aifab, .aifab').length");
    const orbN = await evalJs("document.querySelectorAll('#medic-orb, .medic-orb').length");
    T('小魚兒固定悬浮球已移除', fabN === 0, '找到 ' + fabN + ' 个');
    T('小医灵可移动光点在', orbN === 1, '找到 ' + orbN + ' 个');
    T('小醫兒面板仍可从页内入口打开', await evalJs("!!document.getElementById('ai-inline-open')"));

    /* ===== 2. 光点开面板 → 真实鼠标点关闭按钮 → 面板收起 ===== */
    await evalJs("document.getElementById('medic-inline-open').click()");
    await sleep(300);
    T('入口卡片能打开小医灵面板', await evalJs("!document.getElementById('medic-panel').hidden"));
    const closeBox = await evalJs("(()=>{const r=document.getElementById('medic-close').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await mouse('mousePressed', closeBox.x, closeBox.y);
    await mouse('mouseReleased', closeBox.x, closeBox.y);
    await sleep(250);
    T('【核心回归】真实点击关闭按钮能关上面板', await evalJs("document.getElementById('medic-panel').hidden"));
    T('关闭后形态恢复漂浮', (await evalJs("document.getElementById('medic-root').getAttribute('data-form')")) !== 'chat');

    /* ===== 3. 点光点开面板 → 遮罩点击关闭 → Esc 关闭 ===== */
    const orbBox = await evalJs("(()=>{const r=document.getElementById('medic-orb').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await mouse('mousePressed', orbBox.x, orbBox.y);
    await mouse('mouseReleased', orbBox.x, orbBox.y);
    await sleep(300);
    T('真实点击光点能打开面板', await evalJs("!document.getElementById('medic-panel').hidden"));
    await mouse('mousePressed', 8, 8);           // 左上角空白处 = 遮罩
    await mouse('mouseReleased', 8, 8);
    await sleep(250);
    T('【核心回归】真实点击遮罩能关上面板', await evalJs("document.getElementById('medic-panel').hidden"));

    await evalJs("document.getElementById('medic-orb').click()");
    await sleep(250);
    T('再次打开面板', await evalJs("!document.getElementById('medic-panel').hidden"));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(250);
    T('【核心回归】Esc 能关上面板', await evalJs("document.getElementById('medic-panel').hidden"));

    /* ===== 4. 面板内真实鼠标点选 chips（问诊流程能走下去） ===== */
    await evalJs("document.getElementById('medic-inline-open').click()");
    await sleep(250);
    await evalJs("window.XiaoYiLing.ask('我头痛')");
    await sleep(200);
    const chip = await evalJs("(()=>{const c=document.querySelector('#medic-chips .medic__chip');if(!c)return null;const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,text:c.textContent};})()");
    T('问诊追问题出了点选 chips', !!chip);
    if (chip) {
      await mouse('mousePressed', chip.x, chip.y);
      await mouse('mouseReleased', chip.x, chip.y);
      await sleep(250);
      const qi = await evalJs('window.XiaoYiLing.session().qi');
      T('【核心回归】真实鼠标点 chips 能推进问诊', qi >= 1, 'qi=' + qi);
    }

    /* ===== 5. 小醫兒面板真实关闭（同样不能被挡） ===== */
    await evalJs("document.getElementById('ai-inline-open').click()");
    await sleep(300);
    T('小醫兒面板能打开', await evalJs("!document.getElementById('ai-panel').hidden"));
    const aiClose = await evalJs("(()=>{const r=document.getElementById('ai-close').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
    await mouse('mousePressed', aiClose.x, aiClose.y);
    await mouse('mouseReleased', aiClose.x, aiClose.y);
    await sleep(250);
    T('小醫兒面板能真实关闭', await evalJs("document.getElementById('ai-panel').hidden"));

    /* ===== 6. 形态：长按 450ms 变机器人 + 拖动跟手 ===== */
    /* 先确认真实关闭（防上一节残留），再测长按 */
    if (!(await evalJs("document.getElementById('medic-panel').hidden"))) {
      const cb = await evalJs("(()=>{const r=document.getElementById('medic-close').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
      await mouse('mousePressed', cb.x, cb.y);
      await mouse('mouseReleased', cb.x, cb.y);
      await sleep(300);
    }
    await mouse('mousePressed', orbBox.x, orbBox.y);
    await sleep(600);
    const formPress = await evalJs("document.getElementById('medic-root').getAttribute('data-form')");
    await mouse('mouseMoved', orbBox.x - 60, orbBox.y + 40);
    await sleep(150);
    const moved = await evalJs("window.XiaoYiLing.state()");
    await mouse('mouseReleased', orbBox.x - 60, orbBox.y + 40);
    T('长按 450ms 进入 pressing/dragging', formPress === 'pressing' || formPress === 'dragging', formPress);
    T('拖动后光点跟随指针', Math.abs(moved.x - (orbBox.x - 60)) < 60, 'x=' + Math.round(moved.x));
    await sleep(3200);
    T('松手 3 秒后恢复漂浮', (await evalJs("document.getElementById('medic-root').getAttribute('data-form')")) !== 'dragging');

    /* ===== 7. 红旗一句话直通 120 ===== */
    await evalJs("document.getElementById('medic-orb').click()");
    await sleep(200);
    await evalJs("window.XiaoYiLing.ask('我胸口疼得厉害，还出冷汗')");
    await sleep(200);
    const log = await evalJs("document.getElementById('medic-log').textContent");
    T('红旗句给 120 + 急诊', /120/.test(log) && /急诊/.test(log));

    /* ===== 8. 3 秒采样：漂浮中的光点不遮挡任何可点元素 ===== */
    /* 注意：松手有 3 秒停留（规格如此），必须等停留结束再采样，测的是稳态避让 */
    await sleep(3400);
    let overlap = 0; const hits = [];
    for (let i = 0; i < 10; i++) {
      const r = await evalJs(`(()=>{
        const orb=document.getElementById('medic-orb').getBoundingClientRect();
        const els=document.querySelectorAll('button, .ai-inline__btn, .medic-inline__btn, #actionbar button, .stepbar button');
        let n=0, who='';
        els.forEach(el=>{
          if(el.id==='medic-orb'||el.closest('#medic-orb'))return;  /* 光点自己不算遮挡 */
          const r=el.getBoundingClientRect();
          if(r.width&&r.height&&!(orb.right<r.left||orb.left>r.right||orb.bottom<r.top||orb.top>r.bottom)){n++;who=who||(el.id||el.className);}});
        return {n:n,who:who};
      })()`);
      overlap += r.n;
      if (r.who && hits.indexOf(r.who) < 0) hits.push(r.who);
      await sleep(300);
    }
    T('3 秒采样漂浮光点零遮挡', overlap === 0, '累计遮挡 ' + overlap + ' 次' + (hits.length ? '，压住：' + hits.join('/') : ''));

    /* ===== 9. 窄屏 390×844：面板可开可关、不溢出 ===== */
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(500);
    await evalJs("document.getElementById('medic-orb').click()");
    await sleep(300);
    const narrow = await evalJs(`(()=>{
      const p=document.getElementById('medic-panel'), x=document.getElementById('medic-close').getBoundingClientRect();
      return {open:!p.hidden, closeVisible:x.top>=0&&x.bottom<=innerHeight&&x.left>=0&&x.right<=innerWidth,
              overflow:document.documentElement.scrollWidth>innerWidth+1};
    })()`);
    T('窄屏面板能打开', narrow.open);
    T('窄屏关闭按钮在视口内', narrow.closeVisible);
    T('窄屏无横向溢出', !narrow.overflow);
    await mouse('mousePressed', 12, 12);
    await mouse('mouseReleased', 12, 12);
    await sleep(250);
    T('窄屏真实点击遮罩能关闭', await evalJs("document.getElementById('medic-panel').hidden"));

    console.log(out.join('\n'));
    console.log(fail ? 'FAIL ' + fail : 'ALL PASS（' + out.length + ' 项）');
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.log(out.join('\n'));
    console.log('异常：' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (e) {}
    chrome.kill();
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})();
