/* ============================================================
   小鱼兒 · 预约挂号（适老版）图标库
   - 全部为内联 SVG：离线可用、不加载任何图片、不产生网络请求
   - 双色语言：白色主体 + 深青绿点缀（与页面三主色同一套色）
   - 尺寸随字号缩放，任何时候都是矢量清晰
   - 外部用法：XiaoYuErIcons.element('heart-pulse') 取一个 SVG 元素
   ============================================================ */
(function () {
  'use strict';

  var INK = '#2f5d62';      /* 主色：描边与点缀 */
  var MINT = '#8fb3ae';     /* 淡青：次要线条 */
  var SOFT = '#e4efed';     /* 很淡的青灰：阴影面 */
  var WHITE = '#ffffff';    /* 主体 */
  var OK = '#3f6b52';       /* 成功绿 */

  /* 十字：以 (cx,cy) 为中心，a = 半臂宽，L = 半臂长 */
  function plus(cx, cy, a, L) {
    var n = function (v) { return Math.round(v * 10) / 10; };
    return 'M' + n(cx - a) + ' ' + n(cy - L) +
      'h' + n(2 * a) + 'v' + n(L - a) + 'h' + n(L - a) + 'v' + n(2 * a) +
      'h-' + n(L - a) + 'v' + n(L - a) + 'h-' + n(2 * a) +
      'v-' + n(L - a) + 'h-' + n(L - a) + 'v-' + n(2 * a) + 'h' + n(L - a) + 'z';
  }

  /* 一圈小圆点（病毒刺突、太阳光芒等） */
  function ring(cx, cy, r, count, dotR, startDeg) {
    var s = '';
    for (var i = 0; i < count; i++) {
      var deg = (startDeg || 0) + (360 / count) * i;
      var rad = (deg * Math.PI) / 180;
      s += '<circle cx="' + (Math.round((cx + r * Math.cos(rad)) * 10) / 10) +
        '" cy="' + (Math.round((cy + r * Math.sin(rad)) * 10) / 10) +
        '" r="' + dotR + '"/>';
    }
    return s;
  }

  var CROSS = ' fill="' + INK + '" stroke="none"';

  /* 骨头：一根骨干 + 四个关节球。画两遍 —— 第二遍纯白不带描边，
     把内部多余的线条盖掉，轮廓就只剩外圈，看起来才是一根完整的骨头。 */
  function boneShapes(strokeWidth, fill) {
    var a = (fill ? ' fill="' + fill + '"' : '') + (strokeWidth ? ' stroke-width="' + strokeWidth + '"' : '');
    return '<rect x="14" y="21" width="20" height="6" rx="3"' + a + '/>' +
      '<circle cx="13.5" cy="20" r="4.4"' + a + '/>' +
      '<circle cx="13.5" cy="28" r="4.4"' + a + '/>' +
      '<circle cx="34.5" cy="20" r="4.4"' + a + '/>' +
      '<circle cx="34.5" cy="28" r="4.4"' + a + '/>';
  }

  var ICONS = {
    /* ---------- 医疗物件（与素材集一一对应） ---------- */

    /* 病历夹 + 心电线 */
    'clipboard-pulse':
      '<rect x="11" y="9.5" width="26" height="32.5" rx="4.5" fill="' + WHITE + '"/>' +
      '<path d="M18.6 6.5h10.8a2.3 2.3 0 0 1 2.3 2.3v3.6H16.3V8.8a2.3 2.3 0 0 1 2.3-2.3z" fill="' + INK + '" stroke="none"/>' +
      '<path d="M16 30.5h4.3l2.7-6.2 3.7 10.6 2.7-6.4H35" stroke-width="2.3"/>',

    /* 双螺旋 */
    'dna':
      '<path d="M16 9.5c10 8 10 21 0 29" stroke-width="2.4"/>' +
      '<path d="M32 9.5c-10 8-10 21 0 29" stroke-width="2.4"/>' +
      '<g stroke="' + MINT + '" stroke-width="2.2">' +
      '<path d="M18.9 12.6h10.2"/><path d="M21.7 17.2h4.6"/>' +
      '<path d="M21.7 30.8h4.6"/><path d="M18.9 35.4h10.2"/></g>',

    /* 心形 + 脉搏 */
    'heart-pulse':
      '<path d="M24 41c-1.5-1.2-15-9.7-17.6-19.5C4.3 14.5 9.6 8.7 16 10.1c3.6.8 6.5 3.4 8 6.6 1.5-3.2 4.4-5.8 8-6.6 6.4-1.4 11.7 4.4 9.6 11.4C39 31.3 25.5 39.8 24 41z" fill="' + WHITE + '"/>' +
      '<path d="M13 25.4h4.6l2.5-5.5 3.8 10.4 2.6-5.8h6.6" stroke-width="2.3"/>',

    /* 口罩 */
    'mask':
      '<path d="M11.5 18.6c0-4.5 5.6-7.1 12.5-7.1s12.5 2.6 12.5 7.1v8.3c0 6.7-6.2 11.4-12.5 11.4S11.5 33.6 11.5 26.9z" fill="' + WHITE + '"/>' +
      '<path d="M11.6 20c-4.5-.9-6.5 2.7-3.7 6.9M36.4 20c4.5-.9 6.5 2.7 3.7 6.9" stroke-width="2.2"/>' +
      '<g stroke="' + MINT + '" stroke-width="2.1"><path d="M14.6 24h18.8"/><path d="M14.6 30.2h18.8"/></g>',

    /* 急救箱 */
    'medkit':
      '<rect x="8" y="18.5" width="32" height="20.5" rx="4.5" fill="' + WHITE + '"/>' +
      '<path d="M19 18.5v-3.3a5 5 0 0 1 10 0v3.3" stroke-width="2.2"/>' +
      '<path d="' + plus(24, 28.6, 2.1, 7) + '"' + CROSS + '/>',

    /* 圆形十字 */
    'plus-circle':
      '<circle cx="24" cy="24" r="16.5" fill="' + WHITE + '"/>' +
      '<path d="' + plus(24, 24, 2.3, 7.6) + '"' + CROSS + '/>',

    /* 药瓶 */
    'pill-bottle':
      '<rect x="14" y="17.5" width="20" height="23" rx="4.5" fill="' + WHITE + '"/>' +
      '<rect x="17" y="9.5" width="14" height="6.6" rx="2.4" fill="' + INK + '" stroke="none"/>' +
      '<path d="' + plus(24, 28.5, 2.1, 6.6) + '"' + CROSS + '/>',

    /* 药丸、胶囊 */
    'pills':
      '<g transform="rotate(-32 24 17)">' +
      '<rect x="13" y="11.5" width="22" height="11" rx="5.5" fill="' + WHITE + '"/>' +
      '<path d="M24 11.5h5.5a5.5 5.5 0 0 1 0 11H24z" fill="' + INK + '" stroke="none"/>' +
      '<path d="M24 11.5v11"/></g>' +
      '<g transform="rotate(24 33 34)">' +
      '<rect x="25.5" y="29" width="15" height="10" rx="5" fill="' + WHITE + '"/>' +
      '<path d="M33 29h2.5a5 5 0 0 1 0 10H33z" fill="' + MINT + '" stroke="none"/>' +
      '<path d="M33 29v10"/></g>',

    /* 洗手液 */
    'sanitizer':
      '<rect x="15" y="19" width="18" height="22" rx="4.5" fill="' + WHITE + '"/>' +
      '<rect x="19.5" y="12.4" width="9.4" height="4.6" rx="1.6" fill="' + INK + '" stroke="none"/>' +
      '<path d="M28.9 13.2h4.9v3.4h-4.9" stroke-width="2.1"/>' +
      '<path d="' + plus(24, 29.6, 2, 4.4) + '"' + CROSS + '/>',

    /* 盾牌十字 */
    'shield-cross':
      '<path d="M24 6.5 38 11.8v11.7c0 8.6-5.8 14.6-14 17.6-8.2-3-14-9-14-17.6V11.8z" fill="' + WHITE + '"/>' +
      '<path d="' + plus(24, 24, 2.2, 8.2) + '"' + CROSS + '/>',

    /* 听诊器 */
    'stethoscope':
      '<path d="M15.5 8v8.4a8.5 8.5 0 0 0 17 0V8" stroke-width="2.4"/>' +
      '<circle cx="15.5" cy="7" r="2.6" fill="' + INK + '" stroke="none"/>' +
      '<circle cx="32.5" cy="7" r="2.6" fill="' + INK + '" stroke="none"/>' +
      '<path d="M32.5 16.5v10.6a8 8 0 0 1-8 8" stroke-width="2.4"/>' +
      '<circle cx="20" cy="37" r="5.6" fill="' + WHITE + '"/>' +
      '<circle cx="20" cy="37" r="2" fill="' + INK + '" stroke="none"/>',

    /* 注射器 */
    'syringe':
      '<g transform="rotate(-35 24 24)">' +
      '<rect x="19" y="14" width="10" height="19" rx="2" fill="' + WHITE + '"/>' +
      '<rect x="19.8" y="15.2" width="8.4" height="5.6" rx="1" fill="' + INK + '" stroke="none"/>' +
      '<rect x="21.6" y="8.8" width="4.8" height="5.2" rx="1" fill="' + INK + '" stroke="none"/>' +
      '<path d="M24 5.6v3.2" stroke-width="2.4"/>' +
      '<path d="M17.6 33h12.8" stroke-width="2.4"/>' +
      '<path d="M24 33v6" stroke-width="2.4"/>' +
      '<g stroke="' + MINT + '" stroke-width="1.9"><path d="M19 23.5h3.4"/><path d="M19 27.4h3.4"/></g>' +
      '</g>',

    /* 病毒 */
    'virus':
      '<circle cx="24" cy="24" r="11.2" fill="' + WHITE + '"/>' +
      '<g fill="' + INK + '" stroke="none">' + ring(24, 24, 15.6, 8, 3.3, 0) + '</g>' +
      '<circle cx="24" cy="24" r="3.2" fill="' + MINT + '" stroke="none"/>' +
      '<circle cx="24" cy="19" r="1.7" fill="' + INK + '" stroke="none"/>',

    /* ---------- 页面专用的补充图形（同一套笔法） ---------- */

    /* 喇叭 + 声波（把结果念给您听） */
    'voice':
      '<path d="M21.5 13v22l-8.6-6.6H7a1.6 1.6 0 0 1-1.6-1.6v-5.6A1.6 1.6 0 0 1 7 19.6h5.9z" fill="' + WHITE + '"/>' +
      '<path d="M27.5 17.6a9.2 9.2 0 0 1 0 12.8" stroke-width="2.4"/>' +
      '<path d="M33.6 12.4a16.4 16.4 0 0 1 0 23.2" stroke="' + MINT + '" stroke-width="2.4"/>',

    /* 日历（选日期） */
    'calendar':
      '<rect x="8" y="12.5" width="32" height="28" rx="4" fill="' + WHITE + '"/>' +
      '<path d="M8 16.5v-4a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v4z" fill="' + SOFT + '"/>' +
      '<path d="M17 8.6v6.4M31 8.6v6.4" stroke-width="2.4"/>' +
      '<g fill="' + MINT + '" stroke="none">' +
      '<rect x="14" y="25" width="5" height="4.6" rx="1.4"/>' +
      '<rect x="21.5" y="25" width="5" height="4.6" rx="1.4"/>' +
      '<rect x="29" y="25" width="5" height="4.6" rx="1.4"/>' +
      '<rect x="14" y="32" width="5" height="4.6" rx="1.4"/>' +
      '<rect x="21.5" y="32" width="5" height="4.6" rx="1.4"/>' +
      '</g>',

    /* 头部 + 眩晕 */
    'head':
      '<path d="M10.5 43.5c0-7 6-11.4 13.5-11.4s13.5 4.4 13.5 11.4z" fill="' + SOFT + '"/>' +
      '<circle cx="24" cy="19.5" r="11" fill="' + WHITE + '"/>' +
      '<path d="M20.6 19.9a3.9 3.9 0 1 1 3.9 3.9" stroke-width="2.2"/>' +
      '<path d="M18.4 15.2h-3.2M33.6 15.2h-2.6" stroke="' + MINT + '" stroke-width="2"/>',

    /* 腹部不适：肚子上一个「痛」的星芒，一眼看出是肚子疼 */
    'stomach':
      '<path d="M17.6 7.5h12.8a5.2 5.2 0 0 1 5.2 5.2v4.4c0 3.7 3 5.7 3 10.6v8.4a7 7 0 0 1-7 7H16.4a7 7 0 0 1-7-7v-8.4c0-4.9 3-6.9 3-10.6v-4.4a5.2 5.2 0 0 1 5.2-5.2z" fill="' + WHITE + '"/>' +
      '<path d="M24 18.4l1.9 4.7 4.7 1.9-4.7 1.9-1.9 4.7-1.9-4.7-4.7-1.9 4.7-1.9z" fill="' + INK + '" stroke="none"/>' +
      '<path d="M16.6 36.4h14.8" stroke="' + MINT + '" stroke-width="2.1"/>',

    /* 骨头、关节（同一轮廓只描外圈：先粗描一遍，再用白色盖掉内部线条） */
    'bone':
      '<g transform="rotate(-35 24 24)">' +
      boneShapes(3.8, WHITE) +
      '<g fill="' + WHITE + '" stroke="none">' + boneShapes(0, WHITE) + '</g>' +
      '</g>',

    /* 眼睛 */
    'eye':
      '<path d="M6.5 24c6-8.6 11.6-12.2 17.5-12.2S41.5 15.4 47.5 24c-6 8.6-11.6 12.2-17.5 12.2S12.5 32.6 6.5 24z" fill="' + WHITE + '" transform="translate(-3 0)"/>' +
      '<circle cx="24" cy="24" r="6.3" fill="' + INK + '" stroke="none"/>' +
      '<circle cx="21.7" cy="21.7" r="2" fill="' + WHITE + '" stroke="none"/>',

    /* 医院楼宇 */
    'hospital':
      '<path d="M24 5.5v9.5M19.4 10.2h9.2" stroke-width="2.6"/>' +
      '<rect x="12" y="15" width="24" height="27.5" rx="3.5" fill="' + WHITE + '"/>' +
      '<g fill="' + MINT + '" stroke="none">' +
      '<rect x="16.4" y="20" width="4.8" height="4.8" rx="1.3"/>' +
      '<rect x="26.8" y="20" width="4.8" height="4.8" rx="1.3"/>' +
      '<rect x="16.4" y="28" width="4.8" height="4.8" rx="1.3"/>' +
      '<rect x="26.8" y="28" width="4.8" height="4.8" rx="1.3"/>' +
      '</g>' +
      '<path d="M20.8 42.5V36h6.4v6.5" stroke-width="2.1"/>',

    /* 身份证 */
    'id-card':
      '<rect x="6.5" y="13" width="35" height="22" rx="3.6" fill="' + WHITE + '"/>' +
      '<circle cx="16.6" cy="21.6" r="4.3" fill="' + SOFT + '"/>' +
      '<path d="M10.3 30c1-3.1 3.4-4.8 6.3-4.8s5.3 1.7 6.3 4.8" stroke-width="1.9"/>' +
      '<g stroke="' + MINT + '" stroke-width="2.2"><path d="M26 19.6h11.2"/><path d="M26 25.1h11.2"/><path d="M26 30.6h7"/></g>',

    /* 时钟 */
    'clock':
      '<circle cx="24" cy="24" r="16.6" fill="' + WHITE + '"/>' +
      '<path d="M24 14.4V24l7.2 4.8" stroke-width="2.6"/>' +
      '<g fill="' + INK + '" stroke="none"><circle cx="24" cy="10.4" r="1.5"/><circle cx="37.6" cy="24" r="1.5"/><circle cx="24" cy="37.6" r="1.5"/><circle cx="10.4" cy="24" r="1.5"/></g>',

    /* 服务台 / 分诊台 */
    'triage':
      '<rect x="8" y="25" width="32" height="13.5" rx="2.8" fill="' + WHITE + '"/>' +
      '<rect x="5" y="20" width="38" height="5.8" rx="2.6" fill="' + SOFT + '"/>' +
      '<rect x="16.6" y="9.4" width="14.8" height="10.6" rx="2.2" fill="' + INK + '" stroke="none"/>' +
      '<path d="' + plus(24, 14.7, 1.5, 3.3) + '" fill="' + WHITE + '" stroke="none"/>',

    /* 手机 */
    'phone':
      '<rect x="15" y="6" width="18" height="36" rx="4.6" fill="' + WHITE + '"/>' +
      '<path d="M21.6 10.6h4.8" stroke-width="2"/>' +
      '<g fill="' + INK + '" stroke="none"><rect x="19.4" y="17" width="9.2" height="2.9" rx="1.4"/><rect x="19.4" y="23" width="9.2" height="2.9" rx="1.4"/><rect x="19.4" y="29" width="6" height="2.9" rx="1.4"/></g>',

    /* 二维码 */
    'qr-code':
      '<rect x="8" y="8" width="13.4" height="13.4" rx="2.6" fill="' + WHITE + '"/>' +
      '<rect x="12.2" y="12.2" width="5" height="5" rx="1.2" fill="' + INK + '" stroke="none"/>' +
      '<rect x="26.6" y="8" width="13.4" height="13.4" rx="2.6" fill="' + WHITE + '"/>' +
      '<rect x="30.8" y="12.2" width="5" height="5" rx="1.2" fill="' + INK + '" stroke="none"/>' +
      '<rect x="8" y="26.6" width="13.4" height="13.4" rx="2.6" fill="' + WHITE + '"/>' +
      '<rect x="12.2" y="30.8" width="5" height="5" rx="1.2" fill="' + INK + '" stroke="none"/>' +
      '<g fill="' + INK + '" stroke="none">' +
      '<rect x="26.6" y="26.6" width="5" height="5" rx="1.2"/>' +
      '<rect x="35" y="26.6" width="5" height="5" rx="1.2"/>' +
      '<rect x="26.6" y="35" width="5" height="5" rx="1.2"/>' +
      '<rect x="35" y="35" width="5" height="5" rx="1.2"/>' +
      '</g>',

    /* 现金 */
    'cash':
      '<rect x="10" y="11.5" width="28" height="18" rx="3" fill="' + SOFT + '"/>' +
      '<rect x="6.5" y="17" width="35" height="21" rx="3.4" fill="' + WHITE + '"/>' +
      '<circle cx="24" cy="27.5" r="6" fill="' + SOFT + '"/>' +
      '<path d="M24 23.4v8.2M21.2 25.9h5.6M21.2 29.4h5.6" stroke-width="1.9"/>' +
      '<g fill="' + MINT + '" stroke="none"><circle cx="12" cy="27.5" r="2.1"/><circle cx="36" cy="27.5" r="2.1"/></g>',

    /* 成功徽标 */
    'check-badge':
      '<circle cx="24" cy="24" r="17" fill="' + WHITE + '"/>' +
      '<path d="M15.4 25.4l6.3 6.3 11-13.4" stroke="' + OK + '" stroke-width="3.4"/>',

    /* 太阳（上午） */
    'sun':
      '<circle cx="24" cy="24" r="7.6" fill="' + WHITE + '"/>' +
      '<path d="M24 4.5v5.2M24 38.3v5.2M4.5 24h5.2M38.3 24h5.2M10.6 10.6l3.7 3.7M33.7 33.7l3.7 3.7M37.4 10.6l-3.7 3.7M14.3 33.7l-3.7 3.7" stroke-width="2.4"/>',

    /* 日落（下午） */
    'sunset':
      '<path d="M13.2 34.6a10.8 10.8 0 0 1 21.6 0z" fill="' + WHITE + '"/>' +
      '<path d="M24 11.5v5.4M37.4 24.6l-3.6-3.6M10.6 24.6l3.6-3.6" stroke-width="2.4"/>' +
      '<path d="M5.5 34.6h37" stroke-width="2.6"/>'
  };

  var NAMES = Object.keys(ICONS);

  /* 生成一段 SVG 标记：默认跟着字号缩放（1.4em），也可由外层容器决定尺寸 */
  function svg(name) {
    if (!Object.prototype.hasOwnProperty.call(ICONS, name)) return '';
    return '<svg class="ico ico--' + name + '" viewBox="0 0 48 48" role="img" aria-hidden="true" focusable="false">' +
      '<g fill="none" stroke="' + INK + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      ICONS[name] +
      '</g></svg>';
  }

  /* 取一个可直接 appendChild 的元素；图标名不存在时返回 null，由调用方兜底 */
  function element(name) {
    if (typeof document === 'undefined') return null;
    var markup = svg(name);
    if (!markup) return null;
    var box = document.createElement('span');
    box.className = 'ico-box';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = markup;
    return box.firstChild || null;
  }

  window.XiaoYuErIcons = {
    names: NAMES,
    has: function (name) { return Object.prototype.hasOwnProperty.call(ICONS, name); },
    svg: svg,
    element: element
  };
})();
