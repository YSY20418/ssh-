/* ============================================================
   小鱼兒 · 语音智能助手（挂在适老预约挂号页上的「代驾智能体」）

   设计原则（与主项目一致）：
   1. 智能体只做「决策」——把一句话变成一个动作序列；
      执行一律交给确定性代码：要么走能力清单 XiaoYuEr.call()，
      要么走界面导航白名单 XiaoYuEr.nav()，绝不直接改页面。
   2. 取值只能从「当前可选项」里挑，说一个页面上没有的选项会被拒绝。
   3. 零成本兜底：没有网络、没有麦克风、没有大模型，规则引擎照样能办事。
   4. 高危动作（提交预约）必须人工授权，语音也只能把确认窗叫出来。
   5. 想接真实大模型时用 setPlanner(fn) 挂上去；它挂了或报错，自动回落到规则引擎。

   一句话的旅程（顺序即优先级，越靠前越先说话）：
     确认窗开着   → 只听「确认 / 取消」
     页面控制命令 → 念 / 停 / 字号 / 前后步 / 重来 / 问进度（改页面）
     业务动作     → 症状 / 科室 / 医生 / 日期时段 / 就诊人 / 付款 / 提交（改页面）
     对话层       → 本地语料库 XiaoYuErCorpus（data/corpus.json）：
                    打招呼、问身份、问能耐、步进指引、道谢道别、
                    诉说难受、危急劝导、挂号 FAQ、陪聊、解闷……
                    只说不动页面；三语；按当前步骤回答；回复轮换不复读。
   ============================================================ */
(function () {
  'use strict';

  var X = window.XiaoYuEr;
  if (!X) return;

  /* ---------------- 助手自己的三语文案 ---------------- */
  var I18N = {
    zh: {
      'ai.inlineTitle': '不想自己点？让小鱼兒替您办',
      'ai.inlineDesc': '点一下，对着手机说「我腿疼」，它替您选好',
      'ai.fab': '跟我说话',
      'ai.title': '小鱼兒 · 语音助手',
      'ai.sub': '您说一句，我替您点',
      'ai.close': '关闭',
      'ai.talk': '点这里说话',
      'ai.listening': '正在听您说…请讲话',
      'ai.stopListen': '不听了',
      'ai.hear': '我听到：',
      'ai.unsupported': '这台设备听不了话。您可以直接点下面的话，一样能办。',
      'ai.micDenied': '麦克风被浏览器拦住了。我一步一步教您打开：',
      'ai.micNoDevice': '这台设备没有找到麦克风。您可以直接点下面的话，一样能办。',
      'ai.micBusy': '麦克风正被别的程序用着（比如视频会议）。关掉它再试，或直接点下面的话。',
      'ai.micInsecure': '这个打开方式不让用麦克风。请在地址栏里用 https 或本机地址打开，或直接点下面的话。',
      'ai.micHowTo': '怎么打开麦克风',
      'ai.micStep1': '① 看屏幕最上方，找浏览器地址栏，点它左边的小图标（锁头或方块）。',
      'ai.micStep2': '② 在弹出的列表里，找到「麦克风」这一行。',
      'ai.micStep3': '③ 把麦克风改成「允许」，然后回来再点一次「点这里说话」。',
      'ai.micStateLabel': '麦克风状态：',
      'ai.micStateGranted': '已允许，可以直接说',
      'ai.micStateDenied': '被浏览器拦住了，点下面的方法打开',
      'ai.micStatePrompt': '还没问过您，点一次麦克风就会问',
      'ai.micStateUnknown': '查不出来，点一次麦克风试试',
      'ai.micRetry': '再试一次麦克风',
      'ai.noSpeech': '没听到声音，请离近一点再说一次。',
      'ai.netErr': '网络不通，暂时听不了话。请直接点下面的话，或者点「用离线识别」把它装进这台设备。',
      'ai.startFail': '没能打开麦克风。请再点一次；还是不行，就点下面的话。',
      'ai.silent': '没有听到声音。您离近一点，再说一次。',
      'ai.noEngine': '这台设备现在听不了话。可以点「用离线识别」把识别装进设备里，也可以直接点下面的话。',
      'ai.offlineBtn': '用离线识别',
      'ai.offlineNote': '把识别装在设备里，不联网也能听，声音不出这台设备。第一次要下载一点点，装一次就行。',
      'ai.offlineDown': '正在准备离线识别…{pct}%（装一次以后就不用再装）',
      'ai.offlineOk': '离线识别装好了。以后不联网也能说话。',
      'ai.offlineFail': '离线识别没装成，可能是网络不通。您可以直接点下面的话，一样能办。',
      'ai.offlineReady': '离线识别已就绪',
      'ai.offlineLoading': '正在装…',
      'ai.offlinePreparing': '正在把离线识别装进这台设备（装过就不用再下载）…',
      'ai.recording': '请说话…说完停一下就好',
      'ai.recognizing': '正在认您说的话…',
      'ai.offlineCached': '离线识别已装好（{size}），点麦克风就能用。',
      'ai.unknown': '没听明白。您可以这样说：',
      'ai.guard': '这句话我没有把握，先不动页面。请您再说一次，或点下面的话。',
      'ai.hello': '您好，我是小鱼兒。说一句「我要挂号」就开始，也可以点下面的话。',
      'ai.didStart': '好的，我们开始挂号。',
      'ai.didSymptom': '记下了：{symptom}。我帮您挂{dept}。',
      'ai.didDept': '改挂{dept}。',
      'ai.didDoctor': '挂{doctor}医生的号。',
      'ai.didDate': '选{date}。',
      'ai.didSlot': '选{slot}。',
      'ai.didPatient': '就诊人：{patient}。',
      'ai.didPay': '付款方式：{pay}。',
      'ai.needConfirm': '这一步要您本人定。请点屏幕上的绿色按钮，或者说一声「确认」。',
      'ai.confirmed': '挂好了，取号码 {no}。请提前 15 分钟到，带好身份证。',
      'ai.incomplete': '还差一点：{what}',
      'ai.slotFull': '这个时间已经约满了，换一个吧。',
      'ai.next': '好的，下一步。',
      'ai.prev': '好的，回到上一步。',
      'ai.help': '您可以叫家里人帮您点，也可以到一楼服务台找穿制服的工作人员。',
      'ai.read': '好的，我念一遍。',
      'ai.stopped': '好的，不念了。',
      'ai.fontUp': '字变大了。',
      'ai.fontDown': '字变小了。',
      'ai.restart': '好的，重新挂一个。',
      'ai.finish': '好的，那先到这里。',
      'ai.chips': '您也可以直接点这些话：',
      'ai.wrongStep': '这一步还办不了这个，我没有乱动页面。您可以先点「上一步」回去改。',
      'ai.cancelBooking': '好的，这次先不挂。您还可以改，改好了再点确认。',
      'ai.askSymptom': '大科里还分好几种。您主要是头晕、心慌、咳嗽，还是肚子痛？',
      'ai.statusStep': '现在到第 {n} 步：{name}。',
      'chip.start': '我要挂号',
      'chip.symptom': '我{name}',
      'chip.firstDoctor': '第一位医生',
      'chip.secondDoctor': '第二位医生',
      'chip.chief': '主任医师',
      'chip.today': '今天',
      'chip.tomorrow': '明天',
      'chip.am': '上午',
      'chip.pm': '下午',
      'chip.pay': '用{name}',
      'chip.confirm': '确认预约',
      'chip.again': '再挂一个',
      'chip.done': '好了',
      'chip.read': '念一遍',
      'chip.prev': '上一步',
      'chip.next': '下一步'
    },

    'zh-Hant': {
      'ai.inlineTitle': '不想自己點？讓小鱼兒替您辦',
      'ai.inlineDesc': '點一下，對著手機說「我腿疼」，它替您選好',
      'ai.fab': '跟我說話',
      'ai.title': '小鱼兒 · 語音助手',
      'ai.sub': '您說一句，我替您點',
      'ai.close': '關閉',
      'ai.talk': '點這裡說話',
      'ai.listening': '正在聽您說…請講話',
      'ai.stopListen': '不聽了',
      'ai.hear': '我聽到：',
      'ai.unsupported': '這台設備聽不了話。您可以直接點下面的話，一樣能辦。',
      'ai.micDenied': '麥克風被瀏覽器攔住了。我一步一步教您打開：',
      'ai.micNoDevice': '這台設備沒有找到麥克風。您可以直接點下面的話，一樣能辦。',
      'ai.micBusy': '麥克風正被別的程式用著（比如視訊會議）。關掉它再試，或直接點下面的話。',
      'ai.micInsecure': '這個打開方式不讓用麥克風。請在網址列裡用 https 或本機地址打開，或直接點下面的話。',
      'ai.micHowTo': '怎麼打開麥克風',
      'ai.micStep1': '① 看螢幕最上方，找瀏覽器網址列，點它左邊的小圖示（鎖頭或方塊）。',
      'ai.micStep2': '② 在彈出的列表裡，找到「麥克風」這一行。',
      'ai.micStep3': '③ 把麥克風改成「允許」，然後回來再點一次「點這裡說話」。',
      'ai.micStateLabel': '麥克風狀態：',
      'ai.micStateGranted': '已允許，可以直接說',
      'ai.micStateDenied': '被瀏覽器攔住了，點下面的方法打開',
      'ai.micStatePrompt': '還沒問過您，點一次麥克風就會問',
      'ai.micStateUnknown': '查不出來，點一次麥克風試試',
      'ai.micRetry': '再試一次麥克風',
      'ai.noSpeech': '沒聽到聲音，請離近一點再說一次。',
      'ai.netErr': '網路不通，暫時聽不了話。請直接點下面的話，或者點「用離線識別」把它裝進這台設備。',
      'ai.startFail': '沒能打開麥克風。請再點一次；還是不行，就點下面的話。',
      'ai.silent': '沒有聽到聲音。您離近一點，再說一次。',
      'ai.noEngine': '這台設備現在聽不了話。可以點「用離線識別」把識別裝進設備裡，也可以直接點下面的話。',
      'ai.offlineBtn': '用離線識別',
      'ai.offlineNote': '把識別裝在設備裡，不連網也能聽，聲音不出這台設備。第一次要下載一點點，裝一次就行。',
      'ai.offlineDown': '正在準備離線識別…{pct}%（裝一次以後就不用再裝）',
      'ai.offlineOk': '離線識別裝好了。以後不連網也能說話。',
      'ai.offlineFail': '離線識別沒裝成，可能是網路不通。您可以直接點下面的話，一樣能辦。',
      'ai.offlineReady': '離線識別已就緒',
      'ai.offlineLoading': '正在裝…',
      'ai.offlinePreparing': '正在把離線識別裝進這台設備（裝過就不用再下載）…',
      'ai.recording': '請說話…說完停一下就好',
      'ai.recognizing': '正在認您說的話…',
      'ai.offlineCached': '離線識別已裝好（{size}），點麥克風就能用。',
      'ai.unknown': '沒聽明白。您可以這樣說：',
      'ai.guard': '這句話我沒有把握，先不動頁面。請您再說一次，或點下面的話。',
      'ai.hello': '您好，我是小鱼兒。說一句「我要掛號」就開始，也可以點下面的話。',
      'ai.didStart': '好的，我們開始掛號。',
      'ai.didSymptom': '記下了：{symptom}。我幫您掛{dept}。',
      'ai.didDept': '改掛{dept}。',
      'ai.didDoctor': '掛{doctor}醫生的號。',
      'ai.didDate': '選{date}。',
      'ai.didSlot': '選{slot}。',
      'ai.didPatient': '就診人：{patient}。',
      'ai.didPay': '付款方式：{pay}。',
      'ai.needConfirm': '這一步要您本人定。請點螢幕上的綠色按鈕，或者說一聲「確認」。',
      'ai.confirmed': '掛好了，取號碼 {no}。請提前 15 分鐘到，帶好身分證。',
      'ai.incomplete': '還差一點：{what}',
      'ai.slotFull': '這個時間已經約滿了，換一個吧。',
      'ai.next': '好的，下一步。',
      'ai.prev': '好的，回到上一步。',
      'ai.help': '您可以叫家裡人幫您點，也可以到一樓服務台找穿制服的工作人員。',
      'ai.read': '好的，我念一遍。',
      'ai.stopped': '好的，不念了。',
      'ai.fontUp': '字變大了。',
      'ai.fontDown': '字變小了。',
      'ai.restart': '好的，重新掛一個。',
      'ai.finish': '好的，那先到這裡。',
      'ai.chips': '您也可以直接點這些話：',
      'ai.wrongStep': '這一步還辦不了這個，我沒有亂動頁面。您可以先點「上一步」回去改。',
      'ai.cancelBooking': '好的，這次先不掛。您還可以改，改好了再點確認。',
      'ai.askSymptom': '大科裡還分好幾種。您主要是頭暈、心慌、咳嗽，還是肚子痛？',
      'ai.statusStep': '現在到第 {n} 步：{name}。',
      'chip.start': '我要掛號',
      'chip.symptom': '我{name}',
      'chip.firstDoctor': '第一位醫生',
      'chip.secondDoctor': '第二位醫生',
      'chip.chief': '主任醫師',
      'chip.today': '今天',
      'chip.tomorrow': '明天',
      'chip.am': '上午',
      'chip.pm': '下午',
      'chip.pay': '用{name}',
      'chip.confirm': '確認預約',
      'chip.again': '再掛一個',
      'chip.done': '好了',
      'chip.read': '念一遍',
      'chip.prev': '上一步',
      'chip.next': '下一步'
    },

    en: {
      'ai.inlineTitle': 'Rather not tap? Let Xiao Yu Er do it',
      'ai.inlineDesc': 'Tap here and say "my leg hurts" — it will pick for you',
      'ai.fab': 'Talk to me',
      'ai.title': 'Xiao Yu Er · Voice helper',
      'ai.sub': 'Say one sentence, I tap for you',
      'ai.close': 'Close',
      'ai.talk': 'Tap to speak',
      'ai.listening': 'Listening… please speak',
      'ai.stopListen': 'Stop listening',
      'ai.hear': 'I heard: ',
      'ai.unsupported': 'This device cannot listen. Just tap one of the phrases below.',
      'ai.micDenied': 'The microphone is blocked by the browser. Here is how to open it:',
      'ai.micNoDevice': 'No microphone was found on this device. Just tap one of the phrases below.',
      'ai.micBusy': 'The microphone is being used by another program (like a video call). Close it and try again, or tap a phrase below.',
      'ai.micInsecure': 'This way of opening the page does not allow the microphone. Open it with https or a local address, or tap a phrase below.',
      'ai.micHowTo': 'How to allow the microphone',
      'ai.micStep1': '1. Look at the very top of the screen: find the browser address bar and tap the small icon on its left (a lock or a square).',
      'ai.micStep2': '2. In the list that opens, find the row that says "Microphone".',
      'ai.micStep3': '3. Set the microphone to "Allow", then come back and tap "Tap to speak" once more.',
      'ai.micStateLabel': 'Microphone: ',
      'ai.micStateGranted': 'allowed, you can just talk',
      'ai.micStateDenied': 'blocked by the browser, see how to open it below',
      'ai.micStatePrompt': 'not asked yet, tap the mic button and it will ask',
      'ai.micStateUnknown': 'cannot tell, tap the mic button to try',
      'ai.micRetry': 'Try the microphone again',
      'ai.noSpeech': 'I did not hear anything. Please come closer and try again.',
      'ai.netErr': 'No network, so cloud listening is off. Tap a phrase below, or tap "Offline recognition" to install it on this device.',
      'ai.startFail': 'Could not open the microphone. Tap once more; if it still fails, just tap a phrase below.',
      'ai.silent': 'Nothing was heard. Move a bit closer and say it again.',
      'ai.noEngine': 'This device cannot listen right now. Tap "Offline recognition" to install it, or simply tap a phrase below.',
      'ai.offlineBtn': 'Offline recognition',
      'ai.offlineNote': 'Installs the recognizer on this device: works without network, and the audio never leaves it. One download, then it stays.',
      'ai.offlineDown': 'Preparing offline recognition… {pct}% (one-time download)',
      'ai.offlineOk': 'Offline recognition is ready. You can speak without network from now on.',
      'ai.offlineFail': 'Offline recognition could not be installed (network?). You can just tap a phrase below.',
      'ai.offlineReady': 'Offline recognition ready',
      'ai.offlineLoading': 'Installing…',
      'ai.offlinePreparing': 'Installing offline recognition on this device (no re-download next time)…',
      'ai.recording': 'Please speak… then pause for a moment',
      'ai.recognizing': 'Working out what you said…',
      'ai.offlineCached': 'Offline recognition already installed ({size}) — just tap the microphone.',
      'ai.unknown': 'I did not catch that. You can say things like:',
      'ai.guard': 'I am not sure about that, so I will not touch the page. Please say it again.',
      'ai.hello': 'Hello, I am Xiao Yu Er. Say "book an appointment" to start, or tap a phrase below.',
      'ai.didStart': 'All right, let us start.',
      'ai.didSymptom': 'Noted: {symptom}. I suggest {dept}.',
      'ai.didDept': 'Changed to {dept}.',
      'ai.didDoctor': 'Booking doctor {doctor}.',
      'ai.didDate': 'Chosen {date}.',
      'ai.didSlot': 'Chosen {slot}.',
      'ai.didPatient': 'Patient: {patient}.',
      'ai.didPay': 'Payment: {pay}.',
      'ai.needConfirm': 'This step needs your own decision. Tap the green button, or say "confirm".',
      'ai.confirmed': 'Booked. Queue number {no}. Please arrive 15 minutes early with your ID.',
      'ai.incomplete': 'One thing is missing: {what}',
      'ai.slotFull': 'That time is fully booked. Please pick another.',
      'ai.next': 'All right, next step.',
      'ai.prev': 'All right, back one step.',
      'ai.help': 'Ask a family member to help, or find staff in uniform at the service desk.',
      'ai.read': 'All right, I will read it out.',
      'ai.stopped': 'All right, stopping.',
      'ai.fontUp': 'Text is bigger now.',
      'ai.fontDown': 'Text is smaller now.',
      'ai.restart': 'All right, start a new booking.',
      'ai.finish': 'All right, we are done here.',
      'ai.chips': 'You can also just tap one of these:',
      'ai.wrongStep': 'That cannot be done on this step, so I changed nothing. Tap Back to edit.',
      'ai.cancelBooking': 'All right, not booking yet. You can still change things, then confirm.',
      'ai.askSymptom': 'There are several. Is it dizziness, palpitations, cough, or belly pain?',
      'ai.statusStep': 'You are on step {n}: {name}.',
      'chip.start': 'Book an appointment',
      'chip.symptom': 'I have {name}',
      'chip.firstDoctor': 'The first doctor',
      'chip.secondDoctor': 'The second doctor',
      'chip.chief': 'The chief physician',
      'chip.today': 'Today',
      'chip.tomorrow': 'Tomorrow',
      'chip.am': 'In the morning',
      'chip.pm': 'In the afternoon',
      'chip.pay': 'Pay by {name}',
      'chip.confirm': 'Confirm booking',
      'chip.again': 'Book another one',
      'chip.done': 'All done',
      'chip.read': 'Read it out',
      'chip.prev': 'Go back',
      'chip.next': 'Next step'
    }
  };

  X.registerI18n(I18N);
  var T = function (k, v) { return X.t(k, v); };
  var LANGS = ['zh', 'zh-Hant', 'en'];

  /* ---------------- 关键词表 ---------------- */
  var KW = {
    start: {
      zh: ['我要挂号', '挂个号', '挂个', '预约挂号', '我要预约', '开始挂号', '挂号', '看病', '帮我挂', '挂个骨科', '挂个内科'],
      'zh-Hant': ['我要掛號', '掛個號', '掛個', '預約掛號', '我要預約', '開始掛號', '掛號', '看病', '幫我掛'],
      en: ['book an appointment', 'appointment', 'register', 'start', 'see a doctor', 'book']
    },
    finish: {
      zh: ['好了', '知道了', '完成了', '结束', '没了', '不用了'],
      'zh-Hant': ['好了', '知道了', '完成了', '結束', '沒了', '不用了'],
      en: ['all done', 'thats all', 'finish', 'done']
    },
    next: { zh: ['下一步', '下一页', '继续', '接着', '往下', '继续下一步'], 'zh-Hant': ['下一步', '下一頁', '繼續', '接著', '往下'], en: ['next', 'continue', 'go on'] },
    prev: { zh: ['上一步', '上一页', '返回', '回去', '后退', '退一步'], 'zh-Hant': ['上一步', '上一頁', '返回', '回去', '後退', '退一步'], en: ['back', 'previous', 'go back'] },
    help: { zh: ['需要帮助', '我要帮助', '帮忙', '我不会', '不会弄', '不会用', '找人', '怎么办', '咋办'], 'zh-Hant': ['需要幫助', '我要幫助', '幫忙', '我不會', '不會弄', '不會用', '找人', '怎麼辦'], en: ['help', 'assist', 'what should i do'] },
    read: { zh: ['念一遍', '读一遍', '再念', '念给我听', '读给我听', '念一下', '朗读', '说给我听'], 'zh-Hant': ['念一遍', '讀一遍', '再唸', '唸給我聽', '讀給我聽', '朗讀', '說給我聽'], en: ['read', 'read it', 'say it again'] },
    stop: { zh: ['别念了', '不要念', '停止', '停下', '安静', '停'], 'zh-Hant': ['別唸了', '不要唸', '停止', '停下', '安靜', '停'], en: ['stop', 'be quiet', 'enough'] },
    fontUp: { zh: ['字太小', '放大字', '字放大', '大一点', '大一些', '字号大', '看不清字', '字大点'], 'zh-Hant': ['字太小', '放大字', '字放大', '大一點', '大一些', '字級大', '看不清字', '字大點'], en: ['bigger', 'larger', 'too small'] },
    fontDown: { zh: ['字太大', '缩小', '小一点', '小一些', '字小点'], 'zh-Hant': ['字太大', '縮小', '小一點', '小一些', '字小點'], en: ['smaller', 'too big'] },
    restart: { zh: ['重新挂', '重挂', '重新来', '重来', '再来一个', '再挂一个', '重新开始'], 'zh-Hant': ['重新掛', '重掛', '重新來', '重來', '再來一個', '再掛一個', '重新開始'], en: ['restart', 'start over', 'another one'] },
    submit: { zh: ['确认预约', '确认挂号', '就这个', '就这样', '定下来', '提交', '挂了吧', '确认'], 'zh-Hant': ['確認預約', '確認掛號', '就這個', '就這樣', '定下來', '提交', '掛了吧', '確認'], en: ['confirm', 'submit', 'book it'] },
    yes: { zh: ['确认', '确定', '是的', '对的', '没错', '好的', '可以', '行', '就这个', '提交'], 'zh-Hant': ['確認', '確定', '是的', '對的', '沒錯', '好的', '可以', '行', '就這個', '提交'], en: ['yes', 'confirm', 'ok', 'okay', 'sure', 'correct', 'do it'] },
    no: { zh: ['取消', '不要', '算了', '不对', '再看看'], 'zh-Hant': ['取消', '不要', '算了', '不對', '再看看'], en: ['no', 'cancel', 'not now'] },
    status: { zh: ['第几步', '哪一步', '我在哪', '现在到哪', '做到哪'], 'zh-Hant': ['第幾步', '哪一步', '我在哪', '現在到哪', '做到哪'], en: ['which step', 'where am i'] },
    am: { zh: ['上午', '早上', '上半天', '尚午', '商务', '上五'], 'zh-Hant': ['上午', '早上', '上半天'], en: ['morning'] },
    pm: { zh: ['下午', '中午', '下半天', '夏午', '下五', '午后'], 'zh-Hant': ['下午', '中午', '下半天', '午後'], en: ['afternoon'] },
    today: { zh: ['今天', '今日', '当天'], 'zh-Hant': ['今天', '今日', '當天'], en: ['today'] },
    tomorrow: { zh: ['明天', '明日'], 'zh-Hant': ['明天', '明日'], en: ['tomorrow'] },
    dayAfter: { zh: ['后天', '大后天'], 'zh-Hant': ['後天', '大後天'], en: ['day after'] },
    vague: { zh: ['内科', '外科', '专家号', '专家'], 'zh-Hant': ['內科', '外科', '專家號', '專家'], en: ['internal medicine', 'specialist'] }
  };

  /* 症状 / 科室 / 医生 / 就诊人 / 付款 的口语说法（简繁英各一份） */
  var SYM_ALIAS = {
    head: { zh: ['头晕头痛', '头晕', '头痛', '头疼', '头昏', '晕'], 'zh-Hant': ['頭暈頭痛', '頭暈', '頭痛', '頭疼', '頭昏', '暈'], en: ['dizzy', 'headache'] },
    chest: { zh: ['心慌胸闷', '心慌', '胸闷', '胸痛', '心脏', '心口', '慌'], 'zh-Hant': ['心慌胸悶', '心慌', '胸悶', '胸痛', '心臟', '心口'], en: ['palpitation', 'chest'] },
    fever: { zh: ['咳嗽发烧', '咳嗽', '发烧', '发热', '咳', '感冒'], 'zh-Hant': ['咳嗽發燒', '咳嗽', '發燒', '發熱', '咳', '感冒'], en: ['cough', 'fever'] },
    belly: { zh: ['肚子痛', '肚子疼', '腹痛', '胃疼', '胃痛', '拉肚子', '肚'], 'zh-Hant': ['肚子痛', '肚子疼', '腹痛', '胃疼', '胃痛', '拉肚子', '肚'], en: ['stomach', 'belly'] },
    leg: { zh: ['腿疼', '腿痛', '膝盖', '腿脚', '腿', '腰痛', '关节'], 'zh-Hant': ['腿疼', '腿痛', '膝蓋', '腿腳', '腿', '腰痛', '關節'], en: ['leg', 'knee'] },
    eye: { zh: ['眼睛不舒服', '眼睛', '眼花', '视力', '看不清', '眼'], 'zh-Hant': ['眼睛不舒服', '眼睛', '眼花', '視力', '看不清', '眼'], en: ['eye', 'vision'] },
    unsure: { zh: ['不知道选什么', '不知道挂什么', '不知道', '不确定', '随便', '说不清', '全身不舒服'], 'zh-Hant': ['不知道選什麼', '不知道掛什麼', '不知道', '不確定', '隨便', '說不清', '全身不舒服'], en: ['not sure', 'dont know', 'unsure'] }
  };

  var DEPT_ALIAS = {
    neurology: { zh: ['神经内科', '脑科', '神经科', '脑血管'], 'zh-Hant': ['神經內科', '腦科', '神經科', '腦血管'], en: ['neurology', 'brain'] },
    cardiology: { zh: ['心血管内科', '心内科', '心脏科', '心血管'], 'zh-Hant': ['心血管內科', '心內科', '心臟科', '心血管'], en: ['cardiology', 'heart'] },
    respiratory: { zh: ['呼吸内科', '呼吸科', '喘'], 'zh-Hant': ['呼吸內科', '呼吸科', '喘'], en: ['respiratory', 'lung'] },
    gastro: { zh: ['消化内科', '消化科', '胃肠', '肠胃'], 'zh-Hant': ['消化內科', '消化科', '胃腸', '腸胃'], en: ['gastro', 'stomach department'] },
    surgery: { zh: ['普通外科', '外科', '普外'], 'zh-Hant': ['普通外科', '外科', '普外'], en: ['surgery'] },
    orthopedics: { zh: ['骨科', '骨伤', '关节科'], 'zh-Hant': ['骨科', '骨傷', '關節科'], en: ['orthopedics', 'bone'] },
    ophthalmology: { zh: ['眼科', '眼睛科'], 'zh-Hant': ['眼科', '眼睛科'], en: ['ophthalmology', 'eye department'] },
    gp: { zh: ['全科医学科', '全科医学', '全科', '普通门诊'], 'zh-Hant': ['全科醫學科', '全科醫學', '全科', '普通門診'], en: ['general practice', 'general'] }
  };

  var PAT_ALIAS = {
    self: { zh: ['本人', '我自己', '我本人', '就我'], 'zh-Hant': ['本人', '我自己', '我本人', '就我'], en: ['myself', 'my own'] },
    spouse: { zh: ['老伴', '爱人', '配偶', '我老伴', '老头子', '老婆'], 'zh-Hant': ['老伴', '愛人', '配偶', '我老伴', '老婆'], en: ['spouse', 'my wife', 'my husband'] },
    family: { zh: ['家人', '儿子', '女儿', '孩子', '陪同', '闺女'], 'zh-Hant': ['家人', '兒子', '女兒', '孩子', '陪同'], en: ['family', 'my son', 'my daughter'] }
  };

  var PAY_ALIAS = {
    medical: { zh: ['医保卡', '医保', '社保卡', '社保', '医疗卡', '一包'], 'zh-Hant': ['健保卡', '健保', '醫保卡', '醫保', '社保'], en: ['insurance'] },
    wechat: { zh: ['微信', '威信', '微讯'], 'zh-Hant': ['微信', '威信', '微訊'], en: ['wechat'] },
    alipay: { zh: ['支付宝', '支付保'], 'zh-Hant': ['支付寶', '支付保'], en: ['alipay'] },
    hospital: { zh: ['到医院再付', '到医院付', '到医院', '到院付', '现场付', '窗口付', '现金', '看完再付'], 'zh-Hant': ['到醫院再付', '到醫院付', '到醫院', '到院付', '現場付', '窗口付', '現金', '看完再付'], en: ['at hospital', 'pay later', 'cash'] }
  };

  /* 语音识别常见的同音错字，先纠正再理解 */
  var FIX = [
    ['搞好', '挂号'], ['挂好', '挂号'], ['管好', '挂号'], ['乖号', '挂号'],
    ['头疼', '头痛'], ['肚疼', '肚子痛'], ['肚字疼', '肚子痛'], ['肚子疼', '肚子痛'],
    ['心荒', '心慌'], ['胸问', '胸闷'], ['胸疼', '胸痛'],
    ['晌午', '上午'], ['尚午', '上午'], ['上五', '上午'], ['商务', '上午'],
    ['夏午', '下午'], ['下五', '下午'], ['瞎午', '下午'],
    ['明田', '明天'], ['后田', '后天'], ['後田', '後天'],
    ['一包', '医保'], ['一保', '医保'], ['威信', '微信'], ['支付保', '支付宝'],
    ['到院付', '到医院再付'], ['现场付', '到医院再付'], ['窗口付', '到医院再付'],
    ['下一部', '下一步'], ['上一部', '上一步'], ['下一页', '下一步'], ['上一页', '上一步']
  ];

  /* 哪些步骤才允许做哪个动作——防止在错误的步骤上乱点 */
  var STEP_GUARD = {
    select_symptom: [1], select_department: [1], select_doctor: [2],
    select_date: [3], select_slot: [3], select_patient: [4],
    select_payment: [4], submit_booking: [4]
  };
  var NAV_WHITE = ['next', 'prev', 'help', 'read', 'stop', 'confirm', 'confirmYes', 'closeModal',
    'fontUp', 'fontDown', 'fontReset', 'restart', 'home'];

  /* ---------------- 文本归一 ---------------- */
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[\s，。,.;；:：!！?？'"“”‘’、\-—_/\\()（）]/g, '');
  }
  function fixText(s) {
    for (var i = 0; i < FIX.length; i++) s = s.split(FIX[i][0]).join(FIX[i][1]);
    return s;
  }
  function longestHit(text, list) {
    var best = '';
    if (!list) return best;
    for (var i = 0; i < list.length; i++) {
      var w = norm(list[i]);
      if (w && text.indexOf(w) >= 0 && w.length > best.length) best = w;
    }
    return best;
  }
  function aliasHit(text, aliasTable, id) {
    var a = aliasTable[id];
    if (!a) return '';
    return longestHit(text, a[X.getState().lang] || a.zh);
  }
  function allLangHit(text, aliasTable, id) {
    var a = aliasTable[id] || {};
    var best = '';
    LANGS.forEach(function (l) {
      var m = longestHit(text, a[l] || []);
      if (m.length > best.length) best = m;
    });
    return best;
  }

  /* ---------------- 意图理解（规则引擎，离线可用） ---------------- */
  function understand(raw) {
    var text = fixText(norm(raw));
    if (!text) return { intent: 'empty', actions: [], score: 0 };

    var st = X.getState();
    var opt = X.options();
    var lang = st.lang;
    var order = [lang].concat(LANGS.filter(function (l) { return l !== lang; }));
    /* 对话层（本地语料库）先算出来备用：
       ① 页面命令永远优先——所以它只在前文所有动作都没命中时才开口；
       ② 「专家号」这种既是科室泛称又是常见咨询的词，问诊提醒要让位给真问答，
         不然老人问「专家号贵吗」得到的却是「您主要是头晕还是咳嗽」。 */
    var chatHit = (window.XiaoYuErCorpus && typeof window.XiaoYuErCorpus.match === 'function')
      ? window.XiaoYuErCorpus.match(text, lang, { step: st.step, name: T('stepbar.' + st.step) })
      : null;
    function group(name) {
      var g = KW[name] || {};
      for (var i = 0; i < order.length; i++) {
        var m = longestHit(text, g[order[i]] || []);
        if (m) return m;
      }
      return '';
    }
    function act(id, value, score) {
      return { kind: 'cap', id: id, params: { value: value }, steps: STEP_GUARD[id], score: score };
    }
    function nav(cmd, score) { return { kind: 'nav', nav: cmd, score: score }; }

    /* 1. 确认窗开着时，只听「确认 / 取消」，别的都不动 */
    if (X.isConfirmOpen()) {
      if (group('yes')) return { intent: 'confirm_yes', actions: [nav('confirmYes', 9)], score: 9 };
      if (group('no')) return { intent: 'confirm_no', actions: [{ kind: 'closeConfirm' }], score: 9 };
      return { intent: 'confirm_wait', actions: [], score: 0, reply: T('ai.needConfirm') };
    }

    /* 2. 控制类：念 / 停 / 帮助 / 字号 / 前后 / 重来 / 问进度，一句话只做一件事 */
    if (group('stop')) return { intent: 'stop', actions: [nav('stop', 5)], reply: T('ai.stopped'), score: 5 };
    if (group('read')) return { intent: 'read', actions: [nav('read', 5)], reply: T('ai.read'), score: 5 };
    if (group('help')) return { intent: 'help', actions: [nav('help', 5)], reply: T('ai.help'), score: 5 };
    if (group('fontUp')) return { intent: 'fontUp', actions: [nav('fontUp', 5)], reply: T('ai.fontUp'), score: 5 };
    if (group('fontDown')) return { intent: 'fontDown', actions: [nav('fontDown', 5)], reply: T('ai.fontDown'), score: 5 };
    if (group('status')) {
      return {
        intent: 'status', actions: [], score: 5,
        reply: T('ai.statusStep', { n: st.step, name: T('stepbar.' + st.step) })
      };
    }
    if (group('restart')) return { intent: 'restart', actions: [nav('restart', 6)], reply: T('ai.restart'), score: 6 };
    if (group('prev')) return { intent: 'prev', actions: [nav('prev', 5)], reply: T('ai.prev'), score: 5 };
    if (group('next')) return { intent: 'next', actions: [nav('next', 5)], reply: T('ai.next'), score: 5 };

    var actions = [];
    var score = 0;

    /* 3. 开始挂号 */
    var hitStart = group('start');
    if (hitStart && st.step <= 1) {
      actions.push(nav(st.step === 0 ? 'next' : 'noop', hitStart.length));
      score += hitStart.length;
    }

    /* 4. 症状（口语说法优先，其次页面上的选项名） */
    var symId = null, symScore = 0;
    Object.keys(SYM_ALIAS).forEach(function (id) {
      var m = allLangHit(text, SYM_ALIAS, id);
      if (m && m.length > symScore) { symScore = m.length; symId = id; }
    });
    opt.symptoms.forEach(function (s) {
      if (text.indexOf(norm(s.name)) >= 0 && norm(s.name).length > symScore) {
        symScore = norm(s.name).length; symId = s.id;
      }
    });
    if (symId) { actions.push(act('select_symptom', symId, symScore)); score += symScore; }

    /* 5. 科室（说得不够具体时，反过来问一句） */
    var deptId = null, deptScore = 0;
    Object.keys(DEPT_ALIAS).forEach(function (id) {
      var m = allLangHit(text, DEPT_ALIAS, id);
      if (m && m.length > deptScore) { deptScore = m.length; deptId = id; }
    });
    opt.depts.forEach(function (d) {
      var n = norm(d.name);
      if (n && text.indexOf(n) >= 0 && n.length > deptScore) { deptScore = n.length; deptId = d.id; }
    });
    if (deptId) { actions.push(act('select_department', deptId, deptScore)); score += deptScore; }
    else if (group('vague') && !symId && !chatHit) {
      return { intent: 'ask', actions: [], score: 2, reply: T('ai.askSymptom') };
    }

    /* 6. 医生：第几位 / 职称 / 姓名 / 姓 */
    var docId = null, docScore = 0;
    var ord = -1;
    if (text.indexOf('第一') >= 0 || text.indexOf('首位') >= 0) ord = 0;
    else if (text.indexOf('第二') >= 0) ord = 1;
    else if (text.indexOf('第三') >= 0) ord = 2;
    if (ord >= 0 && opt.doctors[ord]) { docId = opt.doctors[ord].id; docScore = 4; }
    if (!docId) {
      [['副主任', 1], ['主任', 0], ['主治', 2], ['专家', 0]].forEach(function (p) {
        if (!docId && text.indexOf(p[0]) >= 0 && opt.doctors[p[1]]) { docId = opt.doctors[p[1]].id; docScore = 3; }
      });
    }
    if (!docId) {
      opt.doctors.forEach(function (d) {
        var full = norm(d.name);
        var short = st.lang === 'en' ? full.split(' ')[0] : full.charAt(0);
        if (full && text.indexOf(full) >= 0 && full.length > docScore) { docScore = full.length; docId = d.id; }
        else if (short && short.length >= 1 && text.indexOf(short) >= 0 && short.length + 1 > docScore) { docScore = short.length + 1; docId = d.id; }
      });
    }
    if (docId) { actions.push(act('select_doctor', docId, docScore)); score += docScore; }

    /* 7. 日期与时段：一句话里可以同时有「明天上午」 */
    var dateId = null;
    if (group('today')) dateId = 'd0';
    else if (group('tomorrow')) dateId = 'd1';
    else if (group('dayAfter')) dateId = 'd2';
    if (dateId) { actions.push(act('select_date', dateId, 3)); score += 3; }
    var slotId = null;
    if (group('pm')) slotId = 'pm';
    else if (group('am')) slotId = 'am';
    if (slotId) { actions.push(act('select_slot', slotId, 3)); score += 3; }

    /* 8. 就诊人与付款方式 */
    var patId = null, patScore = 0;
    Object.keys(PAT_ALIAS).forEach(function (id) {
      var m = allLangHit(text, PAT_ALIAS, id);
      if (m && m.length > patScore) { patScore = m.length; patId = id; }
    });
    if (patId) { actions.push(act('select_patient', patId, patScore)); score += patScore; }

    var payId = null, payScore = 0;
    Object.keys(PAY_ALIAS).forEach(function (id) {
      var m = allLangHit(text, PAY_ALIAS, id);
      if (m && m.length > payScore) { payScore = m.length; payId = id; }
    });
    if (payId) { actions.push(act('select_payment', payId, payScore)); score += payScore; }

    /* 9. 提交（高危：只是把确认窗叫出来，仍要本人点或本人说确认） */
    var hitSubmit = group('submit') || (group('finish') && st.step === 4 ? '确认' : '');
    if (hitSubmit) {
      actions.push({ kind: 'cap', id: 'submit_booking', params: {}, steps: STEP_GUARD.submit_booking, score: 5 });
      score += 5;
    }
    if (group('finish') && st.step === 5) { actions.push(nav('home', 4)); score += 4; }

    /* 10. 对话层：命令一个都没命中时，才轮到「说话」。
          话术全部来自本地语料库（XiaoYuErCorpus，data/corpus.json 编译而来）：
          三语、按当前步骤回答、多条回复轮换不复读。
          「再说一遍」这类不重新编话，直接把上一句原样奉还。 */
    if (!actions.length && chatHit) {
      if (chatHit.id === 'repeat' && lastReply) {
        return { intent: 'chat', actions: [], reply: lastReply, score: 3, chat: chatHit };
      }
      return {
        intent: chatHit.kind === 'guide' ? 'guide' : 'chat',
        actions: [], reply: chatHit.reply, score: 3, chat: chatHit
      };
    }
    if (!actions.length) return { intent: 'unknown', actions: [], score: 0 };
    return { intent: 'act', actions: actions, score: score };
  }

  /* ---------------- 执行：只走能力清单与导航白名单 ---------------- */
  function nameOf(kind, id) {
    var list = (X.options()[kind] || []);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return '';
  }
  function missingText() {
    var st = X.getState();
    if (!st.symptom) return T('dialog.needSymptom');
    if (!st.doctor) return T('dialog.needDoctor');
    if (!st.date) return T('dialog.needDate');
    if (!st.slot) return T('dialog.needSlot');
    if (!st.pay) return T('dialog.needPay');
    return '';
  }
  function replyOf(a, after) {
    switch (a.id) {
      case 'select_symptom': return T('ai.didSymptom', { symptom: nameOf('symptoms', a.params.value), dept: after.deptName });
      case 'select_department': return T('ai.didDept', { dept: after.deptName });
      case 'select_doctor': return T('ai.didDoctor', { doctor: after.doctorName });
      case 'select_date': return T('ai.didDate', { date: nameOf('dates', a.params.value) });
      case 'select_slot': return T('ai.didSlot', { slot: nameOf('slots', a.params.value) });
      case 'select_patient': return T('ai.didPatient', { patient: nameOf('patients', a.params.value) });
      case 'select_payment': return T('ai.didPay', { pay: nameOf('pays', a.params.value) });
      case 'submit_booking': return T('ai.confirmed', { no: after.ticketNo });
      default: return '';
    }
  }

  function runActions(actions) {
    var lines = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a.kind === 'closeConfirm') { X.nav('closeModal'); lines.push(T('ai.cancelBooking')); continue; }
      if (a.nav === 'noop') { lines.push(T('ai.didStart')); continue; }
      if (a.kind === 'nav') {
        if (NAV_WHITE.indexOf(a.nav) < 0 || !X.nav(a.nav)) { lines.push(T('ai.wrongStep')); break; }
        continue;
      }
      var st = X.getState();
      if (a.steps && a.steps.indexOf(st.step) < 0) { lines.push(T('ai.wrongStep')); break; }
      var r = X.call(a.id, a.params || {});
      if (!r.ok) {
        if (r.reason === 'slot_full') lines.push(T('ai.slotFull'));
        else if (r.reason === 'incomplete') lines.push(T('ai.incomplete', { what: missingText() }));
        else if (r.reason === 'need_confirm') { X.nav('confirm'); lines.push(T('ai.needConfirm')); }
        else lines.push(T('ai.guard'));
        break;
      }
      var line = replyOf(a, r.state || X.getState());
      if (line) lines.push(line);
    }
    return lines;
  }

  /* ---------------- 界面：悬浮按钮 + 对话面板 ---------------- */
  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="ai" id="ai-panel" hidden>' +
      '<div class="ai__mask" data-ai-close="1"></div>' +
      '<div class="ai__box" role="dialog" aria-modal="true" aria-labelledby="ai-title">' +
        '<div class="ai__head">' +
          '<span class="ai__mark" aria-hidden="true">鱼</span>' +
          '<div class="ai__headtext">' +
            '<h2 class="ai__title" id="ai-title"></h2>' +
            '<p class="ai__status" id="ai-status"></p>' +
          '</div>' +
          '<button type="button" class="ai__x" id="ai-close"></button>' +
        '</div>' +
        '<div class="ai__log" id="ai-log" role="log" aria-live="polite"></div>' +
        '<div class="ai__row">' +
          '<button type="button" class="ai__mic" id="ai-mic" data-state="off">' +
            '<span class="ai__ring" aria-hidden="true"></span>' +
            '<span id="ai-mic-label"></span>' +
          '</button>' +
          '<button type="button" class="ai__cancel" id="ai-cancel" hidden></button>' +
        '</div>' +
        '<p class="ai__micstate" id="ai-mic-state" aria-live="polite"></p>' +
        '<div class="ai__howto" id="ai-mic-howto" hidden>' +
          '<p class="ai__howto-title" id="ai-mic-howto-title"></p>' +
          '<p class="ai__howto-step" id="ai-mic-step1"></p>' +
          '<p class="ai__howto-step" id="ai-mic-step2"></p>' +
          '<p class="ai__howto-step" id="ai-mic-step3"></p>' +
          '<button type="button" class="ai__howtobtn" id="ai-mic-retry"></button>' +
        '</div>' +
        '<div class="ai__offline" id="ai-offline-box" hidden>' +
          '<button type="button" class="ai__offlinebtn" id="ai-offline"></button>' +
          '<p class="ai__offlinenote" id="ai-offline-note"></p>' +
        '</div>' +
        '<p class="ai__chiplabel" id="ai-chiplabel"></p>' +
        '<div class="ai__chips" id="ai-chips"></div>' +
      '</div>' +
    '</div>' +
    '<button type="button" class="aifab" id="aifab" aria-haspopup="dialog">' +
      '<span class="aifab__mark" aria-hidden="true">鱼</span>' +
      '<span class="aifab__text" id="aifab-text"></span>' +
    '</button>';
  document.body.appendChild(wrap);

  var panel = document.getElementById('ai-panel');
  var logBox = document.getElementById('ai-log');
  var mic = document.getElementById('ai-mic');
  var micLabel = document.getElementById('ai-mic-label');
  var cancelBtn = document.getElementById('ai-cancel');
  var statusEl = document.getElementById('ai-status');
  var chipsBox = document.getElementById('ai-chips');
  var fab = document.getElementById('aifab');
  var offBox = document.getElementById('ai-offline-box');
  var offBtn = document.getElementById('ai-offline');
  var offNote = document.getElementById('ai-offline-note');
  var micStateEl = document.getElementById('ai-mic-state');
  var howtoBox = document.getElementById('ai-mic-howto');
  var micRetryBtn = document.getElementById('ai-mic-retry');

  function bubble(who, text) {
    if (!text) return;
    var b = document.createElement('div');
    b.className = 'ai__bubble ai__bubble--' + who;
    b.textContent = text;
    logBox.appendChild(b);
    try { logBox.scrollTop = logBox.scrollHeight; } catch (e) { /* 忽略 */ }
  }
  function setStatus(text) { statusEl.textContent = text || ''; }

  /* ---------- 麦克风权限：状态可见 + 可自助恢复 ----------
     老人最怕两件事：点了没反应、失败了不知道该干什么。
     所以权限状态常显一行，失败时展开"三步指引"并保留"再试一次"。
     注意顺序：永远先按老人的点击真实试一次，拿真实错误码再说话——
     权限查询 API 有的浏览器不准（策略禁用时也答 prompt），不能拿它拦人。 */
  var micStateNow = 'unknown';
  function micStateText(s) {
    if (s === 'granted') return T('ai.micStateGranted');
    if (s === 'denied') return T('ai.micStateDenied');
    if (s === 'prompt') return T('ai.micStatePrompt');
    return T('ai.micStateUnknown');
  }
  function renderMicState(s) {
    if (s) micStateNow = s;
    if (!micStateEl) return;
    micStateEl.textContent = T('ai.micStateLabel') + micStateText(micStateNow);
    micStateEl.setAttribute('data-state', micStateNow);
  }
  function refreshMicState() {
    var OS = offline();
    if (!OS || !OS.micState) { renderMicState('unknown'); return; }
    Promise.resolve(OS.micState()).then(renderMicState).catch(function () { renderMicState('unknown'); });
  }
  /* 失败时把"怎么打开"摆出来；step 参数让"被拦住"类失败自动展开 */
  function showHowTo(show) {
    if (!howtoBox) return;
    howtoBox.hidden = !show;
    if (show) {
      document.getElementById('ai-mic-howto-title').textContent = T('ai.micHowTo');
      document.getElementById('ai-mic-step1').textContent = T('ai.micStep1');
      document.getElementById('ai-mic-step2').textContent = T('ai.micStep2');
      document.getElementById('ai-mic-step3').textContent = T('ai.micStep3');
      micRetryBtn.textContent = T('ai.micRetry');
    }
  }
  /* 按错误码说人话：每种原因一句话，且都保留"点下面的话"这条退路 */
  function sayMicFail(code) {
    if (code === 'denied') { say('ai.micDenied'); }
    else if (code === 'no-device') { say('ai.micNoDevice'); }
    else if (code === 'busy') { say('ai.micBusy'); }
    else if (code === 'insecure') { say('ai.micInsecure'); }
    else { say('ai.startFail'); }
  }

  /* 常说的话：既是降级方案，也是给老人看的示例 */
  function chipList() {
    var st = X.getState(), opt = X.options(), list = [];
    if (st.step === 0) list.push(T('chip.start'));
    if (st.step === 1) opt.symptoms.slice(0, 5).forEach(function (s) { list.push(T('chip.symptom', { name: s.name })); });
    if (st.step === 2) { list.push(T('chip.firstDoctor'), T('chip.secondDoctor'), T('chip.chief')); }
    if (st.step === 3) { list.push(T('chip.today'), T('chip.tomorrow'), T('chip.am'), T('chip.pm')); }
    if (st.step === 4) { opt.pays.forEach(function (p) { list.push(T('chip.pay', { name: p.name })); }); list.push(T('chip.confirm')); }
    if (st.step === 5) { list.push(T('chip.again'), T('chip.done')); }
    list.push(T('chip.read'));
    if (st.step > 0 && st.step < 5) list.push(T('chip.prev'));
    if (st.step > 0 && st.step < 4) list.push(T('chip.next'));
    return list;
  }

  function renderChips() {
    chipsBox.innerHTML = '';
    chipList().forEach(function (text) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = text;
      b.addEventListener('click', function () { hear(text); });
      chipsBox.appendChild(b);
    });
  }

  function renderTexts() {
    document.getElementById('ai-title').textContent = T('ai.title');
    document.getElementById('ai-chiplabel').textContent = T('ai.chips');
    document.getElementById('aifab-text').textContent = T('ai.fab');
    /* 窄屏只显示圆形鱼标（见 ai.css），文字藏起来后靠 aria-label 供读屏识别 */
    fab.setAttribute('aria-label', T('ai.fab'));
    document.getElementById('ai-close').textContent = T('ai.close');
    cancelBtn.textContent = T('ai.stopListen');
    if (listening) { micLabel.textContent = T('ai.stopListen'); }
    else { micLabel.textContent = T('ai.talk'); }
    /* 麦克风按钮任何时候都不藏起来：老人找不到按钮 = 等于没有这个功能。
       本机识别用不了时，它会引导到「用离线识别」或下面的话。 */
    mic.disabled = false;
    mic.removeAttribute('aria-disabled');
    renderMicState();
    refreshMicState();
    renderOffline();
  }

  /* 「用离线识别」入口：本机识别还能装、或还没装好时出现。
     云端识别失败会把它强制摆出来（offlineHint）—— 这正是老人最需要的那一步。 */
  var offlineHint = false;
  function renderOffline() {
    if (!offBox) return;
    var OS = offline();
    var can = !!(OS && OS.supported());
    var st = OS ? String(OS.state()) : '';
    /* 已经装好就收起引导 —— 麦克风直接能用，不必再占地方 */
    var show = can && st !== 'ready' && !(OS && OS.ready());
    offBox.hidden = !show;
    if (!show) return;
    offBox.setAttribute('data-state', st === 'loading' ? 'loading' : 'idle');
    if (st === 'loading') {
      offBtn.textContent = T('ai.offlineLoading');
      offBtn.disabled = true;
    } else {
      offBtn.textContent = T('ai.offlineBtn');
      offBtn.disabled = false;
    }
    offNote.textContent = T('ai.offlineNote');
  }

  /* 之前装过离线识别的话，这次打开就不用再下载了：
     静默从本机缓存把它装配起来，老人第二次来点麦克风就直接能听。 */
  var cacheProbed = false;
  function autoLoadOffline() {
    var OS = offline();
    if (!OS || !OS.supported() || OS.ready() || OS.state() === 'loading' || cacheProbed) {
      return Promise.resolve(false);
    }
    cacheProbed = true;
    return Promise.resolve(OS.cached()).then(function (hit) {
      if (!hit || OS.ready()) return false;
      setStatus(T('ai.offlinePreparing'));
      renderOffline();
      return OS.prepare(function (pct) { setStatus(T('ai.offlineDown', { pct: pct })); }).then(function () {
        offlineHint = false;
        say('ai.offlineOk');
        micLabel.textContent = T('ai.talk');
        return true;
      });
    }).catch(function () { return false; /* 没装过 / 探测失败：等老人自己点「用离线识别」 */ })
      .then(function (r) { renderOffline(); return r; });
  }

  var greeted = false;
  /* autostart：点悬浮按钮就直接开始听 —— 老人的预期是"点一下就开始说"，
     而不是"点一下、再点一下、再说"。 */
  function open(autostart) {
    panel.hidden = false;
    document.body.classList.add('ai-open');
    renderTexts();
    renderChips();
    if (!greeted) {
      greeted = true;
      bubble('ai', T('ai.hello'));
      X.speak(T('ai.hello'));
    }
    setStatus(T('ai.sub'));
    if (autostart) {
      /* 这台设备要是装过离线识别，先把它从本机缓存装配好再开始听 ——
         不然老人会碰上"第一次点了没反应、第二次才行"，那正是最劝退的体验。 */
      autoLoadOffline().then(function () { startListen(); });
    } else {
      autoLoadOffline();
      try { mic.focus(); } catch (e) { /* 忽略 */ }
    }
  }
  function close() {
    stopListen();
    panel.hidden = true;
    document.body.classList.remove('ai-open');
  }
  function toggle() { if (panel.hidden) open(true); else close(); }

  fab.addEventListener('click', function () { open(true); });
  var inlineOpen = document.getElementById('ai-inline-open');
  if (inlineOpen) inlineOpen.addEventListener('click', function () { open(true); });
  document.getElementById('ai-close').addEventListener('click', close);
  panel.addEventListener('click', function (ev) {
    var el = ev.target;
    if (el && el.getAttribute && el.getAttribute('data-ai-close')) close();
  });
  panel.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { close(); return; }
    if (ev.key !== 'Tab') return;
    var items = panel.querySelectorAll('button:not([disabled])');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });

  /* ---------------- 语音识别（两条链路，谁可用用谁） ----------------
     ① 离线引擎 window.XiaoYuErSpeech：模型装在浏览器里，断网也能听，
        声音不出设备。装过一次就一直在。
     ② 浏览器自带 SpeechRecognition：把音频送到云端识别，国内网络
        基本连不上，所以它只是「备用」。
     两条都不可用 → 说清楚为什么，并把注意力引到「常说的话」点选上。

     老人的体验底线：点了必须有回应。所以每个出口都会给一句明确的话，
     并且有一个「迟迟没结果」的上限计时，绝不让页面静默地杵在那里。
     listening: false | 'cloud' | 'offline' */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var SPEECH_LANG = { zh: 'zh-CN', 'zh-Hant': 'zh-TW', en: 'en-US' };
  var rec = null, listening = false, lastEngine = 'rule', planner = null;
  /* 助手上一句说的话：「再说一遍」时原样奉还，也方便自检核对 */
  var lastReply = '';
  var watchdog = null, offlineRun = 0;

  function offline() { return window.XiaoYuErSpeech || null; }

  function micIdle() {
    if (mic) mic.setAttribute('data-state', 'off');
    if (cancelBtn) cancelBtn.hidden = true;
    if (micLabel) micLabel.textContent = T('ai.talk');
    /* 每次停下来都重新读一次权限：老人可能刚在浏览器里改过设置 */
    refreshMicState();
  }
  function focusChip() {
    var c = chipsBox.querySelector('.chip');
    if (c) { try { c.focus(); } catch (e) { /* 忽略 */ } }
  }
  function clearWatchdog() { if (watchdog) { clearTimeout(watchdog); watchdog = null; } }
  /* 兜底计时：开始听之后一直没结果，就明确告诉老人，而不是干等 */
  function armWatchdog(ms) {
    clearWatchdog();
    watchdog = setTimeout(function () {
      watchdog = null;
      if (!listening) return;
      var was = listening;
      stopListen();
      setStatus(T('ai.silent'));
      bubble('ai', T('ai.silent'));
      if (was === 'cloud') { offlineHint = true; renderOffline(); }
      focusChip();
    }, ms);
  }
  function say(key) { setStatus(T(key)); bubble('ai', T(key)); }

  function ensureRec() {
    if (rec || !SR) return rec;
    rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onstart = function () { armWatchdog(15000); refreshMicState(); };
    rec.onresult = function (ev) {
      var finals = [], interims = [];
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        for (var j = 0; j < r.length; j++) {
          if (r.isFinal) finals.push(r[j].transcript);
          else interims.push(r[j].transcript);
        }
      }
      if (interims.length) { clearWatchdog(); setStatus(T('ai.hear') + interims[0]); }
      if (!finals.length) return;
      /* 识别引擎给的多个候选里，挑「最说得通」的那个再执行 */
      var best = null;
      finals.forEach(function (txt) {
        var u = understand(txt);
        if (!u.actions.length && u.intent !== 'ask' && u.intent !== 'status') return;
        if (!best || u.score > best.u.score) best = { txt: txt, u: u };
      });
      var chosen = best ? best.txt : finals[0];
      stopListen();
      hear(chosen, best ? best.u : null);
    };
    rec.onerror = function (ev) {
      var code = ev && ev.error;
      /* 权限被拦：和离线链路用同一套话术 + 指引，两条路给老人的答案必须一致 */
      var denied = code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture';
      var key = denied ? 'ai.micDenied'
        : code === 'no-speech' ? 'ai.noSpeech'
        : code === 'network' ? 'ai.netErr' : '';
      listening = false;
      clearWatchdog();
      micIdle();
      /* 麦克风被拦住时，把状态行与恢复指引一并摆出来（并刷新一次真实状态） */
      if (denied) {
        refreshMicState();
        showHowTo(true);
      }
      /* 云端这条路走不通时，把「用离线识别」摆到老人眼前 */
      if (code === 'network' || code === 'not-allowed' || code === 'service-not-allowed' ||
          code === 'audio-capture') { offlineHint = true; renderOffline(); }
      if (key) { say(key); focusChip(); }
    };
    rec.onend = function () {
      if (!listening) return;
      clearWatchdog();
      var quiet = !statusEl.textContent || statusEl.textContent.indexOf(T('ai.hear')) === 0;
      listening = false;
      micIdle();
      /* 开始听了却什么都没回来：这正是不明所以的"点了没反应"，说清楚 */
      if (quiet) { say('ai.silent'); focusChip(); }
    };
    return rec;
  }

  /* ---------------- 链路②：本机离线识别 ---------------- */
  function startOfflineListen() {
    var OS = offline();
    if (!OS || !OS.ready()) return false;
    X.stopSpeak();
    clearWatchdog();
    var my = ++offlineRun;
    listening = 'offline';
    mic.setAttribute('data-state', 'on');
    cancelBtn.hidden = false;
    micLabel.textContent = T('ai.listening');
    setStatus(T('ai.recording'));
    var lang = X.getState().lang;
    Promise.resolve(OS.listen({
      language: lang === 'en' ? 'en' : 'zh',
      onTick: function (phase) {
        if (my !== offlineRun) return;
        if (phase === 'listening') setStatus(T('ai.recording'));
        else if (phase === 'recognizing') setStatus(T('ai.recognizing'));
      }
    })).then(function (text) {
      if (my !== offlineRun) return;
      listening = false;
      clearWatchdog();
      micIdle();
      if (!text) { say('ai.silent'); focusChip(); return; }
      hear(text);
    }).catch(function (err) {
      if (my !== offlineRun) return;
      listening = false;
      clearWatchdog();
      micIdle();
      /* 麦克风打不开：按真实错误码说清楚是哪回事，并给出恢复指引。
         以前这里只说"请再点一次"——权限被拦住时再点一百次也没用，老人会被困死。 */
      var code = (err && err.code) || 'unknown';
      sayMicFail(code);
      if (code === 'denied') {
        refreshMicState();
        showHowTo(true);
        offlineHint = true;
        renderOffline();
      }
      focusChip();
    });
    armWatchdog(25000);
    return true;
  }

  /* ---------------- 链路①：浏览器自带（云端）识别 ---------------- */
  function startListen() {
    if (listening) return;
    X.stopSpeak();
    var OS = offline();
    /* 离线引擎已就绪 → 优先用它：不联网也能听，声音也不送出去 */
    if (OS && OS.ready()) { startOfflineListen(); return; }
    if (!SR) {
      var canInstall = !!(OS && OS.supported());
      say(canInstall ? 'ai.noEngine' : 'ai.unsupported');
      offlineHint = canInstall;
      renderOffline();
      focusChip();
      return;
    }
    var r = ensureRec();
    if (!r) return;
    rec.lang = SPEECH_LANG[X.getState().lang] || 'zh-CN';
    listening = 'cloud';
    mic.setAttribute('data-state', 'on');
    cancelBtn.hidden = false;
    micLabel.textContent = T('ai.listening');
    setStatus(T('ai.listening'));
    try {
      r.start();
    } catch (e) {
      /* 有的浏览器 start() 会直接抛：不能装作没事 */
      listening = false;
      clearWatchdog();
      micIdle();
      say('ai.startFail');
      offlineHint = true;
      renderOffline();
      focusChip();
      return;
    }
    armWatchdog(12000);
  }

  function stopListen() {
    var was = listening;
    listening = false;
    offlineRun++;                 // 让正在等待的那次离线识别结果失效
    clearWatchdog();
    micIdle();
    /* 主动停下就走回待办提示，别让"正在听您说…"挂在那里骗人 */
    if (was) setStatus(T('ai.sub'));
    if (was === 'offline') {
      var OS = offline();
      if (OS) { try { OS.stop(); } catch (e) { /* 忽略 */ } }
    } else if (was) {
      try { if (rec) rec.abort(); } catch (e2) { /* 忽略 */ }
    }
  }

  /* ---------------- 「用离线识别」：下载并装配 ---------------- */
  function prepareOffline() {
    var OS = offline();
    if (!OS || !OS.supported()) return Promise.reject(new Error('不支持'));
    if (OS.ready()) return Promise.resolve(true);
    offBtn.disabled = true;
    offBtn.textContent = T('ai.offlineLoading');
    setStatus(T('ai.offlineDown', { pct: 0 }));
    bubble('ai', T('ai.offlineNote'));
    return Promise.resolve(OS.prepare(function (pct) {
      setStatus(T('ai.offlineDown', { pct: pct }));
      offBtn.textContent = T('ai.offlineLoading') + ' ' + pct + '%';
    })).then(function () {
      offlineHint = false;
      say('ai.offlineOk');
      X.speak(T('ai.offlineOk'));
      renderTexts();
      startOfflineListen();
      return true;
    }).catch(function (err) {
      say('ai.offlineFail');
      focusChip();
      offBtn.disabled = false;
      offBtn.textContent = T('ai.offlineBtn');
      throw err;
    });
  }

  if (offBtn) offBtn.addEventListener('click', function () {
    /* 云端还在听的时候点「用离线识别」也要有反应：先停掉，再装 */
    if (listening) stopListen();
    prepareOffline().catch(function () { /* 已提示过，不抛到控制台 */ });
  });

  /* 「再试一次麦克风」：看完指引回来点一下。
     有些浏览器（Chrome/Edge）在用户手动改过设置后，重新调 getUserMedia 就能直接拿到权限，
     所以这个按钮是真的去试，不是摆设。 */
  if (micRetryBtn) micRetryBtn.addEventListener('click', function () {
    showHowTo(false);
    if (listening) stopListen();
    refreshMicState();
    startListen();
  });

  mic.addEventListener('click', function () { if (listening) stopListen(); else startListen(); });
  cancelBtn.addEventListener('click', stopListen);

  /* ---------------- 一句话进来 → 执行 → 回话 ---------------- */
  function setPlanner(fn) { planner = typeof fn === 'function' ? fn : null; }

  function normalizePlannerActions(list) {
    var capIds = X.capabilities.map(function (c) { return c.id; });
    var out = [];
    (list || []).forEach(function (a) {
      if (!a) return;
      if (a.nav && NAV_WHITE.indexOf(a.nav) >= 0) { out.push({ kind: 'nav', nav: a.nav, score: 9 }); return; }
      if (a.id && capIds.indexOf(a.id) >= 0) {
        out.push({ kind: 'cap', id: a.id, params: a.params || {}, steps: STEP_GUARD[a.id], score: 9 });
      }
    });
    return out;
  }

  function resolve(text) {
    if (planner) {
      try {
        var out = planner(text, { state: X.getState(), options: X.options(), capabilities: X.capabilities });
        return Promise.resolve(out).then(function (o) {
          var acts = normalizePlannerActions(o && o.actions);
          if (acts.length) { lastEngine = 'llm'; return { intent: 'act', actions: acts, reply: (o && o.reply) || '', score: 99 }; }
          lastEngine = 'rule';
          return understand(text);
        }).catch(function () { lastEngine = 'rule'; return understand(text); });
      } catch (e) { /* 大模型出错 → 规则引擎接管 */ }
    }
    lastEngine = 'rule';
    return Promise.resolve(understand(text));
  }

  function hear(text, known) {
    return (known ? Promise.resolve(known) : resolve(text)).then(function (u) {
      bubble('me', text);
      if (!u || u.intent === 'empty') { bubble('ai', T('ai.noSpeech')); return u; }
      /* 一两个字的"识别结果"基本是环境音被听成了「好」「嗯」这种。
         这不是老人说的话，既不该拿去执行，也不该回"没听明白"——
         那会让老人以为自己说错了。直接按"没听到"请他再说一次。 */
      var bare = String(text || '').replace(/[\s，。、！？,.!?]/g, '');
      if (u.intent === 'unknown' && bare.length <= 2) {
        bubble('ai', T('ai.silent'));
        setStatus(T('ai.silent'));
        renderChips();
        return u;
      }
      var lines = runActions(u.actions || []);
      if (u.reply && !lines.length) lines.push(u.reply);
      var reply = lines.filter(Boolean).join('。');
      if (!reply && u.intent === 'unknown') reply = T('ai.unknown');
      if (reply) {
        bubble('ai', reply);
        lastReply = reply;
        /* 念一遍 / 上一步 / 帮助 这些动作页面自己会播报，别把它的声音盖掉 */
        if (!SILENT[u.intent]) X.speak(reply);
      }
      setStatus(T('ai.sub'));
      renderChips();
      return u;
    });
  }
  var SILENT = { read: 1, stop: 1, help: 1, next: 1, prev: 1, restart: 1, finish: 1, confirm_no: 1 };

  /* ---------------- 跟随界面语言与步骤 ---------------- */
  X.onRender(function () {
    renderTexts();
    if (!panel.hidden) renderChips();
  });

  renderTexts();
  renderChips();
  X.setLanguage(X.getState().lang); // 触发一次重绘，把助手注册进来的文案刷到页面上

  window.XiaoYuErAI = {
    version: '1.3.0',
    supported: !!SR,
    open: open,
    close: close,
    toggle: toggle,
    startListen: startListen,
    stopListen: stopListen,
    isListening: function () { return !!listening; },
    /* 两条识别链路的状态，供界面提示与自检使用 */
    engine: function () { return lastEngine; },
    listenPath: function () { return listening || 'idle'; },
    /* 麦克风权限状态（granted / denied / prompt / unknown），供自检与界面显示 */
    micState: function () { return micStateNow; },
    showHowTo: showHowTo,
    /* 本地对话语料库的状态与规模，供界面与自检使用 */
    corpus: {
      loaded: function () { return !!(window.XiaoYuErCorpus && window.XiaoYuErCorpus.match); },
      stats: function () {
        var c = window.XiaoYuErCorpus;
        return (c && typeof c.stats === 'function') ? c.stats() : null;
      }
    },
    offline: {
      loaded: function () { return !!offline(); },
      supported: function () { var OS = offline(); return !!(OS && OS.supported()); },
      ready: function () { var OS = offline(); return !!(OS && OS.ready()); },
      prepare: prepareOffline
    },
    /* 把一句话当成「听到的话」灌进来：自检与后续接大模型都走这里 */
    say: hear,
    understand: understand,
    chipList: chipList,
    setPlanner: setPlanner
  };
})();
