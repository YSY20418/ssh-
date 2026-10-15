/* ============================================================
   小医灵 · 医疗预问诊智能体（挂在适老预约挂号页上的「健康顾问」）

   它是谁：
   网页里一个会漂浮的医疗蓝绿色小光点，点一下变成小机器人，
   陪老人把症状一条一条理清楚——先排危险信号，再问关键问题，
   最后给分级建议和公开科普。它不诊断、不开药、不处理急症，
   只是把「该不该去医院、多快、大概看哪一科」帮老人想明白。

   形态状态机（与前端控制器约定，顺序不可乱）：
     idle      漂浮：20-40px/s 缓慢移动、随机转向、碰视口边缘反弹；
                同时避开输入框、按钮、弹窗关闭钮、视频控件和重要文字，
                不遮挡老人操作。
     hover     悬停：轻微放大、发光，气泡提示「点击问诊 / 长按拖动」。
     pressing  长按：按住超过 450ms 变机器人形态（头、眼睛、天线、小手）。
     dragging  拖动：长按后指针移动超过 6px，机器人跟指针走，限制在视口内。
     chat      对话：点一下（未长按）打开对话面板，暂停漂浮，
                机器人可眨眼、点头；关闭面板恢复漂浮。
     松手后停留在当前位置，3 秒无操作恢复光点形态继续漂浮。

   问诊流程（安全优先，顺序即优先级）：
     共情一句 → 红旗筛查（命中立即建议 120/急诊，不进普通问诊）
     → 一次最多 3 个关键问题（点选 chips，老人不用打字）
     → 四级分诊（立即急诊 / 24 小时内 / 预约门诊 / 居家观察）
     → 通俗科普 + 免责声明 + 1-3 个公开权威来源。

   检索增强：
     每次问答先查本地知识库 window.XiaoYiLingKB（data/medic-kb.json
     的编译产物）；平台提供检索能力时，用 setSearch(fn) 挂上去，
     fn 内部可调 knowledge_base_search / web_search，结果按来源优先级
     合并进引用。检索不到可靠资料时明说「建议咨询医生」，不编造。

   三条硬约束（与主项目一致）：
   1. 智能体只做决策与话术，不碰页面；只有老人点「我想挂号」才
      走 XiaoYuEr.nav('restart') 白名单动作。
   2. 零依赖、纯 ES5、双击文件就能跑；没有麦克风、没有网络照样能
      全程点选完成问诊。
   3. 隐私：不索要姓名、身份证、手机号，并提醒老人不要发送。
   ============================================================ */
(function () {
  'use strict';

  var X = window.XiaoYuEr;
  var KB = window.XiaoYiLingKB;
  if (!X || !KB) return;

  /* ---------------- 三语文案 ---------------- */
  var I18N = {
    zh: {
      'medic.title': '小医灵 · 医疗问诊',
      'medic.sub': '先排危险，再慢慢问',
      'medic.close': '关闭',
      'medic.tip': '点击问诊 · 长按拖动',
      'medic.orbLabel': '小医灵，点我问诊',
      'medic.inlineTitle': '不舒服？先问小医灵',
      'medic.inlineDesc': '点一下，它帮您看看要不要紧、该看哪一科（不替医生下诊断）',
      'medic.hello': '您好，我是小医灵。哪里不舒服，点下面的字，或者按住麦克风说一句都行。',
      'medic.mic': '按住说话',
      'medic.micStop': '不说了',
      'medic.listening': '我在听，您说…',
      'medic.recognizing': '正在认您说的话…',
      'medic.noSpeech': '没听到声音。您离近一点再说一次，或者直接点下面的字。',
      'medic.noVoice': '这台设备现在还不能直接说话。可以在右下角「小鱼儿」面板里点一次「用离线识别」装好；现在先点下面的字，一样能问。',
      'medic.voiceReady': '说话功能已就绪，按住麦克风就能说。',
      'medic.voiceLoading': '正在装说话功能…',
      'medic.chipsLabel': '您可以这样点：',
      'medic.askMore': '就这些，给我建议',
      'medic.restart': '重新问一次',
      'medic.booking': '我想挂号',
      'medic.thanks': '不客气。您多保重，有不舒服随时再问我。',
      'medic.erNote': '这种情况请不要等我，立即拨打 120 或去最近的急诊——这是现在最要紧的事。',
      'medic.escalated': '您刚才的回答里有危险信号，我按急症提醒您：',
      'medic.searching': '正在查公开资料…',
      'medic.noSource': '我暂未检索到足够可靠的公开资料，这种情况建议您直接咨询医生。',
      'medic.bookingGo': '好的，我请您回到挂号第一步，从选症状开始。选好症状我就能接着帮您。',
      'medic.askWhat': '您主要是哪里不舒服？',
      'medic.qIndex': '第 {n} 个问题',
      'medic.levelLabel': '我的建议：'
    },
    'zh-Hant': {
      'medic.title': '小醫靈 · 醫療問診',
      'medic.sub': '先排危險，再慢慢問',
      'medic.close': '關閉',
      'medic.tip': '點擊問診 · 長按拖動',
      'medic.orbLabel': '小醫靈，點我問診',
      'medic.inlineTitle': '不舒服？先問小醫靈',
      'medic.inlineDesc': '點一下，它幫您看看要不要緊、該看哪一科（不替醫生下診斷）',
      'medic.hello': '您好，我是小醫靈。哪裡不舒服，點下面的字，或者按住麥克風說一句都行。',
      'medic.mic': '按住說話',
      'medic.micStop': '不說了',
      'medic.listening': '我在聽，您說…',
      'medic.recognizing': '正在認您說的話…',
      'medic.noSpeech': '沒聽到聲音。您離近一點再說一次，或者直接點下面的字。',
      'medic.noVoice': '這台設備現在還不能直接說話。可以在右下角「小魚兒」面板裡點一次「用離線識別」裝好；現在先點下面的字，一樣能問。',
      'medic.voiceReady': '說話功能已就緒，按住麥克風就能說。',
      'medic.voiceLoading': '正在裝說話功能…',
      'medic.chipsLabel': '您可以這樣點：',
      'medic.askMore': '就這些，給我建議',
      'medic.restart': '重新問一次',
      'medic.booking': '我想掛號',
      'medic.thanks': '不客氣。您多保重，有不舒服隨時再問我。',
      'medic.erNote': '這種情況請不要等我，立即撥打 120 或去最近的急診——這是現在最要緊的事。',
      'medic.escalated': '您剛才的回答裡有危險信號，我按急症提醒您：',
      'medic.searching': '正在查公開資料…',
      'medic.noSource': '我暫未檢索到足夠可靠的公開資料，這種情況建議您直接諮詢醫生。',
      'medic.bookingGo': '好的，我請您回到掛號第一步，從選症狀開始。選好症狀我就能接著幫您。',
      'medic.askWhat': '您主要是哪裡不舒服？',
      'medic.qIndex': '第 {n} 個問題',
      'medic.levelLabel': '我的建議：'
    },
    en: {
      'medic.title': 'Ling · Pre-consultation',
      'medic.sub': 'Safety first, then details',
      'medic.close': 'Close',
      'medic.tip': 'Tap to ask · hold to drag',
      'medic.orbLabel': 'Ling, tap to ask',
      'medic.inlineTitle': 'Feel unwell? Ask Ling first',
      'medic.inlineDesc': 'Tap and it helps you judge urgency and which clinic, without replacing a doctor',
      'medic.hello': 'Hello, I am Ling. Tell me what hurts: tap a phrase below, or hold the mic and speak.',
      'medic.mic': 'Hold to speak',
      'medic.micStop': 'Stop',
      'medic.listening': 'I am listening…',
      'medic.recognizing': 'Recognizing what you said…',
      'medic.noSpeech': 'I did not hear anything. Come closer and try again, or tap a phrase below.',
      'medic.noVoice': 'This device cannot listen yet. Install offline recognition once from the XiaoYuEr panel at the bottom right; for now, tapping the phrases below works just as well.',
      'medic.voiceReady': 'Voice is ready. Hold the mic and speak.',
      'medic.voiceLoading': 'Preparing voice…',
      'medic.chipsLabel': 'You can tap:',
      'medic.askMore': 'That is all, give advice',
      'medic.restart': 'Start over',
      'medic.booking': 'I want to book',
      'medic.thanks': 'You are welcome. Take care, and ask me any time.',
      'medic.erNote': 'Please do not wait for me. Call 120 or go to the nearest ER now, that is the most urgent thing.',
      'medic.escalated': 'One of your answers contains a danger sign. Treating this as an emergency:',
      'medic.searching': 'Checking public sources…',
      'medic.noSource': 'I could not find reliable public sources for this. Please ask a doctor directly.',
      'medic.bookingGo': 'Sure, taking you back to booking step one. Pick your symptom and I will keep helping.',
      'medic.askWhat': 'Where do you feel unwell?',
      'medic.qIndex': 'Question {n}',
      'medic.levelLabel': 'My advice:'
    }
  };
  X.registerI18n(I18N);
  var T = function (k, v) { return X.t(k, v); };

  /* ---------------- 机器人图形（医疗蓝绿，白主体 + 深青描边） ---------------- */
  var BOT_SVG =
    '<svg class="bot" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    '<line x1="24" y1="7" x2="24" y2="12.5" stroke="#2F5D62" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="24" cy="5.4" r="2.6" fill="#2F5D62"/>' +
    '<circle cx="6.5" cy="30" r="3.1" fill="#E4EFED" stroke="#2F5D62" stroke-width="1.8"/>' +
    '<circle cx="41.5" cy="30" r="3.1" fill="#E4EFED" stroke="#2F5D62" stroke-width="1.8"/>' +
    '<rect x="10" y="12" width="28" height="24" rx="9" fill="#FFFFFF" stroke="#2F5D62" stroke-width="2.2"/>' +
    '<g class="bot__eyes">' +
    '<circle class="bot__eye" cx="18.6" cy="23" r="2.7" fill="#2F5D62"/>' +
    '<circle class="bot__eye" cx="29.4" cy="23" r="2.7" fill="#2F5D62"/>' +
    '</g>' +
    '<path class="bot__mouth" d="M19 30.6c2.3 2.1 7.7 2.1 10 0" stroke="#2F5D62" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M23.2 16.4h1.6v1.6h1.6v1.6h-1.6v1.6h-1.6v-1.6h-1.6v-1.6h1.6z" fill="#2F5D62"/>' +
    '</svg>';

  /* ---------------- DOM：光点 / 机器人 + 对话面板 ---------------- */
  var root = document.createElement('div');
  root.className = 'medic';
  root.id = 'medic-root';
  root.innerHTML =
    '<button type="button" class="medic-orb" id="medic-orb" aria-haspopup="dialog">' +
      '<span class="medic-orb__glow" aria-hidden="true"></span>' +
      '<span class="medic-orb__dot" aria-hidden="true"></span>' +
      '<span class="medic-orb__bot" aria-hidden="true">' + BOT_SVG + '</span>' +
    '</button>' +
    '<span class="medic-tip" id="medic-tip" hidden></span>' +
    '<div class="medic-panel" id="medic-panel" hidden>' +
      '<div class="medic__mask" data-medic-close="1"></div>' +
      '<div class="medic__box" role="dialog" aria-modal="true" aria-labelledby="medic-title">' +
        '<div class="medic__head">' +
          '<span class="medic__mark" aria-hidden="true">' + BOT_SVG + '</span>' +
          '<div class="medic__headtext">' +
            '<h2 class="medic__title" id="medic-title"></h2>' +
            '<p class="medic__status" id="medic-status"></p>' +
          '</div>' +
          '<button type="button" class="medic__x" id="medic-close"></button>' +
        '</div>' +
        '<div class="medic__log" id="medic-log" role="log" aria-live="polite"></div>' +
        '<div class="medic__row">' +
          '<button type="button" class="medic__mic" id="medic-mic" data-state="off">' +
            '<span class="medic__ring" aria-hidden="true"></span>' +
            '<span id="medic-mic-label"></span>' +
          '</button>' +
          '<button type="button" class="medic__stop" id="medic-stop" hidden></button>' +
        '</div>' +
        '<p class="medic__voicehint" id="medic-voicehint" hidden></p>' +
        '<p class="medic__chiplabel" id="medic-chiplabel"></p>' +
        '<div class="medic__chips" id="medic-chips"></div>' +
        '<p class="medic__disclaimer" id="medic-disclaimer"></p>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);

  var orb = document.getElementById('medic-orb');
  var tip = document.getElementById('medic-tip');
  var panel = document.getElementById('medic-panel');
  var logBox = document.getElementById('medic-log');
  var statusEl = document.getElementById('medic-status');
  var chipsBox = document.getElementById('medic-chips');
  var chipLabel = document.getElementById('medic-chiplabel');
  var micBtn = document.getElementById('medic-mic');
  var micLabel = document.getElementById('medic-mic-label');
  var stopBtn = document.getElementById('medic-stop');
  var voiceHint = document.getElementById('medic-voicehint');
  var disclaimerEl = document.getElementById('medic-disclaimer');
  var botBox = orb.querySelector('.medic-orb__bot');

  /* ============================================================
     一、形态状态机：漂浮 / 避让 / 悬停 / 长按 / 拖动 / 对话
     ============================================================ */
  var form = 'idle';           // idle | hover | pressing | dragging | chat
  var ORB = 34;                // 光点直径（与 CSS 保持一致）
  var pos = { x: 0, y: 0 };
  var ang = 0;
  var spd = 26;                // 当前速度 px/s（20-40 之间随机）
  var rafId = null;
  var lastT = 0;
  var parkTimer = null;        // 松手后 3 秒恢复漂浮
  var wanderAt = 0;
  var zones = [];
  var zonesAt = 0;
  var reduced = false;
  try {
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { reduced = false; }

  function vp() {
    return {
      w: window.innerWidth || document.documentElement.clientWidth || 320,
      h: window.innerHeight || document.documentElement.clientHeight || 480
    };
  }

  function initPos() {
    var v = vp();
    pos.x = Math.max(8, v.w - ORB - 18);
    pos.y = Math.max(8, v.h - ORB - 96);
    ang = -Math.PI * (0.55 + Math.random() * 0.2);
    apply();
    /* 右下角正是小鱼儿悬浮按钮待的地方，初始位置可能直接压在它上面 ——
       先避开再开漂，不然老人第一眼就看到两个按钮叠在一起。 */
    zones = collectZones();
    for (var i = 0; i < 24 && hitZone(); i++) {
      pos.y -= 12;
      if (pos.y < 8) { pos.y = 8; pos.x = Math.max(8, pos.x - 70); }
      apply();
    }
  }

  function apply() {
    orb.style.left = pos.x + 'px';
    orb.style.top = pos.y + 'px';
    /* 气泡跟着光点走，始终浮在它上方 */
    tip.style.left = (pos.x + ORB / 2) + 'px';
    tip.style.top = pos.y + 'px';
  }

  /* 避让区：输入框、按钮、弹窗、视频、底部操作栏、步骤条、右栏、重要文字。
     老人最怕「想点的东西被挡住」，所以光点宁可绕路也不压上去。 */
  var AVOID_SEL = 'button, input, textarea, select, .ai__box, .ai-inline__btn, ' +
    '.modal__box, #actionbar, .stepbar, #aside, video, .title, .notice__strong, ' +
    '[data-medic-avoid]';

  function collectZones() {
    var out = [];
    var list = document.querySelectorAll(AVOID_SEL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el || el === orb) continue;
      if (root.contains(el)) continue;                 // 自己的面板/光点不算
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;             // 隐藏元素没有 Rect
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    }
    return out;
  }

  function hitZone() {
    var pad = ORB / 2 + 4;
    var x0 = pos.x - pad, y0 = pos.y - pad, x1 = pos.x + ORB + pad, y1 = pos.y + ORB + pad;
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (x1 > z.x && x0 < z.x + z.w && y1 > z.y && y0 < z.y + z.h) return z;
    }
    return null;
  }

  function steer(z) {
    /* 一次推到底，但只挑「推得出去」的方向：贴在视口边缘的区域
       （比如右下角的悬浮按钮）往那一边推会被边界钳位抵消，光点会
       永远卡在原地，还会把老人的点击挡掉。四个方向都出不去时就地转向。 */
    var pad = ORB / 2 + 4;
    var v = vp();
    var cands = [
      { x: z.x + z.w + pad, y: pos.y, ang: 0 },        // 往右
      { x: z.x - ORB - pad, y: pos.y, ang: Math.PI },  // 往左
      { x: pos.x, y: z.y + z.h + pad, ang: Math.PI / 2 },   // 往下
      { x: pos.x, y: z.y - ORB - pad, ang: -Math.PI / 2 }   // 往上
    ];
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c.x < 6 || c.y < 6 || c.x > v.w - ORB - 6 || c.y > v.h - ORB - 6) continue;
      var d = Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y);
      if (!best || d < best.d) best = { c: c, d: d };
    }
    if (best) {
      pos.x = best.c.x;
      pos.y = best.c.y;
      ang = best.c.ang + (Math.random() - 0.5) * 0.6;
    } else {
      ang += Math.PI / 2;                 // 四面都堵住：转个方向等它让开
    }
    spd = 20 + Math.random() * 20;
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    if (form !== 'idle') { lastT = now; return; }
    var dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (!dt) return;

    if (now > wanderAt) {                    // 随机转向，走出自然的曲线
      wanderAt = now + 1200 + Math.random() * 1800;
      ang += (Math.random() - 0.5) * 1.1;
      spd = 20 + Math.random() * 20;
    }
    if (now > zonesAt) { zonesAt = now + 500; zones = collectZones(); }

    pos.x += Math.cos(ang) * spd * dt;
    pos.y += Math.sin(ang) * spd * dt;

    var v = vp();
    if (pos.x < 6) { pos.x = 6; ang = Math.PI - ang; }
    if (pos.y < 6) { pos.y = 6; ang = -ang; }
    if (pos.x > v.w - ORB - 6) { pos.x = v.w - ORB - 6; ang = Math.PI - ang; }
    if (pos.y > v.h - ORB - 6) { pos.y = v.h - ORB - 6; ang = -ang; }

    var z = hitZone();
    if (z) steer(z);
    apply();
  }

  function startFloat() {
    if (reduced || rafId) return;
    lastT = 0;
    rafId = requestAnimationFrame(loop);
  }
  function stopFloat() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function setForm(next) {
    if (form === next) return;
    form = next;
    root.setAttribute('data-form', next);
    if (next === 'chat') { stopFloat(); clearPark(); }
    else if (next === 'dragging' || next === 'pressing') { clearPark(); }
    else if (next === 'idle') { startFloat(); }
  }

  function clearPark() {
    if (parkTimer) { clearTimeout(parkTimer); parkTimer = null; }
  }
  /* 松手后停留 3 秒，让老人看清它在哪，再继续漂 */
  function park() {
    clearPark();
    stopFloat();
    parkTimer = setTimeout(function () {
      parkTimer = null;
      if (form === 'idle') startFloat();
    }, 3000);
  }

  /* ---------- 指针交互：点击开面板 / 长按变机器人 / 拖动 ---------- */
  var press = null;   // { x, y, t, armed, moved }

  function pressStart(cx, cy) {
    press = { x: cx, y: cy, t: Date.now(), armed: false, moved: false };
    orb.classList.add('is-pressing');
    press.timer = setTimeout(function () {
      if (!press) return;
      press.armed = true;
      setForm('pressing');
    }, 450);
  }

  function pressMove(cx, cy) {
    if (!press) return;
    var dx = cx - press.x, dy = cy - press.y;
    if (!press.moved && Math.sqrt(dx * dx + dy * dy) > 6) {
      press.moved = true;
      setForm('dragging');
    }
    if (press.moved) {
      var v = vp();
      pos.x = Math.max(6, Math.min(v.w - ORB - 6, cx - ORB / 2));
      pos.y = Math.max(6, Math.min(v.h - ORB - 6, cy - ORB / 2));
      apply();
    }
  }

  function pressEnd() {
    if (!press) return;
    var p = press;
    press = null;
    if (p.timer) clearTimeout(p.timer);
    orb.classList.remove('is-pressing');
    if (p.moved) {
      setForm('idle');
      park();                                   // 拖完停 3 秒再漂
      return;
    }
    if (p.armed) { setForm('idle'); park(); return; }   // 长按未拖动：机器人形态停 3 秒
    openPanel();                                // 普通点击：开面板
  }

  orb.addEventListener('mousedown', function (ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.preventDefault();
    pressStart(ev.clientX, ev.clientY);
  });
  document.addEventListener('mousemove', function (ev) { if (press) pressMove(ev.clientX, ev.clientY); });
  document.addEventListener('mouseup', function () { if (press) pressEnd(); });
  orb.addEventListener('touchstart', function (ev) {
    var t = ev.touches && ev.touches[0];
    if (!t) return;
    ev.preventDefault();
    pressStart(t.clientX, t.clientY);
  }, { passive: false });
  orb.addEventListener('touchmove', function (ev) {
    if (!press) return;
    var t = ev.touches && ev.touches[0];
    if (t) { ev.preventDefault(); pressMove(t.clientX, t.clientY); }
  }, { passive: false });
  orb.addEventListener('touchend', function () { if (press) pressEnd(); });
  orb.addEventListener('touchcancel', function () { if (press) pressEnd(); });
  /* 键盘（回车/空格）激活：detail===0 表示不是鼠标点出来的 */
  orb.addEventListener('click', function (ev) {
    if (ev.detail === 0) openPanel();
  });

  orb.addEventListener('mouseenter', function () {
    if (form === 'idle') setForm('hover');
  });
  orb.addEventListener('mouseleave', function () {
    if (form === 'hover') setForm('idle');
  });

  /* ============================================================
     二、预问诊会话引擎
     ============================================================ */
  var S = { stage: 'idle', topicId: '', qi: 0, answers: [], escalated: false };
  var searchFn = null;      // 检索增强挂点：setSearch(fn)
  var greeted = false;
  var lastReply = '';

  function lang() { return X.getState().lang; }

  function bubble(who, text) {
    var b = document.createElement('div');
    b.className = 'medic__msg medic__msg--' + who;
    var span = document.createElement('span');
    span.className = 'medic__text';
    span.textContent = text;
    b.appendChild(span);
    logBox.appendChild(b);
    logBox.scrollTop = logBox.scrollHeight;
    if (who === 'ai') { lastReply = text; nod(); }
  }

  function nod() {
    if (form !== 'chat') return;
    botBox.classList.remove('is-nod');
    void botBox.offsetWidth;
    botBox.classList.add('is-nod');
    setTimeout(function () { botBox.classList.remove('is-nod'); }, 700);
  }

  function setStatus(text) { statusEl.textContent = text || ''; }

  function speakShort(text) {
    /* 只念要点（共情/危险提醒/分级），来源和免责声明不念，免得又长又吵 */
    try { X.speak(text); } catch (e) { /* 忽略 */ }
  }

  /* ---------- chips ---------- */
  function chip(text, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'medic__chip';
    b.textContent = text;
    b.addEventListener('click', function () { onClick(text); });
    return b;
  }

  function clearChips() { chipsBox.innerHTML = ''; }

  function renderIdleChips() {
    clearChips();
    KB.topics.forEach(function (tp) {
      var name = KB.topicName(tp.id, lang());
      chipsBox.appendChild(chip(name, function (t) { ask(t); }));
    });
    chipsBox.appendChild(chip(T('medic.askWhat'), function () { ask(T('medic.askWhat')); }));
  }

  function renderAskChips() {
    clearChips();
    var tp = KB.topic(S.topicId, lang());
    var body = tp ? tp.body : KB.generic(lang()).body;
    var q = body.questions[Math.min(S.qi, body.questions.length - 1)];
    (q.options || []).forEach(function (o) {
      chipsBox.appendChild(chip(o, function (t) { ask(t); }));
    });
    chipsBox.appendChild(chip(T('medic.askMore'), function () { ask(T('medic.askMore')); }));
  }

  function renderEndChips() {
    clearChips();
    chipsBox.appendChild(chip(T('medic.restart'), function () { ask(T('medic.restart')); }));
    chipsBox.appendChild(chip(T('medic.booking'), function () { ask(T('medic.booking')); }));
  }

  function renderChips() {
    chipLabel.textContent = T('medic.chipsLabel');
    if (S.stage === 'ask') renderAskChips();
    else if (S.stage === 'done') renderEndChips();
    else renderIdleChips();
  }

  /* ---------- 红旗：命中就直接进急救劝导，不进普通问诊 ---------- */
  function goEmergency(id, prefix) {
    var rf = KB.redflag(id, lang());
    S.stage = 'done';
    S.escalated = true;
    if (prefix) bubble('ai', prefix);
    bubble('ai', rf.body.reply);
    bubble('ai', T('medic.erNote'));
    speakShort(prefix ? (prefix + rf.body.reply) : rf.body.reply);
    setStatus(T('medic.erNote'));
    renderChips();
  }

  function escalationOf(text) {
    var m = KB.match(text, lang());
    return (m && m.kind === 'redflag') ? m : null;
  }

  /* ---------- 一次问诊的主流程 ---------- */
  function askQuestion() {
    var tp = KB.topic(S.topicId, lang());
    var body = tp ? tp.body : KB.generic(lang()).body;
    var q = body.questions[Math.min(S.qi, body.questions.length - 1)];
    bubble('ai', q.q);
    speakShort(q.q);
    setStatus(T('medic.qIndex', { n: S.qi + 1 }) + ' · ' + T('medic.sub'));
    renderChips();
  }

  function nextQuestion() {
    S.qi++;
    var tp = KB.topic(S.topicId, lang());
    var body = tp ? tp.body : KB.generic(lang()).body;
    if (S.qi >= body.questions.length) return giveAdvice();
    askQuestion();
  }

  /* ---------- 分诊建议（四级） + 科普 + 来源 ---------- */
  function giveAdvice() {
    var tp = KB.topic(S.topicId, lang());
    var body = tp ? tp.body : KB.generic(lang()).body;
    var levels = KB.meta.triageLevels;
    var level = 'appointment';
    /* 回答里出现过红旗 → 一律升到「立即急诊」 */
    if (S.escalated) level = 'er';
    S.stage = 'done';

    bubble('ai', T('medic.levelLabel') + levels[level][lang()]);
    bubble('ai', body.triage);
    if (level !== 'er') {
      bubble('ai', body.edu);
      bubble('ai', KB.meta.disclaimer[lang()]);
    }
    var primary = (level === 'er' ? '' : body.triage);
    speakShort(primary || T('medic.erNote'));

    /* 来源：先本地知识库；挂了检索就再补公开检索，合并后最多 3 条 */
    setStatus(T('medic.searching'));
    withSources(body).then(function (sources) {
      if (sources && sources.length) {
        bubble('ai', '来源：' + KB.cite(sources, lang()));
      } else {
        bubble('ai', T('medic.noSource'));
      }
      setStatus(T('medic.sub'));
      renderChips();
    });
    renderChips();
  }

  /* 检索增强：本地不足 / 需要补充时调用挂上来的检索函数 */
  function withSources(body) {
    var local = Array.isArray(body.sources) ? body.sources.slice(0, 3) : [];
    if (typeof searchFn !== 'function') return Promise.resolve(local);
    var query = (body.patterns && body.patterns[0]) || '';
    if (!query) return Promise.resolve(local);
    return Promise.resolve(searchFn(query, lang())).then(function (extra) {
      var out = local.slice();
      (Array.isArray(extra) ? extra : []).forEach(function (s) {
        if (out.length >= 3) return;
        if (s && s.org && s.title && out.indexOf(s) < 0) out.push(s);
      });
      return out;
    }).catch(function () { return local; });
  }

  /* ---------- 一句话进来 ----------
     指令的顺序很讲究：重来 / 挂号 / 「就这些」是老人点的按钮和常说的话，
     必须先认；但也不能把「我头疼想挂号」这种带症状的句子直接劫去挂号，
     所以挂号指令要求句子短、且症状检索没有命中。 */
  function handle(text) {
    var t = String(text || '').trim();
    if (!t) { bubble('ai', T('medic.noSpeech')); return; }

    if (/重新|再来一|换一个/.test(t)) { resetSession(); bubble('ai', T('medic.hello')); speakShort(T('medic.hello')); renderChips(); return; }

    var shortBooking = t.length <= 10 && /挂号/.test(t);
    if (shortBooking) {
      bubble('ai', T('medic.bookingGo'));
      speakShort(T('medic.bookingGo'));
      try { X.nav('restart'); } catch (e) { /* 忽略 */ }
      renderChips();
      return;
    }

    if (S.stage === 'ask' && /就这些|不用问|给我建议|差不多了|没有了/.test(t)) { giveAdvice(); return; }

    /* ① 红旗筛查：任何阶段都先查，安全优先 */
    var m = KB.match(t, lang());
    if (m && m.kind === 'redflag') {
      goEmergency(m.id, S.stage === 'ask' ? T('medic.escalated') : '');
      return;
    }

    /* ② 追问阶段：记录回答，继续下一问 */
    if (S.stage === 'ask') {
      S.answers.push(t);
      nextQuestion();
      return;
    }

    /* ③ 新症状：共情 + 红旗提示 + 第一个问题 */
    if (m && m.kind === 'topic') {
      var tp = KB.topic(m.id, lang());
      S.topicId = m.id;
      S.stage = 'ask';
      S.qi = 0;
      S.answers = [];
      S.escalated = false;
      bubble('ai', tp.body.empathy);
      bubble('ai', tp.body.redflagHint);
      speakShort(tp.body.empathy);
      setStatus(T('medic.sub'));
      askQuestion();
      return;
    }

    /* ④ 客气话 */
    if (/谢谢|多谢|感谢/.test(t)) { bubble('ai', T('medic.thanks')); speakShort(T('medic.thanks')); renderChips(); return; }

    /* ⑤ 没匹配上：走兜底，先把最危险的情况排掉 */
    var g = KB.generic(lang());
    S.topicId = '';
    S.stage = 'ask';
    S.qi = 0;
    S.answers = [];
    S.escalated = false;
    bubble('ai', g.body.empathy);
    speakShort(g.body.empathy);
    askQuestion();
  }

  function resetSession() {
    S.stage = 'idle';
    S.topicId = '';
    S.qi = 0;
    S.answers = [];
    S.escalated = false;
  }

  function ask(text) {
    if (panel.hidden) openPanel(false);
    bubble('me', text);
    handle(text);
    return Promise.resolve();
  }

  /* ============================================================
     三、面板：开关、麦克风（全页只授权一次）
     ============================================================ */
  function renderTexts() {
    document.getElementById('medic-title').textContent = T('medic.title');
    document.getElementById('medic-close').textContent = T('medic.close');
    micLabel.textContent = T('medic.mic');
    stopBtn.textContent = T('medic.micStop');
    tip.textContent = T('medic.tip');
    orb.setAttribute('aria-label', T('medic.orbLabel'));
    disclaimerEl.textContent = KB.meta.disclaimer[lang()] + ' ' + KB.meta.privacyNote[lang()];
    renderChips();
  }

  function openPanel(autostart) {
    panel.hidden = false;
    document.body.classList.add('medic-open');
    setForm('chat');
    renderTexts();
    if (!greeted) {
      greeted = true;
      bubble('ai', T('medic.hello'));
      speakShort(T('medic.hello'));
    }
    setStatus(T('medic.sub'));
    renderVoiceHint();
  }

  function closePanel() {
    stopListen();
    panel.hidden = true;
    document.body.classList.remove('medic-open');
    setForm('idle');
    park();
  }

  document.getElementById('medic-close').addEventListener('click', closePanel);
  var inlineOpen = document.getElementById('medic-inline-open');
  if (inlineOpen) inlineOpen.addEventListener('click', function () { openPanel(false); });
  panel.addEventListener('click', function (ev) {
    var el = ev.target;
    if (el && el.getAttribute && el.getAttribute('data-medic-close')) closePanel();
  });
  panel.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { closePanel(); return; }
    if (ev.key !== 'Tab') return;
    var items = panel.querySelectorAll('button:not([disabled])');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });
  /* Esc 不依赖焦点：老人点开面板后鼠标点在遮罩上、焦点根本不在面板里，
     这时按 Esc 也必须能关——「打开关不上」是最伤信任的事。
     焦点在输入框里时不抢（本页 0 输入框，防御性写法）。 */
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || panel.hidden) return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    closePanel();
  });

  /* ---------- 语音：复用小鱼儿的识别模块，不重复要麦克风权限 ---------- */
  var listening = false;
  var rec = null;

  function offline() { return window.XiaoYuErSpeech || null; }

  function renderVoiceHint() {
    var OS = offline();
    var box = voiceHint;
    if (OS && OS.ready()) {
      box.hidden = false;
      box.textContent = T('medic.voiceReady');
    } else if (OS && OS.supported && OS.supported()) {
      box.hidden = false;
      box.textContent = T('medic.noVoice');
    } else {
      box.hidden = true;
    }
  }

  function setMic(state) {
    micBtn.setAttribute('data-state', state);
    stopBtn.hidden = state !== 'on';
  }

  function stopListen() {
    if (!listening) return;
    listening = false;
    setMic('off');
    setStatus(T('medic.sub'));
    var OS = offline();
    if (OS) { try { OS.stop(); } catch (e) { /* 忽略 */ } }
    try { if (rec) rec.abort(); } catch (e2) { /* 忽略 */ }
  }

  function startListen() {
    if (listening) { stopListen(); return; }
    var OS = offline();
    if (OS && OS.ready()) {
      listening = true;
      setMic('on');
      setStatus(T('medic.listening'));
      /* 麦克风只问一次：授权预检由 speech.js 统一收口 */
      Promise.resolve(OS.ensureMic ? OS.ensureMic() : true).then(function () {
        if (!listening) return null;
        return OS.listen({
          language: lang() === 'en' ? 'en' : 'zh',
          onTick: function (phase) {
            if (phase === 'recognizing') setStatus(T('medic.recognizing'));
          }
        });
      }).then(function (text) {
        listening = false;
        setMic('off');
        setStatus(T('medic.sub'));
        if (text && text.trim()) ask(text);
        else { bubble('ai', T('medic.noSpeech')); speakShort(T('medic.noSpeech')); }
      }).catch(function (err) {
        listening = false;
        setMic('off');
        setStatus(T('medic.sub'));
        var code = err && err.code;
        if (code === 'denied') bubble('ai', T('medic.noVoice'));
        else bubble('ai', T('medic.noSpeech'));
      });
      return;
    }
    /* 离线引擎没装：说清楚去哪儿装，不反复弹权限 */
    bubble('ai', T('medic.noVoice'));
    speakShort(T('medic.noVoice'));
    renderVoiceHint();
  }

  micBtn.addEventListener('click', function () { startListen(); });
  stopBtn.addEventListener('click', stopListen);

  /* ---------- 跟随界面语言与步骤 ---------- */
  X.onRender(function () {
    renderTexts();
    if (!panel.hidden) renderVoiceHint();
  });

  renderTexts();
  initPos();
  tip.hidden = false;          // 显隐交给 CSS（data-form=hover 时才淡入）
  setForm('idle');
  startFloat();
  X.setLanguage(X.getState().lang);   // 触发一次重绘，把注册的文案刷到页面上

  /* ---------------- 对外接口（自检与后续扩展都走这里） ---------------- */
  window.XiaoYiLing = {
    version: '1.0.0',
    /* 形态状态机 */
    form: function () { return form; },
    state: function () {
      return {
        form: form,
        x: Math.round(pos.x), y: Math.round(pos.y),
        speed: Math.round(spd),
        zones: zones.length,
        reduced: reduced
      };
    },
    open: openPanel,
    close: closePanel,
    isOpen: function () { return !panel.hidden; },
    /* 问诊引擎 */
    ask: ask,
    say: ask,
    session: function () { return { stage: S.stage, topicId: S.topicId, qi: S.qi, answers: S.answers.slice(), escalated: S.escalated }; },
    lastReply: function () { return lastReply; },
    reset: resetSession,
    /* 知识库 */
    kb: {
      loaded: true,
      stats: function () { return KB.stats(); }
    },
    /* 检索增强挂点：fn(query, lang) → Promise<[{org,title,year}]> */
    setSearch: function (fn) { searchFn = typeof fn === 'function' ? fn : null; },
    /* 语音 */
    isListening: function () { return listening; },
    startListen: startListen,
    stopListen: stopListen
  };
})();
