// 复现小医灵窄屏问题：开 panel 后截图 + dump 关键节点几何
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HTML = path.resolve(__dirname, '../public/elder/standalone.html');
const PORT = 19090;

function startServer() {
  return new Promise((res) => {
    const srv = http.createServer((req, response) => {
      const url = req.url.split('?')[0];
      const f = path.join(path.dirname(HTML), url === '/' ? 'standalone.html' : url);
      if (!fs.existsSync(f)) { response.statusCode = 404; return response.end(); }
      const ext = path.extname(f).toLowerCase();
      const mime = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'application/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'application/octet-stream';
      response.setHeader('Content-Type', mime);
      response.end(fs.readFileSync(f));
    });
    srv.listen(PORT, '127.0.0.1', () => res(srv));
  });
}

function findChrome() {
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Users/86178/AppData/Local/Google/Chrome/Application/chrome.exe'
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

(async () => {
  const srv = await startServer();
  const CHROME = findChrome();
  if (!CHROME) { console.log('chrome not found'); process.exit(2); }
  const CDP_PORT = 9222 + Math.floor(Math.random() * 100);
  const userData = `C:/Users/86178/.workbuddy/.chrome-cdp-${Date.now()}`;
  fs.mkdirSync(userData, { recursive: true });
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--no-proxy-server', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userData}`,
    `http://127.0.0.1:${PORT}/standalone.html`
  ], { stdio: 'ignore' });

  await new Promise(r => setTimeout(r, 2500));

  // poll for target
  let target = null;
  for (let i = 0; i < 30 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
      target = list.find(t => t.type === 'page');
    } catch (e) { /* not ready */ }
    if (!target) await new Promise(r => setTimeout(r, 200));
  }
  if (!target) throw new Error('CDP 未就绪');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  };
  const send = (method, params) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    return new Promise((res, rej) => pending.set(i, { resolve: res, reject: rej }));
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await send('Page.enable');
  await send('Runtime.enable');
  // 模拟用户图片里的设备：390x844
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1000);
  console.log('XiaoYiLing loaded:', (await send('Runtime.evaluate', { expression: 'window.XiaoYiLing ? "ok" : "no"', returnByValue: true })).result.value);

  await sleep(800);
  // 打开面板
  await send('Runtime.evaluate', { expression: 'window.XiaoYiLing.open(false)' });
  await sleep(500);

  // 1. 测量 panel 各关键节点
  const dump = await send('Runtime.evaluate', { expression: `(()=>{
    const r = {};
    try {
    const ids = ['medic-panel','medic-box','medic-log','medic-voicehint','medic-chips','medic-disclaimer','medic-tip','medic-orb'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) { r[id] = 'MISSING'; return; }
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      r[id] = {
        rect: {x:rect.x|0, y:rect.y|0, w:rect.width|0, h:rect.height|0, right:rect.right|0, bottom:rect.bottom|0},
        hidden: el.hidden,
        pe: style.pointerEvents,
        ov: style.overflow,
        h: style.height,
        mh: style.maxHeight,
        minH: style.minHeight
      };
    });
    /* box 用 class 选 */
    const boxEl = document.querySelector('.medic__box');
    if (boxEl) {
      const r2 = boxEl.getBoundingClientRect();
      r['__box'] = {x:r2.x|0,y:r2.y|0,w:r2.width|0,h:r2.height|0,sh:boxEl.scrollHeight};
    }
      r['panel-scrollHeight'] = document.getElementById('medic-log').scrollHeight;
    r['panel-box-height'] = (function(){const b=document.getElementById('medic-box');return b?b.clientHeight:null;})();
    r['window-h'] = innerHeight;
      const m = document.querySelector('#medic-log .medic__text');
      r['first-msg'] = m ? m.textContent : '';
      r['form'] = document.getElementById('medic-root').getAttribute('data-form');
      const box = document.getElementById('medic-box');
      r['panel-box-height'] = box ? box.clientHeight : 'NULL';
      const tip = document.getElementById('medic-tip');
      if (tip) r['tip-opacity'] = getComputedStyle(tip).opacity;
    } catch (e) { r['err'] = String(e); }
    return JSON.stringify(r);
  })()`, returnByValue: true });
  const j = dump.result.value ? JSON.parse(dump.result.value) : {};
  console.log('=== 节点几何 ===');
  Object.keys(j).forEach(k => console.log('  ' + k + ': ' + JSON.stringify(j[k])));

  // 2. 截图
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const data = shot && shot.data;
  const buf = data ? Buffer.from(data, 'base64') : null;
  if (buf) {
    const out = path.join(__dirname, 'repro-orb.png');
    fs.writeFileSync(out, buf);
    console.log('截图:', out, 'size:', buf.length);
  } else {
    console.log('截图失败 shot=', JSON.stringify(shot).slice(0, 200));
  }

  // 3. mic 按钮几何
  const micInfo = await send('Runtime.evaluate', { expression: `(()=>{
    const m = document.getElementById('medic-mic');
    const r = m.getBoundingClientRect();
    return {x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,state:m.dataset.state,text:document.getElementById('medic-mic-label').textContent};
  })()`, returnByValue: true });
  console.log('mic 按钮几何:', micInfo.result.value);

  // 4. disclaimer
  const disInfo = await send('Runtime.evaluate', { expression: `(()=>{
    const d = document.getElementById('medic-disclaimer');
    const r = d.getBoundingClientRect();
    const box = document.getElementById('medic-box').getBoundingClientRect();
    return {dTop:r.top|0, dBottom:r.bottom|0, boxBottom:box.bottom|0, visible:r.bottom <= box.bottom + 1, text:d.textContent.slice(0,60)};
  })()`, returnByValue: true });
  console.log('disclaimer:', disInfo.result.value);

  // 5. tip 状态
  const tipInfo = await send('Runtime.evaluate', { expression: `(()=>{
    const t = document.getElementById('medic-tip');
    if (!t) return 'no tip';
    const r = t.getBoundingClientRect();
    const cs = getComputedStyle(t);
    return {hidden:t.hidden, opacity:cs.opacity, x:r.x|0, y:r.y|0, w:r.width|0, h:r.height|0, text:t.textContent};
  })()`, returnByValue: true });
  console.log('tip 状态:', tipInfo.result.value);

  ws.close();
  proc.kill();
  srv.close();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.error('ERR', e); process.exit(1); });
