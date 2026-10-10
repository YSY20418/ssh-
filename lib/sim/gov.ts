/**
 * 站点二：市民之家 · 医保缴费
 *
 * 存在的意义是证明「能力协议可跨站点复用」：
 * 这个站点的业务流程、字段、领域知识与医院挂号完全不同，
 * 但接入的是同一套 Planner / Navigator / Guardian / Reporter 编排，
 * 同一份安全裁决策略，同一个 MCP 工具层 —— 新增它只写了一份站点定义。
 */

import type { SiteDef, SlotPlan } from './types';

const BIZ_TYPES = ['城乡居民基本医疗保险缴费', '城乡居民基本养老保险缴费'];
const YEARS = ['2026 年度', '2027 年度'];
const LEVELS = ['一档 ¥380', '二档 ¥680'];

function amountOf(level: string): string {
  const m = level.match(/¥\s*(\d+)/);
  return m ? m[1] : '380';
}

function extractSlots(text: string, known: Record<string, string>): SlotPlan {
  const plan: Record<string, string> = { ...known };

  if (!plan.bizType) {
    if (/养老/.test(text)) plan.bizType = BIZ_TYPES[1];
    else if (/医保|医疗|保险|看病报销/.test(text)) plan.bizType = BIZ_TYPES[0];
    else plan.bizType = BIZ_TYPES[0];
  }

  if (!plan.year) {
    const ym = text.match(/(20\d{2})\s*年/);
    if (ym && YEARS.some((y) => y.startsWith(ym[1]))) plan.year = `${ym[1]} 年度`;
    else plan.year = /明年|来年/.test(text) ? '2027 年度' : '2026 年度';
  }

  if (!plan.level) {
    plan.level = /二档|680/.test(text) ? LEVELS[1] : LEVELS[0];
  }

  const nameMatch = text.match(/(?:我叫|名字是|姓名|参保人(?:是)?|给|帮)\s*([一-龥]{2,4})/);
  if (nameMatch && !plan.patientName) plan.patientName = nameMatch[1];
  const idMatch = text.match(/\d{17}[\dXx]/);
  if (idMatch && !plan.idCard) plan.idCard = idMatch[0];
  const phoneMatch = text.match(/1[3-9]\d{9}/);
  if (phoneMatch && !plan.phone) plan.phone = phoneMatch[0];

  const required = ['patientName', 'idCard', 'phone'];
  const missing = required.filter((k) => !plan[k]);

  let ask = '';
  if (missing.includes('patientName')) ask = '请问是给谁交呀？';
  else if (missing.includes('idCard')) ask = '还需要参保人的身份证号。';
  else if (missing.includes('phone')) ask = '留个手机号，到账了给您发短信。';

  return {
    thought: `听懂了：帮您办「${plan.bizType}」，${plan.year}，${plan.level}。`,
    plan,
    missing,
    ask,
    stop: missing.length > 0,
  };
}

export const GOV: SiteDef = {
  id: 'citizen-hall',
  name: '市民之家 · 医保社保缴费',
  url: 'https://zwfw.example.gov.cn/medical-pay',
  tagline: '政务服务网上办事大厅',
  startPage: 'biz',
  requiredFields: ['patientName', 'idCard', 'phone', 'bizType'],
  stepLabels: ['选择事项', '填写参保人', '核对金额', '完成缴费'],
  confirmRows: [
    { label: '参保人', key: 'patientName' },
    { label: '办理事项', key: 'bizType' },
    { label: '缴费年度', key: 'year' },
    { label: '缴费档次', key: 'level' },
    { label: '应收金额', key: 'amount' },
  ],
  receiptRows: [
    { label: '缴费订单号', key: 'orderNo' },
    { label: '参保人', key: 'patientName' },
    { label: '办理事项', key: 'bizType' },
    { label: '缴费年度', key: 'year' },
    { label: '缴费档次', key: 'level' },
    { label: '实付金额', key: 'amount' },
  ],
  examples: [
    '帮我交一下 2027 年的医保，一档',
    '我叫李秀英，身份证110105195208123456，手机13900139000',
    '给我老伴交明年的医保',
  ],
  domainHints:
    '办理事项只有「城乡居民基本医疗保险缴费」与「城乡居民基本养老保险缴费」两种；缴费年度只有 2026 与 2027；档次只有「一档 ¥380」与「二档 ¥680」。金额由档次决定，不得自行计算。',
  submitActionId: 'submitPay',
  extractSlots,
  buildReceipt(values) {
    return {
      orderNo: `JF${Math.floor(100000 + Math.random() * 900000)}`,
      patientName: values.patientName ?? '',
      bizType: values.bizType ?? '',
      year: values.year ?? '',
      level: values.level ?? '',
      amount: `¥${amountOf(values.level ?? LEVELS[0])}.00`,
      payTip: '已从参保人绑定的社保卡账户扣款，电子票据可在「我的办件」查看。',
      windowTip: '如需纸质凭证，可到市民之家一楼自助机打印。',
    };
  },
  pages: [
    {
      id: 'biz',
      title: '选择办理事项',
      subtitle: '第 1 步 / 共 3 步',
      fields: [
        { id: 'bizType', label: '办理事项', type: 'select', options: BIZ_TYPES, required: true, risk: 'low' },
        { id: 'year', label: '缴费年度', type: 'select', options: YEARS, required: true, risk: 'low' },
        { id: 'level', label: '缴费档次', type: 'select', options: LEVELS, required: true, risk: 'low' },
      ],
      actions: [
        { id: 'next', label: '下一步', kind: 'nav', target: 'person', risk: 'low', requires: ['bizType', 'year', 'level'] },
      ],
    },
    {
      id: 'person',
      title: '填写参保人信息',
      subtitle: '第 2 步 / 共 3 步',
      fields: [
        { id: 'patientName', label: '参保人姓名', type: 'text', placeholder: '请输入参保人姓名', required: true, risk: 'low' },
        { id: 'idCard', label: '身份证号', type: 'idcard', placeholder: '18 位身份证号', required: true, sensitive: true, risk: 'medium' },
        { id: 'phone', label: '手机号', type: 'tel', placeholder: '接收缴费到账通知', required: true, sensitive: true, risk: 'medium' },
      ],
      actions: [
        { id: 'back', label: '上一步', kind: 'nav', target: 'biz', risk: 'low' },
        { id: 'next', label: '下一步', kind: 'nav', target: 'confirm', risk: 'low', requires: ['patientName', 'idCard', 'phone'] },
      ],
    },
    {
      id: 'confirm',
      title: '核对并缴费',
      subtitle: '第 3 步 / 共 3 步',
      fields: [],
      actions: [
        { id: 'back', label: '上一步', kind: 'nav', target: 'person', risk: 'low' },
        { id: 'submitPay', label: '确认缴费', kind: 'submit', risk: 'high', target: 'done' },
      ],
    },
    {
      id: 'done',
      title: '缴费成功',
      subtitle: '已完成',
      fields: [],
      actions: [{ id: 'restart', label: '再办一件', kind: 'nav', target: 'biz', risk: 'low' }],
    },
  ],
};
