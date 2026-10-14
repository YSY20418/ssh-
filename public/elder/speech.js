/* ============================================================
   小鱼兒 · 离线语音识别（浏览器内跑，数据不出本地）

   为什么需要它：
   浏览器自带的 SpeechRecognition 是把音频送到云端识别的，在国内网络下
   基本连不上，老人点了麦克风会说"没反应"。这个模块把识别模型直接放进
   浏览器（Whisper 的 ONNX 量化版），断网也能用，音频不离开设备。

   三条硬约束（与主项目一致）：
   1. 懒加载：只有用户主动点「用离线识别」才会去下载库与模型；
      没下载、没加载成功、浏览器不支持，一律返回失败，由 ai.js 回落到
      浏览器自带识别或「常说的话」点选 —— 页面永远不会卡死。
   2. 零密钥：不需要任何账号与 Key；模型走公开的镜像站，国内可直连。
   3. 纯 ES5 + 无构建：和页面其它脚本一样，双击文件就能跑。

   对外接口（window.XiaoYuErSpeech）：
     state()                       → idle | loading | ready | failed
     ready()                       → 模型已加载好、可以听
     cached()                      → 探测磁盘缓存里有没有模型（不下载）
     prepare(onProgress)           → 下载 + 初始化，返回 Promise
     listen(opts)                  → 录一段话并识别，返回 Promise<文本>
                                      opts.language: 'zh'（默认）| 'en'
                                      opts.onTick(阶段, 信息): listening / recognizing
     stop()                        → 停止录音 / 中断识别
     setModel('fast'|'best')      → 换模型（fast≈41MB / best≈77MB）
   ============================================================ */
(function () {
  'use strict';

  var LIB_DEFAULT = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/dist/transformers.min.js';
  /* 库的地址同样可以覆盖（?asrLib= / localStorage）：
     内网部署或把整套识别夹带在 U 盘里时，可以指到自己人放的副本上 */
  function libUrl() {
    try {
      var m = /[?&]asrLib=([^&]+)/i.exec(window.location.search);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) { /* 忽略 */ }
    try {
      var s = window.localStorage && window.localStorage.getItem('xye.asr.lib');
      if (s) return String(s);
    } catch (e2) { /* 忽略 */ }
    return LIB_DEFAULT;
  }

  /* 模型下载源，按顺序探测，谁先通就用谁 —— 
     国内直连 huggingface.co 基本不通，所以镜像排第一；
     镜像偶尔也会抽风，所以留官方源兜底。实测不可用时页面会自动降级，
     老人在面板里还能看到现实可点的「常说的话」，不会卡住。 */
  var HOSTS = [
    { host: 'https://hf-mirror.com', label: '国内镜像' },
    { host: 'https://huggingface.co', label: '官方源' }
  ];
  var MODELS = {
    fast: { id: 'onnx-community/whisper-tiny', size: '约 41 MB' },
    best: { id: 'onnx-community/whisper-base', size: '约 77 MB' }
  };

  var state = 'idle';
  var lib = null;          // 动态加载进来的 transformers 库
  var libPromise = null;
  var asr = null;          // 语音识别管线
  var asrPromise = null;
  var currentKey = 'fast';
  var host = null;         // 探测出来的可用模型源
  var hostPromise = null;

  /* 允许用 ?asrHost=... 或 localStorage 指定模型源：方便内网部署与离线夹带 */
  function forcedHost() {
    try {
      var m = /[?&]asrHost=([^&]+)/i.exec(window.location.search);
      if (m) return decodeURIComponent(m[1]).replace(/\/+$/, '');
    } catch (e) { /* 忽略 */ }
    try {
      var s = window.localStorage && window.localStorage.getItem('xye.asr.host');
      if (s) return String(s).replace(/\/+$/, '');
    } catch (e2) { /* 忽略 */ }
    return '';
  }

  function probe(h, ms) {
    var url = h + '/' + modelId() + '/resolve/main/config.json';
    var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 8000);
    return fetch(url, { method: 'GET', cache: 'force-cache', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r && r.ok ? h : null; })
      .catch(function () { clearTimeout(timer); return null; });
  }

  /* 顺序探测：任何一个源能返回 config.json 就认为可用 */
  function pickHost() {
    if (host) return Promise.resolve(host);
    if (hostPromise) return hostPromise;
    var forced = forcedHost();
    var list = forced ? [forced] : HOSTS.map(function (x) { return x.host; });
    hostPromise = list.reduce(function (chain, h) {
      return chain.then(function (found) { return found || probe(h); });
    }, Promise.resolve(null)).then(function (found) {
      if (!found) throw new Error('模型源都连不上：' + list.join(' / '));
      host = found;
      return host;
    }).catch(function (err) { hostPromise = null; throw err; });
    return hostPromise;
  }

  /* 浏览器能不能用：要能录麦克风、能跑 WebAssembly */
  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      window.WebAssembly && (window.AudioContext || window.webkitAudioContext));
  }

  /* 麦克风权限现在是什么状态。
     注意：这个 API 不是哪儿都准（有的浏览器在被策略禁用时仍答 "prompt"），
     所以它只用来"提前告诉老人一声"，真正拍板要靠 getUserMedia 抛出的错误码。 */
  function micState() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return 'unsupported';
      return navigator.permissions.query({ name: 'microphone' }).then(function (r) {
        return r && r.state ? String(r.state) : 'unknown';   // granted / denied / prompt
      }).catch(function () { return 'unknown'; });
    } catch (e) { return Promise.resolve('unknown'); }
  }

  function pickKey() {
    try {
      var m = /[?&]asr=([a-z]+)/i.exec(window.location.search);
      if (m && MODELS[m[1]]) return m[1];
    } catch (e) { /* 忽略 */ }
    try {
      var saved = window.localStorage && window.localStorage.getItem('xye.asr.model');
      if (saved && MODELS[saved]) return saved;
    } catch (e2) { /* 忽略 */ }
    return currentKey;
  }

  function setModel(key) {
    if (!MODELS[key] || key === currentKey) return;
    currentKey = key;
    asr = null; asrPromise = null; state = 'idle';
    try { if (window.localStorage) window.localStorage.setItem('xye.asr.model', key); } catch (e) { /* 忽略 */ }
  }

  function modelId() { return MODELS[currentKey].id; }
  function modelSize() { return MODELS[currentKey].size; }

  /* 磁盘缓存探测：命中说明之前下载过，第二次打开不用再下 */
  function cached() {
    if (!window.caches) return Promise.resolve(false);
    var files = ['config.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
    var id = modelId();
    var forced = forcedHost();
    var list = forced ? [forced] : HOSTS.map(function (x) { return x.host; });
    return Promise.all(list.map(function (h) {
      return Promise.all(files.map(function (f) {
        return window.caches.match(h + '/' + id + '/resolve/main/' + f)
          .then(function (r) { return !!r; }).catch(function () { return false; });
      })).then(function (rs) { return rs.every(Boolean); });
    })).then(function (rs) {
      return rs.some(Boolean);
    }).catch(function () { return false; });
  }

  /* ---------------- 动态加载库 ----------------
     注意：@huggingface/transformers 的浏览器构建是 ESM 包（内部用了 import.meta），
     用普通 <script src> 加载会直接报 "Cannot use 'import.meta' outside a module"。
     所以这里用动态 import() 把它当模块取回来 —— 经典脚本里也能用，
     比 <script type="module"> 好在：失败了能被 catch 住，交给上层回落。 */
  function loadLib(h, onProgress) {
    if (lib) return Promise.resolve(lib);
    if (libPromise) return libPromise;
    var lu = libUrl();
    libPromise = Promise.resolve().then(function () {
      return import(lu);
    }).then(function (mod) {
      var L = (mod && mod.pipeline) ? mod : (mod && mod.default);
      if (!L || typeof L.pipeline !== 'function') throw new Error('识别库加载了但没有 pipeline');
      try {
        L.env.allowLocalModels = false;
        L.env.allowRemoteModels = true;
        L.env.remoteHost = h;                               // 探测出来的可用模型源
        L.env.remotePathTemplate = '{model}/resolve/{revision}/';
        L.env.useBrowserCache = true;
        // onnxruntime 的 wasm 默认从库自己的 CDN 取；换了库的地址就得跟着换目录，
        // 否则内网部署时"库在本地、wasm 还往外网要"。
        if (lu !== LIB_DEFAULT) L.env.backends.onnx.wasm.wasmPaths = lu.replace(/[^/]*$/, '');
        // 页面没开 COOP/COEP，多线程 wasm 起不来，直接按单线程走，省一次无谓的等待
        L.env.backends.onnx.wasm.numThreads = 1;
      } catch (e) { /* 环境变量名变了也不致命 */ }
      lib = L;
      window.transformers = L;                              // 便于在控制台里排查
      return L;
    }).catch(function (err) { libPromise = null; throw err; });
    return libPromise;
  }

  /* ---------------- 下载并初始化模型 ---------------- */
  function prepare(onProgress) {
    if (asr) { state = 'ready'; return Promise.resolve(true); }
    if (asrPromise) return asrPromise;
    if (!supported()) { state = 'failed'; return Promise.reject(new Error('这台设备不支持本地识别')); }
    state = 'loading';
    var last = 0;
    asrPromise = pickHost().then(function (h) {
      return loadLib(h, onProgress);
    }).then(function (L) {
      return L.pipeline('automatic-speech-recognition', modelId(), {
        device: 'wasm',   // WebGPU 下 8 位量化不稳定，统一走 WASM：慢一点，但什么机器都能跑
        dtype: 'q8',
        progress_callback: function (p) {
          if (typeof onProgress !== 'function') return;
          if (p && p.status === 'progress' && typeof p.progress === 'number') {
            var pct = Math.max(0, Math.min(100, Math.round(p.progress)));
            if (pct >= last + 5 || pct === 100) { last = pct; onProgress(pct, p.file || ''); }
          } else if (p && p.status === 'ready') {
            onProgress(100, '');
          }
        }
      });
    }).then(function (pipe) {
      asr = pipe;
      state = 'ready';
      return true;
    }).catch(function (err) {
      state = 'failed';
      asrPromise = null;
      throw err;
    });
    return asrPromise;
  }

  /* ---------------- 录音（自带静音自动停止） ---------------- */

  /* 把浏览器五花八门的麦克风错误归成五种"老人能听懂"的原因。
     错误名（NotAllowedError 等）跨浏览器基本一致，是唯一可靠的分类依据。 */
  var MIC_CODES = {
    NotAllowedError: 'denied',       // 用户点了"阻止"，或策略禁用——最常见，且不会再弹窗
    SecurityError: 'insecure',       // 页面不是安全上下文（非 https / file:// 被禁）
    PermissionDeniedError: 'denied', // 老浏览器的另一种叫法
    NotFoundError: 'no-device',      // 压根没有麦克风硬件
    DevicesNotFoundError: 'no-device',
    NotReadableError: 'busy',        // 硬件被别的程序占着（腾讯会议、OBS…）
    TrackStartError: 'busy',
    OverconstrainedError: 'no-fit',  // 设备不满足约束（极少见）
    AbortError: 'busy'
  };
  function micError(rawName, fallbackMsg) {
    var err = new Error(fallbackMsg || rawName || '麦克风打不开');
    err.code = MIC_CODES[rawName] || 'unknown';
    err.raw = String(rawName || '');
    return err;
  }

  function Recorder(opts) {
    this.opts = opts || {};
    this.chunks = [];
    this.total = 0;
    this.spoken = false;
    this.quietMs = 0;
    this.timer = null;
    this.stopped = false;
  }

  Recorder.prototype.start = function () {
    var self = this;
    var o = self.opts;
    /* 取麦克风之前先自检一句：file:// 双击打开时 navigator.mediaDevices 可能整个不存在，
       这种错不说清楚，老人只会看到"没反应"。 */
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(micError('insecure', '这个页面没有麦克风接口（可能不是 https 打开）'));
    }
    var constraints = {
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    };
    return navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      self.stream = stream;
      var AC = window.AudioContext || window.webkitAudioContext;
      var ctx = new AC({ sampleRate: 16000 });     // Whisper 要 16kHz，让浏览器替我们重采样
      self.ctx = ctx;
      var src = ctx.createMediaStreamSource(stream);
      var proc = ctx.createScriptProcessor(4096, 1, 1);
      var mute = ctx.createGain();
      mute.gain.value = 0;                          // 不把麦克风声音放出来（避免啸叫）
      self.proc = proc;
      self.mute = mute;

      var frameMs = 4096 / 16000 * 1000;
      var maxMs = o.maxMs || 12000;
      var quietStopMs = o.quietMs || 1100;          // 说完停顿 1.1 秒就自动收尾
      var noSpeechMs = o.noSpeechMs || 6000;        // 6 秒还没开口就不再等
      var startedAt = Date.now();

      if (typeof o.onTick === 'function') o.onTick('listening');

      proc.onaudioprocess = function (ev) {
        if (self.stopped) return;
        var d = ev.inputBuffer.getChannelData(0);
        var sum = 0;
        for (var i = 0; i < d.length; i++) sum += d[i] * d[i];
        var rms = Math.sqrt(sum / d.length);
        self.chunks.push(new Float32Array(d));
        self.total += d.length;

        if (rms > 0.012) { self.spoken = true; self.quietMs = 0; }
        else if (self.spoken) { self.quietMs += frameMs; }

        var elapsed = Date.now() - startedAt;
        if (typeof o.onTick === 'function') o.onTick('listening', { rms: rms, elapsed: elapsed });

        if ((self.spoken && self.quietMs >= quietStopMs) || elapsed >= maxMs ||
            (!self.spoken && elapsed >= noSpeechMs)) {
          self.finish();
        }
      };

      src.connect(proc);
      proc.connect(mute);
      mute.connect(ctx.destination);
      self.onFinish = o.onFinish;
      return true;
    }).catch(function (err) {
      /* 权限/设备类错误：换成带 code 的错误再抛出去，上层按码说话，不用猜 */
      throw (err && MIC_CODES[err.name]) ? micError(err.name, err.message) : err;
    });
  };

  Recorder.prototype.samples = function () {
    var out = new Float32Array(this.total);
    var at = 0;
    for (var i = 0; i < this.chunks.length; i++) { out.set(this.chunks[i], at); at += this.chunks[i].length; }
    return out;
  };

  Recorder.prototype.release = function () {
    try { if (this.proc) this.proc.onaudioprocess = null; } catch (e) { /* 忽略 */ }
    try { if (this.proc) this.proc.disconnect(); } catch (e2) { /* 忽略 */ }
    try { if (this.mute) this.mute.disconnect(); } catch (e3) { /* 忽略 */ }
    try { if (this.ctx) this.ctx.close(); } catch (e4) { /* 忽略 */ }
    try {
      if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    } catch (e5) { /* 忽略 */ }
  };

  Recorder.prototype.finish = function () {
    if (this.stopped) return;
    this.stopped = true;
    var self = this;
    var samples = self.samples();
    var spoke = self.spoken;
    self.release();
    if (typeof self.onFinish === 'function') self.onFinish(spoke, samples);
  };

  Recorder.prototype.abort = function () {
    if (this.stopped) return;
    this.stopped = true;
    this.release();
  };

  var active = null;

  /* ---------------- 对外：听一句 ---------------- */
  function listen(opts) {
    var o = opts || {};
    if (!asr) return Promise.reject(new Error('离线识别还没准备好'));
    return new Promise(function (resolve, reject) {
      var rec = new Recorder({
        maxMs: o.maxMs, quietMs: o.quietMs, noSpeechMs: o.noSpeechMs,
        onTick: o.onTick,
        onFinish: function (spoke, samples) {
          active = null;
          if (!spoke) { resolve(''); return; }
          if (typeof o.onTick === 'function') o.onTick('recognizing');
          var seconds = samples.length / 16000;
          if (seconds < 0.4) { resolve(''); return; }
          try {
            Promise.resolve(asr(samples, {
              language: o.language || 'zh',   // 界面是英文时传 'en'，其余都按中文听
              task: 'transcribe',
              return_timestamps: false
            }))
              .then(function (out) { resolve(clean(out && out.text)); })
              .catch(function (err) { reject(err); });
          } catch (err) { reject(err); }
        }
      });
      active = rec;
      rec.start().catch(function (err) { active = null; reject(err); });
    });
  }

  function stop() {
    if (active) { active.abort(); active = null; return true; }
    return false;
  }

  /* 小模型遇到环境音会"幻听"：静音听成客气话（"谢谢观看""字幕由…提供"），
     或者反复吐同一个字。这些一律清掉，让上层按"没听到"处理，
     绝不能把幻听当成老人说的话去点页面。 */
  var JUNK = [
    /^[\s。，、.!,]*$/,
    /[谢謝](大家)?(观看|觀看|收看|收听|收聽)/,          // 简繁都要挡
    /字幕(由|志願者|志愿者|組|组|by|：|:)/i,
    /請?不吝(點|点)(贊|赞)/,
    /^(點|点)(贊|赞)$/,
    /^(訂閱|訂閲|订阅|轉發|转发|打賞|打赏|關注|关注)$/,
    /^(音乐|音樂)$/i,
    /^(字幕|subtitle|subtitles|music)$/i,
    /^\[.*\]$/,
    /^(.)\1{2,}$/                       // 同一个字重复三次以上，也是幻听
  ];
  var WRAP_L = /^[\s()[\]{}【】（）「」『』<>《》"'`]+/;
  var WRAP_R = /[\s()[\]{}【】（）「」『』<>《》"'`]+$/;
  function clean(text) {
    if (!text) return '';
    var raw = String(text).replace(/\s+/g, ' ').trim();
    /* 模型爱给整句套括号："（音樂）""[BLANK_AUDIO]"。判幻听要连套壳一起判，
       但返还给上层的仍是去掉套壳的正文。 */
    var t = raw.replace(WRAP_L, '').replace(WRAP_R, '').trim();
    if (!t) return '';
    for (var i = 0; i < JUNK.length; i++) {
      if (JUNK[i].test(raw) || JUNK[i].test(t)) return '';
    }
    return t;
  }

  window.XiaoYuErSpeech = {
    version: '1.1.0',
    supported: supported,
    micState: micState,
    state: function () { return state; },
    ready: function () { return !!asr; },
    cached: cached,
    prepare: prepare,
    listen: listen,
    stop: stop,
    clean: clean,
    setModel: setModel,
    modelSize: modelSize,
    modelName: function () { return currentKey === 'best' ? '标准' : '轻量'; },
    source: function () { return host; },          // 实际用上的模型源
    /* 自检用：不下载也能检查内部状态 */
    _debug: function () {
      return { state: state, key: currentKey, id: modelId(), lib: !!lib, asr: !!asr, host: host };
    }
  };

  currentKey = pickKey();
})();
