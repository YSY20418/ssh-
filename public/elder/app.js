/* ============================================================
   小鱼兒 · 预约挂号（适老版）交互逻辑
   - 全程点选，没有任何键盘输入
   - 每一步只做一件事
   - 三语（简体 / 繁體 / English）文案与语音同步切换
   - 字体整体缩放，记住老人的选择
   - 对外声明「能力清单」，后续可由智能体代驾执行
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 语言 ---------------- */
  var LANGS = ['zh', 'zh-Hant', 'en'];
  var SPEECH_LANG = { zh: 'zh-CN', 'zh-Hant': 'zh-TW', en: 'en-US' };
  var HTML_LANG = { zh: 'zh-CN', 'zh-Hant': 'zh-TW', en: 'en' };

  var I18N = {
    zh: {
      'doc.title': '小鱼兒 · 预约挂号',
      'a11y.skip': '跳到主要内容',
      'topbar.font': '调整字体大小',
      'topbar.fontReset': '标准',
      'topbar.langGroup': '选择语言',
      'lang.zh': '简体',
      'lang.hant': '繁體',
      'lang.en': '英文',
      'voice.listen': '听语音提示',
      'voice.stop': '停止朗读',
      'voice.unsupported': '这台设备暂时不能朗读，请让家人念给您听。',
      'stepbar.0': '开始', 'stepbar.1': '选症状', 'stepbar.2': '选医生',
      'stepbar.3': '选时间', 'stepbar.4': '核对付款', 'stepbar.5': '预约成功',

      'step0.notice': '这里是给 65 岁以上老人准备的挂号服务。全程只用手指点，不用打字。',
      'step0.title': '您好，我是小鱼兒',
      'step0.lead': '您只要一步一步点，就能把号挂好。不急，慢慢来。',
      'step0.cta': '我要预约挂号',
      'step0.ctaDesc': '点一下，开始挂号',
      'ability.title': '这一页会替您做什么',
      'ability.1': '听懂您的话：您说哪儿不舒服，我来判断该挂哪个科。',
      'ability.2': '替您一步步办：挂号要点的每一步都由我点，您看着就行。',
      'ability.3': '替您把好关：提交、付款这类要紧事，一定要您本人点头。',
      'ability.4': '把结果讲给您听：每一步都能念出来，听不清可以再念一遍。',

      'step1.title': '第 1 步 · 您哪里不舒服？',
      'step1.lead': '请点一个最像您现在感觉的选项。',
      'step1.group': '哪里不舒服',
      'step1.recommendLabel': '我帮您推荐这个科室',
      'step1.recommend': '您选了「{symptom}」，建议挂 {dept}。',
      'step1.changeDept': '我想换个科室',
      'step1.pickedDept': '已改挂 {dept}。',
      'step1.altsLabel': '也可以选：',

      'step2.title': '第 2 步 · 选一位医生',
      'step2.lead': '科室：{dept}。点一位医生，看看他的照片和擅长。',

      'step3.title': '第 3 步 · 选就诊时间',
      'step3.lead': '日期和上午下午都要选，两个都点了才能下一步。',
      'step3.dateTitle': '选哪一天',
      'step3.slotTitle': '选上午还是下午',
      'step3.fullHint': '灰色表示这个时间已经约满了，请点别的时间。',

      'step4.title': '第 4 步 · 核对信息，选怎么付钱',
      'step4.lead': '请看清下面的信息，再点一种付款方式。',
      'step4.patientTitle': '谁去看病',
      'brand.hospital': '示范市人民医院',
      'brand.hospitalSub': '门诊预约 · 为 65 岁以上长者服务',
      'aside.title': '您已经选好的',
      'aside.empty': '还没选。跟着上面的步骤，一步一步来就行。',
      'aside.symptom': '不舒服',
      'aside.dept': '科室',
      'aside.doctor': '医生',
      'aside.time': '时间',
      'aside.pay': '付款',
      'aside.now': '第 {n} 步 / 共 5 步',
      'step4.summaryTitle': '预约信息',
      'step4.payTitle': '怎么付挂号费',

      'step5.title': '预约成功啦',
      'step5.lead': '已经帮您挂好了。下面这张单子请记好，也可以让家人拍个照。',
      'step5.tipsLabel': '来医院那天请记住三件事',
      'step5.tip1': '带上身份证（或医保卡），进门要刷。',
      'step5.tip2': '比预约时间提前 15 分钟到医院，不要迟到。',
      'step5.tip3': '先去一楼分诊台报名字，护士会告诉您去哪间诊室。',
      'step5.protectTitle': '到院那天的小提醒',
      'step5.protect1': '戴好口罩',
      'step5.protect2': '带齐平时要吃的药',
      'step5.protect3': '摸了门把手要洗手',
      'step5.protect4': '人多的地方少停留',
      'step5.again': '再挂一个号',
      'step5.finish': '好了，我知道了',

      'nav.prev': '上一步', 'nav.help': '需要帮助', 'nav.next': '下一步', 'nav.nextSubmit': '确认预约',

      'summary.dept': '科室', 'summary.doctor': '医生', 'summary.time': '就诊时间',
      'summary.patient': '就诊人', 'summary.pay': '付款方式', 'summary.fee': '挂号费',
      'ticket.no': '取号', 'ticket.place': '就诊地点',

      'slot.am': '上午', 'slot.amTime': '8:00 — 12:00',
      'slot.pm': '下午', 'slot.pmTime': '14:00 — 17:30',
      'slot.left': '还剩 {n} 个号', 'slot.full': '已约满',

      'date.today': '今天', 'date.tomorrow': '明天', 'date.dayAfter': '后天',
      'date.fmt': '{label} · {md} · 周{week}',
      'date.fmtEn': '{label} · {md}',

      'patient.self': '本人', 'patient.spouse': '老伴', 'patient.family': '家人陪同',
      'patient.age': '{age} 岁', 'patient.idCard': '身份证', 'patient.phone': '手机号',

      'pay.medical': '医保卡', 'pay.medicalDesc': '先刷医保卡报销，剩下的钱再付。',
      'pay.wechat': '微信', 'pay.wechatDesc': '用手机扫二维码付，可以请家人帮忙。',
      'pay.alipay': '支付宝', 'pay.alipayDesc': '用手机扫二维码付，可以请家人帮忙。',
      'pay.hospital': '到医院再付', 'pay.hospitalDesc': '先看病，看完在收费窗口付钱。',

      'dialog.needTitle': '还差一点点',
      'dialog.needSymptom': '请先点一个「哪里不舒服」。',
      'dialog.needDoctor': '请先点一位医生。',
      'dialog.needDate': '请先点一个日期。',
      'dialog.needSlot': '请先点「上午」或「下午」。',
      'dialog.needPay': '请先点一种付款方式。',
      'dialog.slotFull': '这个时间已经约满了，请换一个。',
      'dialog.ok': '我知道了',

      'dialog.confirmTitle': '请再看一眼，确认后就不能改了',
      'dialog.confirmBody': '挂 {dept} · {doctor} · {time}，就诊人 {patient}，{pay}。',
      'dialog.confirmYes': '确认预约',
      'dialog.confirmNo': '再看看',

      'dialog.helpTitle': '需要帮助？可以这样',
      'dialog.help1': '叫家里人过来帮您点一下。',
      'dialog.help2': '到医院一楼服务台，穿制服的工作人员会帮您挂号。',
      'dialog.help3': '让护士站帮您打电话给家人。',
      'dialog.helpSpeak': '再把这段话念一遍',
      'dialog.close': '关闭',

      'foot.agent': '本页每一步都声明为标准能力，点右下角「小鱼兒」，对它说一句话就能替您办。',
      'idle.text': '您停了一会儿，需要帮忙吗？',
      'idle.close': '我在看',
    },

    'zh-Hant': {
      'doc.title': '小鱼兒 · 預約掛號',
      'a11y.skip': '跳到主要內容',
      'topbar.font': '調整字體大小',
      'topbar.fontReset': '標準',
      'topbar.langGroup': '選擇語言',
      'lang.zh': '簡體',
      'lang.hant': '繁體',
      'lang.en': '英文',
      'voice.listen': '聽語音提示',
      'voice.stop': '停止朗讀',
      'voice.unsupported': '這台設備暫時不能朗讀，請讓家人念給您聽。',
      'stepbar.0': '開始', 'stepbar.1': '選症狀', 'stepbar.2': '選醫生',
      'stepbar.3': '選時間', 'stepbar.4': '核對付款', 'stepbar.5': '預約成功',

      'step0.notice': '這裡是給 65 歲以上長者準備的掛號服務。全程只用手指點，不用打字。',
      'step0.title': '您好，我是小鱼兒',
      'step0.lead': '您只要一步一步點，就能把號掛好。不急，慢慢來。',
      'step0.cta': '我要預約掛號',
      'step0.ctaDesc': '點一下，開始掛號',
      'ability.title': '這一頁會替您做什麼',
      'ability.1': '聽懂您的話：您說哪兒不舒服，我來判斷該掛哪一科。',
      'ability.2': '替您一步步辦：掛號要點的每一步都由我點，您看著就行。',
      'ability.3': '替您把好關：提交、付款這類要緊事，一定要您本人點頭。',
      'ability.4': '把結果講給您聽：每一步都能唸出來，聽不清可以再唸一遍。',

      'step1.title': '第 1 步 · 您哪裡不舒服？',
      'step1.lead': '請點一個最像您現在感覺的選項。',
      'step1.group': '哪裡不舒服',
      'step1.recommendLabel': '我幫您推薦這個科別',
      'step1.recommend': '您選了「{symptom}」，建議掛 {dept}。',
      'step1.changeDept': '我想換個科別',
      'step1.pickedDept': '已改掛 {dept}。',
      'step1.altsLabel': '也可以選：',

      'step2.title': '第 2 步 · 選一位醫生',
      'step2.lead': '科別：{dept}。點一位醫生，看看他的照片和專長。',

      'step3.title': '第 3 步 · 選就診時間',
      'step3.lead': '日期和上午下午都要選，兩個都點了才能下一步。',
      'step3.dateTitle': '選哪一天',
      'step3.slotTitle': '選上午還是下午',
      'step3.fullHint': '灰色表示這個時間已經約滿了，請點別的時間。',

      'step4.title': '第 4 步 · 核對資料，選怎麼付錢',
      'step4.lead': '請看清下面的資料，再點一種付款方式。',
      'step4.patientTitle': '誰去看病',
      'brand.hospital': '示範市人民醫院',
      'brand.hospitalSub': '門診預約 · 為 65 歲以上長者服務',
      'aside.title': '您已經選好的',
      'aside.empty': '還沒選。跟著上面的步驟，一步一步來就行。',
      'aside.symptom': '不舒服',
      'aside.dept': '科別',
      'aside.doctor': '醫師',
      'aside.time': '時間',
      'aside.pay': '付款',
      'aside.now': '第 {n} 步 / 共 5 步',
      'step4.summaryTitle': '預約資料',
      'step4.payTitle': '怎麼付掛號費',

      'step5.title': '預約成功囉',
      'step5.lead': '已經幫您掛好了。下面這張單子請記好，也可以讓家人拍個照。',
      'step5.tipsLabel': '來醫院那天請記住三件事',
      'step5.tip1': '帶上身分證（或健保卡），進門要刷。',
      'step5.tip2': '比預約時間提前 15 分鐘到醫院，不要遲到。',
      'step5.tip3': '先去一樓分診台報名字，護士會告訴您去哪間診室。',
      'step5.protectTitle': '到院那天的小提醒',
      'step5.protect1': '戴好口罩',
      'step5.protect2': '帶齊平時要吃的藥',
      'step5.protect3': '摸了門把手要洗手',
      'step5.protect4': '人多的地方少停留',
      'step5.again': '再掛一個號',
      'step5.finish': '好了，我知道了',

      'nav.prev': '上一步', 'nav.help': '需要幫助', 'nav.next': '下一步', 'nav.nextSubmit': '確認預約',

      'summary.dept': '科別', 'summary.doctor': '醫生', 'summary.time': '就診時間',
      'summary.patient': '就診人', 'summary.pay': '付款方式', 'summary.fee': '掛號費',
      'ticket.no': '取號', 'ticket.place': '就診地點',

      'slot.am': '上午', 'slot.amTime': '8:00 — 12:00',
      'slot.pm': '下午', 'slot.pmTime': '14:00 — 17:30',
      'slot.left': '還剩 {n} 個號', 'slot.full': '已約滿',

      'date.today': '今天', 'date.tomorrow': '明天', 'date.dayAfter': '後天',
      'date.fmt': '{label} · {md} · 週{week}',
      'date.fmtEn': '{label} · {md}',

      'patient.self': '本人', 'patient.spouse': '老伴', 'patient.family': '家人陪同',
      'patient.age': '{age} 歲', 'patient.idCard': '身分證', 'patient.phone': '手機號',

      'pay.medical': '健保卡', 'pay.medicalDesc': '先刷健保卡補助，剩下的錢再付。',
      'pay.wechat': '微信', 'pay.wechatDesc': '用手機掃條碼付款，可以請家人幫忙。',
      'pay.alipay': '支付寶', 'pay.alipayDesc': '用手機掃條碼付款，可以請家人幫忙。',
      'pay.hospital': '到醫院再付', 'pay.hospitalDesc': '先看診，看完在收費窗口付錢。',

      'dialog.needTitle': '還差一點點',
      'dialog.needSymptom': '請先點一個「哪裡不舒服」。',
      'dialog.needDoctor': '請先點一位醫生。',
      'dialog.needDate': '請先點一個日期。',
      'dialog.needSlot': '請先點「上午」或「下午」。',
      'dialog.needPay': '請先點一種付款方式。',
      'dialog.slotFull': '這個時間已經約滿了，請換一個。',
      'dialog.ok': '我知道了',

      'dialog.confirmTitle': '請再看一眼，確認後就不能改了',
      'dialog.confirmBody': '掛 {dept} · {doctor} · {time}，就診人 {patient}，{pay}。',
      'dialog.confirmYes': '確認預約',
      'dialog.confirmNo': '再看看',

      'dialog.helpTitle': '需要幫助？可以這樣',
      'dialog.help1': '叫家裡人過來幫您點一下。',
      'dialog.help2': '到醫院一樓服務台，穿制服的工作人員會幫您掛號。',
      'dialog.help3': '請護理站幫您打電話給家人。',
      'dialog.helpSpeak': '再把這段話念一遍',
      'dialog.close': '關閉',

      'foot.agent': '本頁每一步都宣告為標準能力，點右下角「小鱼兒」，對它說一句話就能替您辦。',
      'idle.text': '您停了一會兒，需要幫忙嗎？',
      'idle.close': '我在看',
    },

    en: {
      'doc.title': 'Xiao Yu Er · Book an Appointment',
      'a11y.skip': 'Skip to main content',
      'topbar.font': 'Change text size',
      'topbar.fontReset': 'Reset',
      'topbar.langGroup': 'Choose language',
      'lang.zh': 'Simplified',
      'lang.hant': 'Traditional',
      'lang.en': 'English',
      'voice.listen': 'Listen to instructions',
      'voice.stop': 'Stop reading',
      'voice.unsupported': 'This device cannot read aloud. Please ask a family member to read it for you.',
      'stepbar.0': 'Start', 'stepbar.1': 'Symptoms', 'stepbar.2': 'Doctor',
      'stepbar.3': 'Time', 'stepbar.4': 'Confirm & Pay', 'stepbar.5': 'Done',

      'step0.notice': 'This booking service is designed for people aged 65 and over. Tap only — no typing needed.',
      'step0.title': 'Hello, I am Xiao Yu Er',
      'step0.lead': 'Just tap step by step and I will book the appointment for you. Take your time.',
      'step0.cta': 'Book an appointment',
      'step0.ctaDesc': 'Tap here to start',
      'ability.title': 'What this page does for you',
      'ability.1': 'I listen: tell me what troubles you and I pick the right department.',
      'ability.2': 'I do the steps: I tap every step of the booking for you.',
      'ability.3': 'I keep you safe: submitting and paying always need your own nod.',
      'ability.4': 'I read it out: every step can be read aloud, as often as you like.',

      'step1.title': 'Step 1 · What troubles you?',
      'step1.lead': 'Tap the option that best matches how you feel right now.',
      'step1.group': 'What troubles you',
      'step1.recommendLabel': 'I suggest this department',
      'step1.recommend': 'You chose "{symptom}". I suggest {dept}.',
      'step1.changeDept': 'Choose another department',
      'step1.pickedDept': 'Changed to {dept}.',
      'step1.altsLabel': 'You may also choose:',

      'step2.title': 'Step 2 · Choose a doctor',
      'step2.lead': 'Department: {dept}. Tap a doctor to see the photo and specialty.',

      'step3.title': 'Step 3 · Choose a time',
      'step3.lead': 'Please tap both a date and morning or afternoon.',
      'step3.dateTitle': 'Which day',
      'step3.slotTitle': 'Morning or afternoon',
      'step3.fullHint': 'Grey means fully booked. Please pick another time.',

      'step4.title': 'Step 4 · Check details and payment',
      'step4.lead': 'Please check the details below, then tap how you want to pay.',
      'step4.patientTitle': 'Who is the patient',
      'brand.hospital': 'Shifan Municipal People’s Hospital',
      'brand.hospitalSub': 'Outpatient booking · for seniors aged 65 and above',
      'aside.title': 'What you have chosen',
      'aside.empty': 'Nothing yet. Just follow the steps above, one at a time.',
      'aside.symptom': 'Problem',
      'aside.dept': 'Department',
      'aside.doctor': 'Doctor',
      'aside.time': 'Time',
      'aside.pay': 'Payment',
      'aside.now': 'Step {n} of 5',
      'step4.summaryTitle': 'Appointment details',
      'step4.payTitle': 'How to pay the registration fee',

      'step5.title': 'Your appointment is booked',
      'step5.lead': 'Everything is done. Please keep this slip, or ask a family member to take a photo.',
      'step5.tipsLabel': 'Please remember three things on the day',
      'step5.tip1': 'Bring your ID card (or medical insurance card) — it is scanned at the entrance.',
      'step5.tip2': 'Arrive 15 minutes before your appointment time. Do not be late.',
      'step5.tip3': 'Go to the triage desk on the first floor first; the nurse will tell you which room.',
      'step5.protectTitle': 'A few small reminders for the day you come',
      'step5.protect1': 'Wear a face mask',
      'step5.protect2': 'Bring your usual medicines',
      'step5.protect3': 'Wash your hands often',
      'step5.protect4': 'Do not stay in crowds',
      'step5.again': 'Book another one',
      'step5.finish': 'Got it, thank you',

      'nav.prev': 'Back', 'nav.help': 'Help', 'nav.next': 'Next', 'nav.nextSubmit': 'Confirm booking',

      'summary.dept': 'Department', 'summary.doctor': 'Doctor', 'summary.time': 'Time',
      'summary.patient': 'Patient', 'summary.pay': 'Payment', 'summary.fee': 'Fee',
      'ticket.no': 'Queue number', 'ticket.place': 'Location',

      'slot.am': 'Morning', 'slot.amTime': '8:00 a.m. — 12:00 p.m.',
      'slot.pm': 'Afternoon', 'slot.pmTime': '2:00 p.m. — 5:30 p.m.',
      'slot.left': '{n} slots left', 'slot.full': 'Fully booked',

      'date.today': 'Today', 'date.tomorrow': 'Tomorrow', 'date.dayAfter': 'Day after tomorrow',
      'date.fmt': '{label} · {md}',
      'date.fmtEn': '{label} · {md}',

      'patient.self': 'Myself', 'patient.spouse': 'My spouse', 'patient.family': 'With family',
      'patient.age': 'Age {age}', 'patient.idCard': 'ID number', 'patient.phone': 'Phone',

      'pay.medical': 'Medical insurance card', 'pay.medicalDesc': 'The card pays its part first; you pay the rest.',
      'pay.wechat': 'WeChat Pay', 'pay.wechatDesc': 'Scan the code on a phone. Family can help.',
      'pay.alipay': 'Alipay', 'pay.alipayDesc': 'Scan the code on a phone. Family can help.',
      'pay.hospital': 'Pay at hospital', 'pay.hospitalDesc': 'See the doctor first, pay at the counter after.',

      'dialog.needTitle': 'One more step to go',
      'dialog.needSymptom': 'Please tap what troubles you first.',
      'dialog.needDoctor': 'Please tap a doctor first.',
      'dialog.needDate': 'Please tap a date first.',
      'dialog.needSlot': 'Please tap Morning or Afternoon first.',
      'dialog.needPay': 'Please tap a payment method first.',
      'dialog.slotFull': 'This time is fully booked. Please choose another.',
      'dialog.ok': 'I see',

      'dialog.confirmTitle': 'Please check once more — it cannot be changed after this',
      'dialog.confirmBody': '{dept} · {doctor} · {time}, patient {patient}, pay by {pay}.',
      'dialog.confirmYes': 'Confirm booking',
      'dialog.confirmNo': 'Let me check again',

      'dialog.helpTitle': 'Need help? Try this',
      'dialog.help1': 'Ask a family member to tap for you.',
      'dialog.help2': 'Go to the service desk on the first floor; staff in uniform will help you.',
      'dialog.help3': 'Ask the nurse station to call your family for you.',
      'dialog.helpSpeak': 'Read this again',
      'dialog.close': 'Close',

      'foot.agent': 'Every step here is a declared capability. Tap Xiao Yu Er at the corner and just say what you need.',
      'idle.text': 'You have paused for a while. Do you need help?',
      'idle.close': 'I am fine',
    }
  };

  /* 症状 → 科室（ico 为图标名，icon 为图标缺失时的文字兜底） */
  var SYMPTOMS = [
    { id: 'head', icon: '晕', ico: 'head', name: { zh: '头晕头痛', 'zh-Hant': '頭暈頭痛', en: 'Dizziness or headache' }, dept: 'neurology', alts: ['cardiology'] },
    { id: 'chest', icon: '心', ico: 'heart-pulse', name: { zh: '心慌胸闷', 'zh-Hant': '心慌胸悶', en: 'Palpitations or chest tightness' }, dept: 'cardiology', alts: ['respiratory'] },
    { id: 'fever', icon: '咳', ico: 'mask', name: { zh: '咳嗽发烧', 'zh-Hant': '咳嗽發燒', en: 'Cough or fever' }, dept: 'respiratory', alts: ['gp'] },
    { id: 'belly', icon: '肚', ico: 'stomach', name: { zh: '肚子痛', 'zh-Hant': '肚子痛', en: 'Stomach ache' }, dept: 'gastro', alts: ['surgery'] },
    { id: 'leg', icon: '腿', ico: 'bone', name: { zh: '腿疼', 'zh-Hant': '腿疼', en: 'Leg pain' }, dept: 'orthopedics', alts: ['gp'] },
    { id: 'eye', icon: '眼', ico: 'eye', name: { zh: '眼睛不舒服', 'zh-Hant': '眼睛不舒服', en: 'Eye discomfort' }, dept: 'ophthalmology', alts: [] },
    { id: 'unsure', icon: '？', ico: 'plus-circle', name: { zh: '不知道选什么', 'zh-Hant': '不知道選什麼', en: 'Not sure what to choose' }, dept: 'gp', alts: ['neurology'] }
  ];

  var DEPTS = {
    neurology: { ico: 'dna', name: { zh: '神经内科', 'zh-Hant': '神經內科', en: 'Neurology' }, place: { zh: '门诊楼 2 层 · 3 号诊室', 'zh-Hant': '門診樓 2 層 · 3 號診室', en: 'Outpatient Bldg, Floor 2 · Room 3' } },
    cardiology: { ico: 'heart-pulse', name: { zh: '心血管内科', 'zh-Hant': '心血管內科', en: 'Cardiology' }, place: { zh: '门诊楼 3 层 · 5 号诊室', 'zh-Hant': '門診樓 3 層 · 5 號診室', en: 'Outpatient Bldg, Floor 3 · Room 5' } },
    respiratory: { ico: 'mask', name: { zh: '呼吸内科', 'zh-Hant': '呼吸內科', en: 'Respiratory Medicine' }, place: { zh: '门诊楼 2 层 · 8 号诊室', 'zh-Hant': '門診樓 2 層 · 8 號診室', en: 'Outpatient Bldg, Floor 2 · Room 8' } },
    gastro: { ico: 'pill-bottle', name: { zh: '消化内科', 'zh-Hant': '消化內科', en: 'Gastroenterology' }, place: { zh: '门诊楼 4 层 · 2 号诊室', 'zh-Hant': '門診樓 4 層 · 2 號診室', en: 'Outpatient Bldg, Floor 4 · Room 2' } },
    surgery: { ico: 'medkit', name: { zh: '普通外科', 'zh-Hant': '普通外科', en: 'General Surgery' }, place: { zh: '门诊楼 4 层 · 6 号诊室', 'zh-Hant': '門診樓 4 層 · 6 號診室', en: 'Outpatient Bldg, Floor 4 · Room 6' } },
    orthopedics: { ico: 'bone', name: { zh: '骨科', 'zh-Hant': '骨科', en: 'Orthopedics' }, place: { zh: '门诊楼 3 层 · 9 号诊室', 'zh-Hant': '門診樓 3 層 · 9 號診室', en: 'Outpatient Bldg, Floor 3 · Room 9' } },
    ophthalmology: { ico: 'eye', name: { zh: '眼科', 'zh-Hant': '眼科', en: 'Ophthalmology' }, place: { zh: '门诊楼 5 层 · 1 号诊室', 'zh-Hant': '門診樓 5 層 · 1 號診室', en: 'Outpatient Bldg, Floor 5 · Room 1' } },
    gp: { ico: 'plus-circle', name: { zh: '全科医学科', 'zh-Hant': '全科醫學科', en: 'General Practice' }, place: { zh: '门诊楼 1 层 · 导诊台旁 2 号诊室', 'zh-Hant': '門診樓 1 層 · 導診台旁 2 號診室', en: 'Outpatient Bldg, Floor 1 · Room 2, next to triage' } }
  };

  var AVATAR_COLORS = ['#2f5d62', '#3f6b6f', '#4a6f60', '#55697a', '#6a5f4f', '#5d5a70'];

  var DOCTORS = {
    neurology: [
      { id: 'n1', name: { zh: '陈志明', 'zh-Hant': '陳志明', en: 'Chen Zhiming' }, title: { zh: '主任医师', 'zh-Hant': '主任醫師', en: 'Chief Physician' }, good: { zh: '头晕、头痛、脑血管病', 'zh-Hant': '頭暈、頭痛、腦血管病', en: 'Dizziness, headache, stroke' }, fee: 30 },
      { id: 'n2', name: { zh: '李文娟', 'zh-Hant': '李文娟', en: 'Li Wenjuan' }, title: { zh: '副主任医师', 'zh-Hant': '副主任醫師', en: 'Associate Chief' }, good: { zh: '偏头痛、失眠', 'zh-Hant': '偏頭痛、失眠', en: 'Migraine, insomnia' }, fee: 20 },
      { id: 'n3', name: { zh: '王国庆', 'zh-Hant': '王國慶', en: 'Wang Guoqing' }, title: { zh: '主治医师', 'zh-Hant': '主治醫師', en: 'Attending' }, good: { zh: '眩晕、耳鸣', 'zh-Hant': '眩暈、耳鳴', en: 'Vertigo, tinnitus' }, fee: 15 }
    ],
    cardiology: [
      { id: 'c1', name: { zh: '刘国栋', 'zh-Hant': '劉國棟', en: 'Liu Guodong' }, title: { zh: '主任医师', 'zh-Hant': '主任醫師', en: 'Chief Physician' }, good: { zh: '高血压、冠心病', 'zh-Hant': '高血壓、冠心病', en: 'Hypertension, coronary disease' }, fee: 30 },
      { id: 'c2', name: { zh: '赵秀兰', 'zh-Hant': '趙秀蘭', en: 'Zhao Xiulan' }, title: { zh: '副主任医师', 'zh-Hant': '副主任醫師', en: 'Associate Chief' }, good: { zh: '心律失常、心慌', 'zh-Hant': '心律失常、心慌', en: 'Arrhythmia, palpitations' }, fee: 20 },
      { id: 'c3', name: { zh: '孙立新', 'zh-Hant': '孫立新', en: 'Sun Lixin' }, title: { zh: '主治医师', 'zh-Hant': '主治醫師', en: 'Attending' }, good: { zh: '心衰、胸闷', 'zh-Hant': '心衰、胸悶', en: 'Heart failure, chest tightness' }, fee: 15 }
    ],
    respiratory: [
      { id: 'r1', name: { zh: '周慧敏', 'zh-Hant': '周慧敏', en: 'Zhou Huimin' }, title: { zh: '主任医师', 'zh-Hant': '主任醫師', en: 'Chief Physician' }, good: { zh: '慢性咳嗽、哮喘', 'zh-Hant': '慢性咳嗽、哮喘', en: 'Chronic cough, asthma' }, fee: 30 },
      { id: 'r2', name: { zh: '吴建华', 'zh-Hant': '吳建華', en: 'Wu Jianhua' }, title: { zh: '副主任医师', 'zh-Hant': '副主任醫師', en: 'Associate Chief' }, good: { zh: '肺炎、发烧', 'zh-Hant': '肺炎、發燒', en: 'Pneumonia, fever' }, fee: 20 },
      { id: 'r3', name: { zh: '郑雅芳', 'zh-Hant': '鄭雅芳', en: 'Zheng Yafang' }, title: { zh: '主治医师', 'zh-Hant': '主治醫師', en: 'Attending' }, good: { zh: '支气管炎、久咳', 'zh-Hant': '支氣管炎、久咳', en: 'Bronchitis, long cough' }, fee: 15 }
    ],
    gastro: [
      { id: 'g1', name: { zh: '黄志强', 'zh-Hant': '黃志強', en: 'Huang Zhiqiang' }, title: { zh: '主任医师', 'zh-Hant': '主任醫師', en: 'Chief Physician' }, good: { zh: '胃痛、腹痛', 'zh-Hant': '胃痛、腹痛', en: 'Stomach and belly pain' }, fee: 30 },
      { id: 'g2', name: { zh: '林美玲', 'zh-Hant': '林美玲', en: 'Lin Meiling' }, title: { zh: '副主任医师', 'zh-Hant': '副主任醫師', en: 'Associate Chief' }, good: { zh: '腹泻、胃炎', 'zh-Hant': '腹瀉、胃炎', en: 'Diarrhea, gastritis' }, fee: 20 },
      { id: 'g3', name: { zh: '何国平', 'zh-Hant': '何國平', en: 'He Guoping' }, title: { zh: '主治医师', 'zh-Hant': '主治醫師', en: 'Attending' }, good: { zh: '消化不良、肝胆', 'zh-Hant': '消化不良、肝膽', en: 'Indigestion, liver & gallbladder' }, fee: 15 }
    ],
    surgery: [
      { id: 's1', name: { zh: '罗建安', 'zh-Hant': '羅建安', en: 'Luo Jianan' }, title: { zh: '主任医师', 'zh-Hant': '主任醫師', en: 'Chief Physician' }, good: { zh: '急腹症、疝气', 'zh-Hant': '急腹症、疝氣', en: 'Acute abdomen, hernia' }, fee: 30 },
      { id: 's2', name: { zh: '邱明辉', 'zh-Hant': '邱明輝', en: 'Qiu Minghui' }, title: { zh: '副主任医师', 'zh-Hant': '副主任醫師', en: 'Associate Chief' }, good: { zh: '腹痛、阑尾炎', 'zh-Hant': '腹痛、闌尾炎', en: 'Belly pain, appendicitis' }, fee: 20 },
      { id: 's3', name: { zh: '范少华', 'zh-Hant': '范少華', en: 'Fan Shaohua' }, title: { zh: '主治医师', 'zh-Hant': '主治醫師', en: 'Attending' }, good: { zh: '外伤、换药', 'zh-Hant': '外傷、換藥', en: 'Wounds, dressing change' }, fee: 15 }
    ],
    orthopedics: [
      { id: 'o1', name: { zh: '梁国伟', 'zh-Hant': '梁國偉', en: 'Liang Guowei' }, title: { zh: '主任医师', 'zh-Hant': '主任醫師', en: 'Chief Physician' }, good: { zh: '膝关节痛、腰腿痛', 'zh-Hant': '膝關節痛、腰腿痛', en: 'Knee and leg pain' }, fee: 30 },
      { id: 'o2', name: { zh: '徐凤英', 'zh-Hant': '徐鳳英', en: 'Xu Fengying' }, title: { zh: '副主任医师', 'zh-Hant': '副主任醫師', en: 'Associate Chief' }, good: { zh: '骨质疏松、腿疼', 'zh-Hant': '骨質疏鬆、腿疼', en: 'Osteoporosis, leg pain' }, fee: 20 },
      { id: 'o3', name: { zh: '曾国强', 'zh-Hant': '曾國強', en: 'Zeng Guoqiang' }, title: { zh: '主治医师', 'zh-Hant': '主治醫師', en: 'Attending' }, good: { zh: '关节扭伤、颈肩痛', 'zh-Hant': '關節扭傷、頸肩痛', en: 'Sprains, neck & shoulder pain' }, fee: 15 }
    ],
    ophthalmology: [
      { id: 'e1', name: { zh: '罗建明', 'zh-Hant': '羅建明', en: 'Luo Jianming' }, title: { zh: '主任医师', 'zh-Hant': '主任醫師', en: 'Chief Physician' }, good: { zh: '白内障、视力模糊', 'zh-Hant': '白內障、視力模糊', en: 'Cataract, blurred vision' }, fee: 30 },
      { id: 'e2', name: { zh: '范丽华', 'zh-Hant': '范麗華', en: 'Fan Lihua' }, title: { zh: '副主任医师', 'zh-Hant': '副主任醫師', en: 'Associate Chief' }, good: { zh: '眼干、眼痒', 'zh-Hant': '眼乾、眼癢', en: 'Dry and itchy eyes' }, fee: 20 },
      { id: 'e3', name: { zh: '叶文杰', 'zh-Hant': '葉文傑', en: 'Ye Wenjie' }, title: { zh: '主治医师', 'zh-Hant': '主治醫師', en: 'Attending' }, good: { zh: '眼底病、青光眼', 'zh-Hant': '眼底病、青光眼', en: 'Retina, glaucoma' }, fee: 15 }
    ],
    gp: [
      { id: 'p1', name: { zh: '许平安', 'zh-Hant': '許平安', en: 'Xu Pingan' }, title: { zh: '主任医师', 'zh-Hant': '主任醫師', en: 'Chief Physician' }, good: { zh: '常见病、老年病', 'zh-Hant': '常見病、老年病', en: 'Common and geriatric illness' }, fee: 30 },
      { id: 'p2', name: { zh: '苏慧珍', 'zh-Hant': '蘇慧珍', en: 'Su Huizhen' }, title: { zh: '副主任医师', 'zh-Hant': '副主任醫師', en: 'Associate Chief' }, good: { zh: '健康咨询、慢病', 'zh-Hant': '健康諮詢、慢病', en: 'Health advice, chronic disease' }, fee: 20 },
      { id: 'p3', name: { zh: '邓永康', 'zh-Hant': '鄧永康', en: 'Deng Yongkang' }, title: { zh: '主治医师', 'zh-Hant': '主治醫師', en: 'Attending' }, good: { zh: '初步分诊、转诊', 'zh-Hant': '初步分診、轉診', en: 'First triage, referral' }, fee: 15 }
    ]
  };

  var SLOTS = [
    { id: 'am', labelKey: 'slot.am', timeKey: 'slot.amTime' },
    { id: 'pm', labelKey: 'slot.pm', timeKey: 'slot.pmTime' }
  ];

  /* 就诊人：虚构演示数据，身份证与手机号一律脱敏 */
  var PATIENTS = [
    { id: 'self', relKey: 'patient.self', name: { zh: '张桂英', 'zh-Hant': '張桂英', en: 'Zhang Guiying' }, sex: { zh: '女', 'zh-Hant': '女', en: 'F' }, age: 72, idCard: '4401**********1234', phone: '138****5678' },
    { id: 'spouse', relKey: 'patient.spouse', name: { zh: '李国强', 'zh-Hant': '李國強', en: 'Li Guoqiang' }, sex: { zh: '男', 'zh-Hant': '男', en: 'M' }, age: 75, idCard: '4401**********0871', phone: '139****2460' },
    { id: 'family', relKey: 'patient.family', name: { zh: '张小明', 'zh-Hant': '張小明', en: 'Zhang Xiaoming' }, sex: { zh: '男', 'zh-Hant': '男', en: 'M' }, age: 41, idCard: '4401**********3355', phone: '135****8899' }
  ];

  var PAYS = [
    { id: 'medical', icon: '保', ico: 'shield-cross', key: 'pay.medical', descKey: 'pay.medicalDesc' },
    { id: 'wechat', icon: '微', ico: 'phone', key: 'pay.wechat', descKey: 'pay.wechatDesc' },
    { id: 'alipay', icon: '支', ico: 'qr-code', key: 'pay.alipay', descKey: 'pay.alipayDesc' },
    { id: 'hospital', icon: '院', ico: 'cash', key: 'pay.hospital', descKey: 'pay.hospitalDesc' }
  ];

  /* ---------------- 状态 ---------------- */
  var state = {
    step: 0,
    lang: 'zh',
    font: 1,
    symptom: null,
    dept: null,
    deptPicked: false,
    doctor: null,
    date: null,
    slot: null,
    patient: 'self',
    pay: null,
    ticketNo: null
  };

  var autoSpeak = false; // 首次交互后才自动朗读，避免浏览器拦截

  /* ---------------- 工具 ---------------- */
  /* 往容器里放一个内联 SVG 图标。
     图标库没加载、或图标名不存在时返回 false，由调用方用文字兜底 —— 页面不会因此空掉。 */
  function fillIcon(host, name) {
    var lib = window.XiaoYuErIcons;
    if (!host || !lib || !name) return false;
    var el = lib.element(name);
    if (!el) return false;
    host.textContent = '';
    host.appendChild(el);
    return true;
  }
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function t(key, vars) {
    var dict = I18N[state.lang] || I18N.zh;
    var raw = dict[key] != null ? dict[key] : (I18N.zh[key] != null ? I18N.zh[key] : key);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        raw = raw.split('{' + k + '}').join(vars[k]);
      });
    }
    return raw;
  }
  function pick(obj) {
    if (obj == null) return '';
    if (typeof obj === 'string') return obj;
    return obj[state.lang] != null ? obj[state.lang] : obj.zh;
  }
  function fmtTpl(key, vars) { return t(key, vars); }

  /* ---------------- 扩展点 ----------------
     外部模块（如语音助手）可以：
       1) 注册自己的三语文案 registerI18n
       2) 订阅重绘 onRender
     主程序的翻译表与渲染时机保持唯一来源，避免文案漂移。 */
  var renderHooks = [];
  function registerI18n(extra) {
    LANGS.forEach(function (l) {
      if (!extra[l]) return;
      Object.keys(extra[l]).forEach(function (k) { I18N[l][k] = extra[l][k]; });
    });
  }
  function onRender(fn) { if (typeof fn === 'function') renderHooks.push(fn); }

  function colorOf(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function initialOf(person) {
    var n = pick(person.name);
    return n.charAt(0);
  }

  /* 号源：确定性伪随机，保证同一医生同一天至少有一个时段可选 */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }
  function slotLeft(doctorId, dateId, slotId) {
    var n = hash(doctorId + '|' + dateId + '|' + slotId) % 13;
    var other = hash(doctorId + '|' + dateId + '|' + (slotId === 'am' ? 'pm' : 'am')) % 13;
    if (n === 0 && other === 0) n = 4;
    return n;
  }

  function dateOptions() {
    var now = new Date();
    var weekZh = ['日', '一', '二', '三', '四', '五', '六'];
    var weekEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var keys = ['date.today', 'date.tomorrow', 'date.dayAfter'];
    return [0, 1, 2].map(function (i) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var md = state.lang === 'en'
        ? (d.getMonth() + 1) + '/' + d.getDate()
        : (d.getMonth() + 1) + '月' + d.getDate() + '日';
      var week = state.lang === 'en' ? weekEn[d.getDay()] : weekZh[d.getDay()];
      return {
        id: 'd' + i,
        iso: d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(),
        label: t(keys[i]),
        text: t('date.fmt', { label: t(keys[i]), md: md, week: week }),
        week: week
      };
    });
  }

  function currentDoctor() {
    if (!state.doctor || !state.dept) return null;
    var list = DOCTORS[state.dept] || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === state.doctor) return list[i];
    return null;
  }
  function currentPatient() {
    for (var i = 0; i < PATIENTS.length; i++) if (PATIENTS[i].id === state.patient) return PATIENTS[i];
    return PATIENTS[0];
  }
  function currentPay() {
    for (var i = 0; i < PAYS.length; i++) if (PAYS[i].id === state.pay) return PAYS[i];
    return null;
  }
  function slotText() {
    if (!state.date || !state.slot) return '';
    var d = dateOptions().filter(function (o) { return o.id === state.date; })[0];
    var s = SLOTS.filter(function (o) { return o.id === state.slot; })[0];
    if (!d || !s) return '';
    return d.text + ' · ' + t(s.labelKey) + ' ' + t(s.timeKey);
  }

  /* ---------------- 语音 ---------------- */
  function speechSupported() { return typeof window !== 'undefined' && 'speechSynthesis' in window; }

  /** 朗读按钮在「念」与「停」之间切换，老人不用找另一个按钮 */
  function setSpeaking(on) {
    var btn = $('#btn-speak');
    if (!btn) return;
    var lbl = btn.querySelector('[data-i18n]');
    btn.setAttribute('data-speaking', on ? '1' : '0');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (lbl) lbl.textContent = on ? t('voice.stop') : t('voice.listen');
  }

  function speak(text) {
    setLive(text);
    if (!speechSupported()) { setLive(t('voice.unsupported')); return false; }
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[state.lang] || 'zh-CN';
      u.rate = 0.92;
      u.onend = function () { setSpeaking(false); };
      u.onerror = function () { setSpeaking(false); };
      setSpeaking(true);
      var voices = window.speechSynthesis.getVoices() || [];
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].lang && voices[i].lang.replace('_', '-').toLowerCase().indexOf(u.lang.toLowerCase().slice(0, 2)) === 0) {
          u.voice = voices[i];
          break;
        }
      }
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }
  function stopSpeak() {
    if (speechSupported()) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    setSpeaking(false);
  }
  function setLive(text) { var el = $('#live'); if (el) el.textContent = text; }

  function stepVoice() {
    var lines = [];
    if (state.step === 0) {
      lines.push(t('step0.title'), t('step0.lead'), t('step0.cta'));
    } else if (state.step === 1) {
      lines.push(t('step1.title'), t('step1.lead'));
      SYMPTOMS.forEach(function (s) { lines.push(pick(s.name)); });
      if (state.dept) lines.push(t('step1.recommend', { symptom: pick(currentSymptom().name), dept: pick(DEPTS[state.dept].name) }));
    } else if (state.step === 2) {
      lines.push(t('step2.title'), t('step2.lead', { dept: state.dept ? pick(DEPTS[state.dept].name) : PLACEHOLDER }));
      (DOCTORS[state.dept] || []).forEach(function (d) { lines.push(pick(d.name) + '，' + pick(d.title) + '，' + pick(d.good)); });
    } else if (state.step === 3) {
      lines.push(t('step3.title'), t('step3.lead'));
      dateOptions().forEach(function (d) { lines.push(d.text); });
      SLOTS.forEach(function (s) {
        var left = state.doctor ? slotLeft(state.doctor, state.date || 'd0', s.id) : 1;
        lines.push(t(s.labelKey) + ' ' + t(s.timeKey) + '，' + (left > 0 ? t('slot.left', { n: left }) : t('slot.full')));
      });
      lines.push(t('step3.fullHint'));
    } else if (state.step === 4) {
      lines.push(t('step4.title'), t('step4.lead'));
      var p = currentPatient();
      var dept4 = state.dept ? DEPTS[state.dept] : null;
      var doc4 = currentDoctor();
      lines.push(t('summary.patient') + ' ' + pick(p.name) + '，' + t('patient.idCard') + ' ' + p.idCard);
      lines.push(t('summary.dept') + ' ' + (dept4 ? pick(dept4.name) : PLACEHOLDER) + '，' + t('summary.doctor') + ' ' + (doc4 ? pick(doc4.name) : PLACEHOLDER) + '，' + t('summary.time') + ' ' + (slotText() || PLACEHOLDER));
      PAYS.forEach(function (pay) { lines.push(t(pay.key) + '，' + t(pay.descKey)); });
    } else if (state.step === 5) {
      lines.push(t('step5.title'), t('step5.lead'));
      lines.push(t('ticket.no') + ' ' + state.ticketNo);
      lines.push(t('step5.tip1'), t('step5.tip2'), t('step5.tip3'));
    }
    return lines.join('。');
  }

  function currentSymptom() {
    for (var i = 0; i < SYMPTOMS.length; i++) if (SYMPTOMS[i].id === state.symptom) return SYMPTOMS[i];
    return SYMPTOMS[0];
  }

  /* ---------------- 渲染 ---------------- */
  function applyStaticI18n() {
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    /* 页面里写死的图标占位（顶栏院名、能力带、到院提醒等）在这里补成内联 SVG */
    $$('[data-icon]').forEach(function (el) { fillIcon(el, el.getAttribute('data-icon')); });
    document.title = t('doc.title');
    document.documentElement.lang = HTML_LANG[state.lang] || 'zh-CN';
    document.documentElement.setAttribute('data-lang', state.lang);
  }

  function renderStepbar() {
    var bar = $('#stepbar');
    bar.innerHTML = '';
    var steps = [0, 1, 2, 3, 4, 5];
    steps.forEach(function (i) {
      var done = i < state.step;
      var li = document.createElement('li');
      li.className = 'stepbar__item';
      li.setAttribute('data-state', i === state.step ? 'active' : (done ? 'done' : 'todo'));

      /* 走过的步骤可以点回去改，没走过的不能跳——防止老人误触跳步 */
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stepbar__btn';
      btn.setAttribute('data-action', 'gostep');
      btn.setAttribute('data-value', String(i));
      if (i === state.step) btn.setAttribute('aria-current', 'step');
      btn.disabled = !done || state.step === 5;
      btn.setAttribute('aria-label', t('stepbar.' + i) + (btn.disabled ? '' : '（可回去修改）'));

      var no = document.createElement('span');
      no.className = 'stepbar__no';
      no.textContent = done ? '✓' : String(i);
      var label = document.createElement('span');
      label.textContent = t('stepbar.' + i);
      btn.appendChild(no);
      btn.appendChild(label);
      li.appendChild(btn);
      bar.appendChild(li);
    });
  }

  function optionCard(opts) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bigcard' + (opts.off ? ' bigcard--off' : '');
    btn.setAttribute('aria-pressed', opts.selected ? 'true' : 'false');
    if (opts.off) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
    if (opts.action) btn.setAttribute('data-action', opts.action);
    if (opts.value) btn.setAttribute('data-value', opts.value);

    if (opts.avatarColor) {
      var av = document.createElement('span');
      av.className = 'avatar';
      av.style.background = opts.avatarColor;
      av.setAttribute('aria-hidden', 'true');
      av.textContent = opts.avatarText || '';
      btn.appendChild(av);
    } else if (opts.icon || opts.iconSvg) {
      var ic = document.createElement('span');
      ic.className = 'bigcard__icon';
      ic.setAttribute('aria-hidden', 'true');
      if (!fillIcon(ic, opts.iconSvg)) ic.textContent = opts.icon || '';
      btn.appendChild(ic);
    }

    var main = document.createElement('span');
    main.className = 'bigcard__main';
    var ti = document.createElement('span');
    ti.className = 'bigcard__title';
    ti.textContent = opts.title;
    main.appendChild(ti);
    if (opts.desc) {
      var de = document.createElement('span');
      de.className = 'bigcard__desc';
      de.textContent = opts.desc;
      main.appendChild(de);
    }
    if (opts.meta) {
      var me = document.createElement('span');
      me.className = 'bigcard__meta';
      me.textContent = opts.meta;
      main.appendChild(me);
    }
    btn.appendChild(main);

    if (!opts.off) {
      var ck = document.createElement('span');
      ck.className = 'bigcard__check';
      ck.setAttribute('aria-hidden', 'true');
      ck.textContent = '✓';
      btn.appendChild(ck);
    }
    return btn;
  }

  function renderSymptoms() {
    var box = $('#symptom-list');
    box.innerHTML = '';
    SYMPTOMS.forEach(function (s) {
      box.appendChild(optionCard({
        icon: s.icon,
        iconSvg: s.ico,
        title: pick(s.name),
        selected: state.symptom === s.id,
        action: 'symptom',
        value: s.id
      }));
    });

    showDeptResult();
  }

  /** 显示推荐（或手动改挂）的科室 */
  function showDeptResult() {
    var result = $('#dept-result');
    if (state.dept) {
      result.hidden = false;
      /* 科室名前面带一个图标：老人不认字也认得出这是「哪个科」 */
      var nameEl = $('#dept-name');
      nameEl.textContent = '';
      var deptName = pick(DEPTS[state.dept].name);
      fillIcon(nameEl, DEPTS[state.dept].ico);
      nameEl.appendChild(document.createTextNode(deptName));
      $('#dept-reason').textContent = state.deptPicked
        ? t('step1.pickedDept', { dept: deptName })
        : t('step1.recommend', { symptom: pick(currentSymptom().name), dept: deptName });
      var altsBox = $('#dept-alts');
      altsBox.innerHTML = '';
      altsBox.hidden = true;
    } else {
      result.hidden = true;
    }
  }

  function renderAlts() {
    var altsBox = $('#dept-alts');
    altsBox.innerHTML = '';
    var s = currentSymptom();
    var list = (s.alts || []).concat(Object.keys(DEPTS).filter(function (d) {
      return d !== state.dept && (s.alts || []).indexOf(d) < 0;
    })).slice(0, 4);
    if (!list.length) { altsBox.hidden = true; return; }
    var label = document.createElement('p');
    label.className = 'notice__text';
    label.textContent = t('step1.altsLabel');
    altsBox.appendChild(label);
    list.forEach(function (d) {
      altsBox.appendChild(optionCard({
        iconSvg: DEPTS[d].ico,
        title: pick(DEPTS[d].name),
        selected: false,
        action: 'dept',
        value: d
      }));
    });
    altsBox.hidden = false;
  }

  function renderDoctors() {
    var box = $('#doctor-list');
    box.innerHTML = '';
    $('#step2-lead').textContent = t('step2.lead', { dept: pick(DEPTS[state.dept].name) });
    (DOCTORS[state.dept] || []).forEach(function (d) {
      box.appendChild(optionCard({
        avatarColor: colorOf(d.id),
        avatarText: initialOf(d),
        title: pick(d.name) + ' · ' + pick(d.title),
        desc: pick(d.good),
        meta: t('summary.fee') + ' ¥' + d.fee,
        selected: state.doctor === d.id,
        action: 'doctor',
        value: d.id
      }));
    });
  }

  function renderDates() {
    var box = $('#date-list');
    box.innerHTML = '';
    dateOptions().forEach(function (d) {
      box.appendChild(optionCard({
        iconSvg: 'calendar',
        title: d.label,
        desc: d.text,
        selected: state.date === d.id,
        action: 'date',
        value: d.id
      }));
    });
  }

  function renderSlots() {
    var box = $('#slot-list');
    box.innerHTML = '';
    SLOTS.forEach(function (s) {
      var left = state.doctor ? slotLeft(state.doctor, state.date || 'd0', s.id) : 1;
      var off = left === 0;
      box.appendChild(optionCard({
        iconSvg: s.id === 'am' ? 'sun' : 'sunset',
        title: t(s.labelKey) + ' ' + t(s.timeKey),
        desc: off ? t('slot.full') : t('slot.left', { n: left }),
        off: off,
        selected: !off && state.slot === s.id,
        action: 'slot',
        value: s.id
      }));
    });
  }

  function renderPatients() {
    var box = $('#patient-list');
    box.innerHTML = '';
    PATIENTS.forEach(function (p) {
      box.appendChild(optionCard({
        avatarColor: colorOf(p.id),
        avatarText: initialOf(p),
        title: pick(p.name) + ' · ' + t(p.relKey),
        desc: pick(p.sex) + ' · ' + t('patient.age', { age: p.age }),
        meta: t('patient.idCard') + ' ' + p.idCard + ' · ' + t('patient.phone') + ' ' + p.phone,
        selected: state.patient === p.id,
        action: 'patient',
        value: p.id
      }));
    });
  }

  function renderSummary() {
    var box = $('#summary');
    box.innerHTML = '';
    /* 状态不全时也不能崩：缺的字段用占位符，保证付款方式等区块照常显示 */
    var dept = state.dept ? DEPTS[state.dept] : null;
    var doc = currentDoctor();
    var rows = [
      [t('summary.dept'), dept ? pick(dept.name) : PLACEHOLDER],
      [t('summary.doctor'), doc ? (pick(doc.name) + ' · ' + pick(doc.title)) : PLACEHOLDER],
      [t('summary.time'), slotText() || PLACEHOLDER],
      [t('ticket.place'), dept ? pick(dept.place) : PLACEHOLDER],
      [t('summary.fee'), doc ? ('¥' + doc.fee) : PLACEHOLDER]
    ];
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'summary__row';
      var k = document.createElement('dt');
      k.className = 'summary__k';
      k.textContent = r[0];
      var v = document.createElement('dd');
      v.className = 'summary__v';
      v.textContent = r[1];
      row.appendChild(k);
      row.appendChild(v);
      box.appendChild(row);
    });
  }

  /* 右栏「您已经选好的」：宽屏常驻，老人随时能看见自己选到哪一步了 */
  function renderAside() {
    var box = $('#aside-list');
    if (!box) return;
    var now = $('#aside-now');
    if (now) {
      now.textContent = (state.step >= 1 && state.step <= 5) ? t('aside.now', { n: state.step }) : '';
    }
    box.innerHTML = '';
    var rows = [];
    if (state.symptom) rows.push([t('aside.symptom'), pick(currentSymptom().name)]);
    if (state.dept) rows.push([t('aside.dept'), pick(DEPTS[state.dept].name)]);
    if (state.doctor) rows.push([t('aside.doctor'), pick(currentDoctor().name)]);
    if (state.date && state.slot) rows.push([t('aside.time'), slotText()]);
    if (state.pay) { var payItem = currentPay(); rows.push([t('aside.pay'), payItem ? t(payItem.key) : PLACEHOLDER]); }

    if (!rows.length) {
      var empty = document.createElement('p');
      empty.className = 'aside__empty';
      empty.textContent = t('aside.empty');
      box.appendChild(empty);
      return;
    }
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'aside__row';
      var k = document.createElement('span');
      k.className = 'aside__k';
      k.textContent = r[0];
      var v = document.createElement('span');
      v.className = 'aside__v';
      v.textContent = r[1];
      row.appendChild(k);
      row.appendChild(v);
      box.appendChild(row);
    });
  }

  function renderPays() {
    var box = $('#pay-list');
    box.innerHTML = '';
    PAYS.forEach(function (p) {
      box.appendChild(optionCard({
        icon: p.icon,
        iconSvg: p.ico,
        title: t(p.key),
        desc: t(p.descKey),
        selected: state.pay === p.id,
        action: 'pay',
        value: p.id
      }));
    });
  }

  function renderTicket() {
    var box = $('#ticket');
    box.innerHTML = '';
    var hp = document.createElement('p');
    hp.className = 'ticket__hospital';
    hp.textContent = t('brand.hospital');
    box.appendChild(hp);
    var no = document.createElement('p');
    no.className = 'ticket__label';
    no.textContent = t('ticket.no');
    box.appendChild(no);
    var noV = document.createElement('p');
    noV.className = 'ticket__no';
    noV.textContent = state.ticketNo;
    box.appendChild(noV);

    var rows = [
      [t('summary.patient'), pick(currentPatient().name)],
      [t('summary.dept'), pick(DEPTS[state.dept].name)],
      [t('summary.doctor'), pick(currentDoctor().name) + ' · ' + pick(currentDoctor().title)],
      [t('summary.time'), slotText()],
      [t('ticket.place'), pick(DEPTS[state.dept].place)],
      [t('summary.pay'), t(currentPay().key)]
    ];
    var dl = document.createElement('dl');
    dl.className = 'summary';
    dl.style.marginTop = '0.8rem';
    dl.style.border = 'none';
    dl.style.padding = '0';
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'summary__row';
      var k = document.createElement('dt');
      k.className = 'summary__k';
      k.textContent = r[0];
      var v = document.createElement('dd');
      v.className = 'summary__v';
      v.textContent = r[1];
      row.appendChild(k);
      row.appendChild(v);
      dl.appendChild(row);
    });
    box.appendChild(dl);
  }

  /**
   * 就地更新勾选状态：不重建列表，焦点与朗读位置不丢，
   * 老人用键盘或读屏时不会「跳到别处」。
   */
  function markSelected(containerSel, value) {
    var cards = $$(containerSel + ' .bigcard');
    for (var i = 0; i < cards.length; i++) {
      var isOn = cards[i].getAttribute('data-value') === value;
      cards[i].setAttribute('aria-pressed', isOn ? 'true' : 'false');
    }
  }

  /** 当前这一步的必选项是否已做完（做完才让「下一步」亮起来，引导老人点） */
  function stepReady() {
    if (state.step === 0) return true;
    if (state.step === 1) return !!state.symptom || !!state.deptPicked;
    if (state.step === 2) return !!state.doctor;
    if (state.step === 3) return !!state.date && !!state.slot;
    if (state.step === 4) return !!state.pay;
    return false;
  }
  function updateNextState() {
    var next = $('#btn-next');
    if (next && state.step < 5) next.classList.toggle('btn--ready', stepReady());
  }

  var PLACEHOLDER = '—'; /* 字段缺失时的占位符，避免渲染整块崩掉 */

  /* 单块渲染隔离：某一块数据缺失时，不让它拖垮整页渲染 */
  function safeRender(fn) { try { fn(); } catch (e) { /* 忽略单块异常 */ } }

  /* 底部操作栏高度：供悬浮按钮避让，避免遮住「需要帮助」等按钮 */
  function syncActionbar() {
    var bar = $('#actionbar');
    var h = (bar && !bar.hidden) ? bar.offsetHeight : 0;
    document.documentElement.style.setProperty('--actionbar-h', h + 'px');
  }

  function renderStep() {
    for (var i = 0; i <= 5; i++) {
      var el = $('#step-' + i);
      if (el) el.hidden = (i !== state.step);
    }
    document.body.setAttribute('data-step', String(state.step));
    var bar = $('#actionbar');
    bar.hidden = (state.step === 5);
    var prev = $('#btn-prev');
    prev.disabled = (state.step === 0);

    var next = $('#btn-next');
    var nextLabel = next.querySelector('[data-i18n]');
    nextLabel.textContent = state.step === 4 ? t('nav.nextSubmit') : t('nav.next');
    updateNextState();

    if (state.step === 1) safeRender(renderSymptoms);
    if (state.step === 2) safeRender(renderDoctors);
    if (state.step === 3) { safeRender(renderDates); safeRender(renderSlots); }
    if (state.step === 4) { safeRender(renderPatients); safeRender(renderSummary); safeRender(renderPays); }
    if (state.step === 5) safeRender(renderTicket);

    renderStepbar();
    renderAside();
    syncActionbar();
    window.scrollTo(0, 0);
    if (autoSpeak) { var voice = ''; try { voice = stepVoice(); } catch (e) { /* 播报文案异常不阻断渲染 */ } if (voice) speak(voice); }
    renderHooks.forEach(function (fn) { try { fn(); } catch (e) { /* 外部模块出错不影响主流程 */ } });
  }

  function render() { applyStaticI18n(); renderStep(); }

  /* ---------------- 弹窗 ---------------- */
  var pendingConfirm = false; // 确认窗开着时，语音助手的「确认」才生效
  function openModal(title, bodyHtml, actions) {
    var modal = $('#modal');
    $('#modal-title').textContent = title;
    var body = $('#modal-body');
    body.innerHTML = '';
    if (typeof bodyHtml === 'string') {
      body.innerHTML = bodyHtml;
    } else {
      body.appendChild(bodyHtml);
    }
    var act = $('#modal-actions');
    act.innerHTML = '';
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.primary ? 'btn--primary' : 'btn--ghost');
      b.textContent = a.label;
      b.addEventListener('click', function () { closeModal(); if (a.onClick) a.onClick(); });
      act.appendChild(b);
    });
    modal.hidden = false;
    var first = act.querySelector('.btn');
    if (first) first.focus();
  }
  function closeModal() { $('#modal').hidden = true; pendingConfirm = false; }

  /** 焦点锁在弹窗里：老人按 Tab 不会跑到背后的页面上 */
  function trapFocus(container, ev) {
    var items = container.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function alertDialog(text) {
    openModal(t('dialog.needTitle'), '<p>' + text + '</p>', [
      { label: t('dialog.ok'), primary: true }
    ]);
  }

  function helpDialog() {
    var ul = document.createElement('div');
    var list = document.createElement('ul');
    [t('dialog.help1'), t('dialog.help2'), t('dialog.help3')].forEach(function (line) {
      var li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    });
    ul.appendChild(list);
    openModal(t('dialog.helpTitle'), ul, [
      { label: t('dialog.helpSpeak'), onClick: function () { speak(t('dialog.helpTitle') + '。' + t('dialog.help1') + t('dialog.help2') + t('dialog.help3')); } },
      { label: t('dialog.close'), primary: true }
    ]);
    speak(t('dialog.helpTitle') + '。' + t('dialog.help1') + t('dialog.help2') + t('dialog.help3'));
  }

  function confirmDialog() {
    if (!canGoNext()) return; // 信息不全时不弹确认窗，先提示缺什么
    var body = t('dialog.confirmBody', {
      dept: pick(DEPTS[state.dept].name),
      doctor: pick(currentDoctor().name),
      time: slotText(),
      patient: pick(currentPatient().name),
      pay: t(currentPay().key)
    });
    openModal(t('dialog.confirmTitle'), '<p>' + body + '</p>', [
      { label: t('dialog.confirmNo') },
      { label: t('dialog.confirmYes'), primary: true, onClick: submitBooking }
    ]);
    pendingConfirm = true;
    speak(t('dialog.confirmTitle') + '。' + body);
  }

  function submitBooking() {
    pendingConfirm = false;
    var seed = hash(state.dept + state.doctor + state.date + state.slot + state.patient);
    state.ticketNo = 'A' + String(100 + (seed % 800));
    state.step = 5;
    renderStep();
    speak(stepVoice());
  }

  /* ---------------- 流程控制 ---------------- */
  function canGoNext() {
    if (state.step === 1) {
      if (!state.symptom && !state.deptPicked) { alertDialog(t('dialog.needSymptom')); return false; }
    } else if (state.step === 2) {
      if (!state.doctor) { alertDialog(t('dialog.needDoctor')); return false; }
    } else if (state.step === 3) {
      if (!state.date) { alertDialog(t('dialog.needDate')); return false; }
      if (!state.slot) { alertDialog(t('dialog.needSlot')); return false; }
    } else if (state.step === 4) {
      if (!state.pay) { alertDialog(t('dialog.needPay')); return false; }
    }
    return true;
  }

  function next() {
    if (state.step === 0) { state.step = 1; renderStep(); return; }
    if (!canGoNext()) return;
    if (state.step === 4) { confirmDialog(); return; } // 提交前强制确认，防误操作
    state.step = Math.min(5, state.step + 1);
    renderStep();
  }

  function prev() {
    if (state.step === 0) return;
    state.step -= 1;
    renderStep();
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    autoSpeak = true; // 任何一次点选之后即可自动朗读

    var close = el.closest ? el.closest('[data-close]') : null;
    if (close) { closeModal(); return; }

    var btn = el.closest ? el.closest('[data-action]') : null;
    if (btn) {
      var action = btn.getAttribute('data-action');
      var value = btn.getAttribute('data-value');
      handleAction(action, value);
      return;
    }

    var langBtn = el.closest ? el.closest('[data-lang-btn]') : null;
    if (langBtn) { setLang(langBtn.getAttribute('data-lang-btn')); return; }
  });

  function handleAction(action, value) {
    stopSpeak();
    switch (action) {
      case 'start':
        state.step = 1; renderStep(); break;
      case 'symptom':
        state.symptom = value;
        state.deptPicked = false;
        state.dept = SYMPTOMS.filter(function (s) { return s.id === value; })[0].dept;
        state.doctor = null; state.slot = null;
        markSelected('#symptom-list', value);
        ensureVisible('#symptom-list', value);
        showDeptResult();
        speak(t('step1.recommend', { symptom: pick(currentSymptom().name), dept: pick(DEPTS[state.dept].name) }));
        break;
      case 'dept':
        state.dept = value; state.doctor = null; state.slot = null;
        state.deptPicked = true;
        markSelected('#symptom-list', null);
        showDeptResult();
        $('#dept-alts').hidden = true;
        speak(pick(DEPTS[state.dept].name));
        break;
      case 'doctor':
        state.doctor = value; state.slot = null;
        markSelected('#doctor-list', value);
        ensureVisible('#doctor-list', value);
        speak(pick(currentDoctor().name) + '，' + pick(currentDoctor().title));
        break;
      case 'date':
        state.date = value; state.slot = null;
        markSelected('#date-list', value);
        ensureVisible('#date-list', value);
        renderSlots(); // 余量随日期变化，时段需重算
        speak(dateOptions().filter(function (d) { return d.id === value; })[0].text);
        break;
      case 'slot':
        if (state.doctor && slotLeft(state.doctor, state.date || 'd0', value) === 0) {
          alertDialog(t('dialog.slotFull'));
          updateNextState();
          return;
        }
        state.slot = value;
        markSelected('#slot-list', value);
        ensureVisible('#slot-list', value);
        speak(t(value === 'am' ? 'slot.am' : 'slot.pm'));
        break;
      case 'patient':
        state.patient = value;
        markSelected('#patient-list', value);
        ensureVisible('#patient-list', value);
        renderSummary();
        speak(pick(currentPatient().name));
        break;
      case 'pay':
        state.pay = value;
        markSelected('#pay-list', value);
        ensureVisible('#pay-list', value);
        speak(t(currentPay().key) + '，' + t(currentPay().descKey));
        break;
      case 'gostep':
        /* 只允许回到已经走过的步骤，不能跳过没完成的步骤 */
        var target = parseInt(value, 10);
        if (isNaN(target) || target >= state.step || state.step === 5) return;
        state.step = target;
        renderStep();
        break;
      case 'restart':
        resetAll(); state.step = 1; renderStep(); break;
      case 'done':
        resetAll(); state.step = 0; renderStep(); break;
    }
    updateNextState();
  }

  /** 刚点中的卡片如果滚出屏幕，轻轻带回可视区（不抢焦点，读屏位置不丢） */
  function ensureVisible(sel, value) {
    try {
      var el = $(sel + ' .bigcard[data-value="' + value + '"]');
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    } catch (e) { /* 部分浏览器不支持，忽略 */ }
  }

  function resetAll() {
    state.symptom = null; state.dept = null; state.deptPicked = false; state.doctor = null;
    state.date = null; state.slot = null; state.pay = null;
    state.patient = 'self'; state.ticketNo = null;
  }

  $('#btn-next').addEventListener('click', next);
  $('#btn-prev').addEventListener('click', function () { stopSpeak(); prev(); });
  $('#btn-help').addEventListener('click', function () { stopSpeak(); helpDialog(); });
  $('#btn-speak').addEventListener('click', function () { speak(stepVoice()); });
  $('#btn-stop').addEventListener('click', function () { stopSpeak(); setLive(''); });
  $('#dept-change').addEventListener('click', function () {
    var box = $('#dept-alts');
    if (box.hidden) renderAlts(); else { box.hidden = true; box.innerHTML = ''; }
  });

  document.addEventListener('keydown', function (ev) {
    if ($('#modal').hidden) return;
    if (ev.key === 'Escape') { closeModal(); return; }
    if (ev.key === 'Tab') trapFocus($('#modal'), ev);
  });

  /* ---------------- 字体缩放 ---------------- */
  var FONT_MIN = 0.9, FONT_MAX = 1.5, FONT_STEP = 0.15;
  function applyFont() {
    document.documentElement.style.setProperty('--fs', String(state.font));
    store('xiaoyuer.font', String(state.font));
    syncTopbar(); // 字号变了顶栏高度也变，步骤条吸顶位置要跟着走
  }
  function setFont(v) {
    state.font = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(v * 100) / 100));
    applyFont();
  }
  $('#font-plus').addEventListener('click', function () { setFont(state.font + FONT_STEP); });
  $('#font-minus').addEventListener('click', function () { setFont(state.font - FONT_STEP); });
  $('#font-reset').addEventListener('click', function () { setFont(1); });

  /* ---------------- 语言 ---------------- */
  function setLang(lang) {
    if (LANGS.indexOf(lang) < 0) return;
    state.lang = lang;
    store('xiaoyuer.lang', lang);
    stopSpeak();
    $$('[data-lang-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang-btn') === lang ? 'true' : 'false');
    });
    render();
  }

  /* ---------------- 本地记忆 ---------------- */
  var memStore = {}; // localStorage 不可用（隐私模式、file:// 限制）时的内存回退
  function store(key, value) {
    memStore[key] = String(value);
    try { window.localStorage.setItem(key, String(value)); } catch (e) { /* 隐私模式下忽略 */ }
  }
  function read(key) {
    try {
      var v = window.localStorage.getItem(key);
      if (v != null) return v;
    } catch (e) { /* 忽略，走内存回退 */ }
    return memStore[key] != null ? memStore[key] : null;
  }

  /* ---------------- 对外导航动作 ----------------
     智能体（含语音助手）只能走这份白名单：
     要么调「能力清单」里的动作，要么调这里的界面导航，绝不能直接碰页面。 */
  function uiNav(cmd) {
    stopSpeak();
    switch (cmd) {
      case 'next': next(); return true;
      case 'prev': prev(); return true;
      case 'help': helpDialog(); return true;
      case 'read': speak(stepVoice()); return true;
      case 'stop': stopSpeak(); setLive(''); return true;
      case 'confirm': if (state.step !== 4) return false; confirmDialog(); return true; // 仍要人工点
      case 'confirmYes': if (state.step !== 4) return false; closeModal(); submitBooking(); return true;
      case 'closeModal': closeModal(); return true;
      case 'fontUp': setFont(state.font + FONT_STEP); return true;
      case 'fontDown': setFont(state.font - FONT_STEP); return true;
      case 'fontReset': setFont(1); return true;
      case 'restart': resetAll(); state.step = 1; renderStep(); return true;
      case 'home': resetAll(); state.step = 0; renderStep(); return true;
      default: return false;
    }
  }

  /** 当前每一步的「可选项」——智能体只能从这里取值，防止说出一个页面上没有的选项 */
  function options() {
    return {
      symptoms: SYMPTOMS.map(function (s) { return { id: s.id, name: pick(s.name) }; }),
      depts: Object.keys(DEPTS).map(function (d) { return { id: d, name: pick(DEPTS[d].name) }; }),
      doctors: (DOCTORS[state.dept] || []).map(function (d) { return { id: d.id, name: pick(d.name), title: pick(d.title) }; }),
      dates: dateOptions().map(function (d) { return { id: d.id, name: d.label, text: d.text }; }),
      slots: SLOTS.map(function (s) { return { id: s.id, name: t(s.labelKey), text: t(s.timeKey) }; }),
      patients: PATIENTS.map(function (p) { return { id: p.id, name: pick(p.name), rel: t(p.relKey) }; }),
      pays: PAYS.map(function (p) { return { id: p.id, name: t(p.key) }; })
    };
  }

  /* ---------------- 空闲关怀：老人停住不动时，轻轻提示一句 ---------------- */
  var IDLE_MS = 75000;
  var idleTimer = null;
  function hideIdle() {
    var bar = $('#idlebar');
    if (bar) bar.hidden = true;
    document.body.classList.remove('idle-on');
  }
  function resetIdle() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    hideIdle();
    if (state.step >= 1 && state.step <= 4) {
      idleTimer = setTimeout(function () {
        if (state.step < 1 || state.step > 4) return;
        var b = $('#idlebar');
        if (!b) return;
        b.hidden = false;
        document.body.classList.add('idle-on');
      }, IDLE_MS);
    }
  }
  ['click', 'keydown', 'touchstart'].forEach(function (evt) {
    document.addEventListener(evt, resetIdle, { passive: true });
  });

  /* ---------------- 步骤条吸顶跟随：按顶栏实际高度对齐 ---------------- */
  function syncTopbar() {
    var el = $('.topbar');
    if (!el || !el.offsetHeight) return;
    document.documentElement.style.setProperty('--topbar-h', el.offsetHeight + 'px');
  }
  window.addEventListener('resize', syncTopbar);
  window.addEventListener('resize', syncActionbar);
  if (typeof window.ResizeObserver === 'function') {
    try { new window.ResizeObserver(syncActionbar).observe($('#actionbar')); } catch (e) { /* 忽略 */ }
  }
  if (typeof window.ResizeObserver === 'function') {
    try { new window.ResizeObserver(syncTopbar).observe($('.topbar')); } catch (e) { /* 忽略 */ }
  }

  /* ---------------- 对外能力清单（供智能体代驾） ----------------
     模型只负责「选哪个」，执行一律由下面这些确定性函数完成。 */
  var CAPABILITIES = [
    { id: 'select_symptom', risk: 'low', options: SYMPTOMS.map(function (s) { return s.id; }) },
    { id: 'select_department', risk: 'low', options: Object.keys(DEPTS) },
    { id: 'select_doctor', risk: 'low', note: 'options depend on department' },
    { id: 'select_date', risk: 'low', options: ['d0', 'd1', 'd2'] },
    { id: 'select_slot', risk: 'low', options: ['am', 'pm'] },
    { id: 'select_patient', risk: 'medium', options: PATIENTS.map(function (p) { return p.id; }) },
    { id: 'select_payment', risk: 'medium', options: PAYS.map(function (p) { return p.id; }) },
    { id: 'submit_booking', risk: 'high', note: 'requires granted=true' },
    { id: 'reset', risk: 'low' }
  ];

  /** 确定性执行：只接受能力清单内的动作，参数不在取值范围内直接拒绝 */
  function call(actionId, params) {
    params = params || {};
    switch (actionId) {
      case 'select_symptom':
        if (!SYMPTOMS.some(function (s) { return s.id === params.value; })) return reject();
        handleAction('symptom', params.value); return ok();
      case 'select_department':
        if (!DEPTS[params.value]) return reject();
        handleAction('dept', params.value); return ok();
      case 'select_doctor':
        if (!state.dept || !(DOCTORS[state.dept] || []).some(function (d) { return d.id === params.value; })) return reject();
        handleAction('doctor', params.value); return ok();
      case 'select_date':
        if (['d0', 'd1', 'd2'].indexOf(params.value) < 0) return reject();
        handleAction('date', params.value); return ok();
      case 'select_slot':
        if (['am', 'pm'].indexOf(params.value) < 0) return reject();
        if (state.doctor && slotLeft(state.doctor, state.date || 'd0', params.value) === 0) {
          return { ok: false, reason: 'slot_full' };
        }
        handleAction('slot', params.value); return ok();
      case 'select_patient':
        if (!PATIENTS.some(function (p) { return p.id === params.value; })) return reject();
        handleAction('patient', params.value); return ok();
      case 'select_payment':
        if (!PAYS.some(function (p) { return p.id === params.value; })) return reject();
        handleAction('pay', params.value); return ok();
      case 'submit_booking':
        if (!canGoNext()) return { ok: false, reason: 'incomplete' };
        if (params.granted !== true) return { ok: false, reason: 'need_confirm', label: t('nav.nextSubmit') };
        submitBooking(); return ok();
      case 'reset':
        resetAll(); state.step = 0; renderStep(); return ok();
      default:
        return reject();
    }
  }
  /* 成功执行一次能力后，顺手刷新右栏摘要 —— 点选走的是就地更新，不会触发 renderStep */
  function ok() { renderAside(); return { ok: true, state: getState() }; }
  function reject() { return { ok: false, reason: 'not_in_capability_list' }; }

  function getState() {
    return {
      step: state.step,
      lang: state.lang,
      font: state.font,
      symptom: state.symptom,
      dept: state.dept,
      doctor: state.doctor,
      date: state.date,
      slot: state.slot,
      patient: state.patient,
      pay: state.pay,
      ticketNo: state.ticketNo,
      deptName: state.dept ? pick(DEPTS[state.dept].name) : null,
      doctorName: currentDoctor() ? pick(currentDoctor().name) : null,
      timeText: state.date && state.slot ? slotText() : null
    };
  }

  window.XiaoYuEr = {
    version: '1.1.0',
    capabilities: CAPABILITIES,
    getState: getState,
    call: call,
    speak: speak,
    stopSpeak: stopSpeak,
    setLanguage: setLang,
    setFontScale: setFont,
    go: function (step) { state.step = Math.max(0, Math.min(5, step)); renderStep(); },
    /* 给外部智能体（语音助手等）用的扩展点：注册文案 / 订阅重绘 / 导航 / 可选项 */
    registerI18n: registerI18n,
    onRender: onRender,
    t: t,
    nav: uiNav,
    options: options,
    stepReady: stepReady,
    isConfirmOpen: function () { return pendingConfirm && !$('#modal').hidden; },
    /* 调试与自检接口：翻译表、翻译函数、语音文本，供自动化验证使用 */
    debug: { i18n: I18N, t: t, languages: LANGS, keys: Object.keys(I18N.zh), voiceOfStep: stepVoice, speechLang: SPEECH_LANG,
      persist: function () { return { font: read('xiaoyuer.font'), lang: read('xiaoyuer.lang') }; } }
  };

  /* ---------------- 启动 ---------------- */
  var savedLang = read('xiaoyuer.lang');
  if (savedLang && LANGS.indexOf(savedLang) >= 0) state.lang = savedLang;
  var savedFont = parseFloat(read('xiaoyuer.font') || '1');
  if (!isNaN(savedFont)) state.font = savedFont;

  $$('[data-lang-btn]').forEach(function (b) {
    b.setAttribute('aria-pressed', b.getAttribute('data-lang-btn') === state.lang ? 'true' : 'false');
  });
  applyFont();
  render();
  syncTopbar();
  resetIdle();

  var idleHelp = $('#idlebar-help');
  if (idleHelp) idleHelp.addEventListener('click', function () { helpDialog(); });
  var idleClose = $('#idlebar-close');
  if (idleClose) idleClose.addEventListener('click', function () { hideIdle(); resetIdle(); });

  if (speechSupported()) {
    window.speechSynthesis.onvoiceschanged = function () { /* 语音列表异步就绪，无需处理 */ };
  }
})();
