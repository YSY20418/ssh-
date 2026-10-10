/**
 * 站点一：市第一人民医院 · 预约挂号
 *
 * 设计要点（对应能力优先于 UI的 Agentic Web 理念）：
 * 1. 站点不只是 DOM，而是把每个可操作单元声明为「能力」（Capability），
 *    能力带 id / 中文语义标签 / 风险等级 / 入参出参，等价于对外暴露的 MCP 工具清单。
 * 2. 每个可交互元素都具备 aria-label 与稳定 data-cap-id，
 *    保证 Agent 不是靠猜 DOM，而是按能力契约执行。
 * 3. 敏感字段（身份证、手机号）标记为 sensitive，进入审计与脱敏链路。
 */

import { retrieve } from '../rag/guides';
import type { SiteDef, SlotPlan } from './types';

/** 症状 → 科室 的兜底映射（LLM 路径下由 RAG 检索增强，此为规则引擎路径） */
const SYMPTOM_TO_DEPT: Array<{ keywords: string[]; dept: string }> = [
  { keywords: ['膝盖', '关节', '腰', '腿', '骨', '扭伤', '骨折', '上下楼'], dept: '骨科' },
  { keywords: ['头晕', '血压', '血糖', '咳嗽', '发烧', '腹痛', '心慌', '胸闷', '糖尿病', '高血压', '肚子'], dept: '内科' },
  { keywords: ['眼睛', '视物', '模糊', '白内障', '飞蚊'], dept: '眼科' },
  { keywords: ['牙', '口腔', '牙龈', '补牙', '拔牙'], dept: '口腔科' },
  { keywords: ['孩子', '小孩', '儿童', '宝宝', '女儿', '儿子'], dept: '儿科' },
  { keywords: ['外伤', '包扎', '缝合', '换药'], dept: '外科' },
];

const DEPTS = ['内科', '外科', '儿科', '骨科', '眼科', '口腔科'];

function guessDept(text: string): { dept: string; evidence: string } | null {
  for (const item of SYMPTOM_TO_DEPT) {
    for (const kw of item.keywords) {
      if (text.includes(kw)) {
        const hits = retrieve(`症状 ${kw} 挂什么科`, 1);
        return {
          dept: item.dept,
          evidence: hits[0] ? `查到办事指南《${hits[0].chunk.title}》` : `关键词「${kw}」`,
        };
      }
    }
  }
  const direct = DEPTS.find((d) => text.includes(d));
  if (direct) return { dept: direct, evidence: '您直接说了科室' };
  return null;
}

function extractSlots(text: string, known: Record<string, string>): SlotPlan {
  const plan: Record<string, string> = { ...known };

  const dept = guessDept(text);
  if (dept && !plan.department) plan.department = dept.dept;

  if (!plan.doctorType) {
    plan.doctorType = /专家|主任/.test(text)
      ? '专家门诊'
      : /普通/.test(text)
        ? '普通门诊'
        : '不指定医生';
  }
  if (!plan.visitDate) {
    plan.visitDate = ['今天', '明天', '后天'].find((d) => text.includes(d)) ?? '明天';
  }
  if (!plan.visitSlot) {
    plan.visitSlot = /下午|午后/.test(text) ? '下午 13:30-17:00' : '上午 08:00-12:00';
  }

  const nameMatch = text.match(/(?:我叫|名字是|姓名|就诊人(?:是)?|给)\s*([一-龥]{2,4})/);
  if (nameMatch && !plan.patientName) plan.patientName = nameMatch[1];
  const idMatch = text.match(/\d{17}[\dXx]/);
  if (idMatch && !plan.idCard) plan.idCard = idMatch[0];
  const phoneMatch = text.match(/1[3-9]\d{9}/);
  if (phoneMatch && !plan.phone) plan.phone = phoneMatch[0];

  const required = ['patientName', 'idCard', 'phone'];
  const missing = required.filter((k) => !plan[k]);

  let ask = '';
  if (missing.includes('patientName')) ask = '请问去看病的是谁呀？';
  else if (missing.includes('idCard')) ask = '还需要就诊人的身份证号。';
  else if (missing.includes('phone')) ask = '再留一个能收到短信的手机号好吗？';
  else if (!plan.department) ask = '您哪里不舒服？我帮您看看挂哪个科。';

  return {
    thought: dept
      ? `听懂了：${dept.evidence}，帮您挂${plan.department}。`
      : '先补齐必要信息，再开始代驾。',
    plan,
    missing,
    ask,
    stop: missing.length > 0 || !plan.department,
  };
}

export const HOSPITAL: SiteDef = {
  id: 'city-hospital',
  name: '市第一人民医院 · 预约挂号',
  url: 'https://hospital.example.gov.cn/appointment',
  tagline: '网上预约挂号平台',
  startPage: 'dept',
  requiredFields: ['patientName', 'idCard', 'phone', 'department'],
  stepLabels: ['选择科室', '选择时间', '填写就诊人', '确认提交'],
  confirmRows: [
    { label: '就诊人', key: 'patientName' },
    { label: '就诊科室', key: 'department' },
    { label: '医生类型', key: 'doctorType' },
    { label: '就诊日期', key: 'visitDate' },
    { label: '就诊时段', key: 'visitSlot' },
  ],
  receiptRows: [
    { label: '预约号', key: 'bookingNo' },
    { label: '就诊人', key: 'patientName' },
    { label: '科室', key: 'department' },
    { label: '医生类型', key: 'doctorType' },
    { label: '就诊日期', key: 'visitDate' },
    { label: '就诊时段', key: 'visitSlot' },
  ],
  examples: [
    '我这两天膝盖上下楼疼，想明天上午去医院看看',
    '我叫张桂芳，身份证110105195003071234，手机13800138000',
    '帮我挂个内科，明天下午',
  ],
  domainHints:
    '科室只能从「内科/外科/儿科/骨科/眼科/口腔科」中选；日期保留「今天/明天/后天」原样；时段只有上午与下午两种；医生类型只有三种。',
  submitActionId: 'submitBooking',
  extractSlots,
  buildReceipt(values) {
    return {
      bookingNo: `YY${Math.floor(100000 + Math.random() * 900000)}`,
      patientName: values.patientName ?? '',
      department: values.department ?? '',
      doctorType: values.doctorType ?? '',
      visitDate: values.visitDate ?? '',
      visitSlot: values.visitSlot ?? '',
      hospital: '市第一人民医院',
      queueTip: '请于就诊当日提前 30 分钟，到门诊一楼银发服务台取号。',
      cancelTip: '就诊前一天 17:00 前可免费退号或改约。',
    };
  },
  pages: [
    {
      id: 'dept',
      title: '选择科室',
      subtitle: '第 1 步 / 共 4 步',
      fields: [
        {
          id: 'department',
          label: '就诊科室',
          type: 'select',
          options: DEPTS,
          required: true,
          risk: 'low',
        },
        {
          id: 'doctorType',
          label: '医生类型',
          type: 'select',
          options: ['不指定医生', '普通门诊', '专家门诊'],
          required: true,
          risk: 'low',
        },
      ],
      actions: [
        { id: 'next', label: '下一步', kind: 'nav', target: 'time', risk: 'low', requires: ['department', 'doctorType'] },
      ],
    },
    {
      id: 'time',
      title: '选择时间',
      subtitle: '第 2 步 / 共 4 步',
      fields: [
        { id: 'visitDate', label: '就诊日期', type: 'date', options: ['今天', '明天', '后天'], required: true, risk: 'low' },
        {
          id: 'visitSlot',
          label: '就诊时段',
          type: 'select',
          options: ['上午 08:00-12:00', '下午 13:30-17:00'],
          required: true,
          risk: 'low',
        },
      ],
      actions: [
        { id: 'back', label: '上一步', kind: 'nav', target: 'dept', risk: 'low' },
        { id: 'next', label: '下一步', kind: 'nav', target: 'info', risk: 'low', requires: ['visitDate', 'visitSlot'] },
      ],
    },
    {
      id: 'info',
      title: '填写就诊人',
      subtitle: '第 3 步 / 共 4 步',
      fields: [
        { id: 'patientName', label: '就诊人姓名', type: 'text', placeholder: '请输入真实姓名', required: true, risk: 'low' },
        { id: 'idCard', label: '身份证号', type: 'idcard', placeholder: '18 位身份证号', required: true, sensitive: true, risk: 'medium' },
        { id: 'phone', label: '手机号', type: 'tel', placeholder: '接收就诊通知', required: true, sensitive: true, risk: 'medium' },
      ],
      actions: [
        { id: 'back', label: '上一步', kind: 'nav', target: 'time', risk: 'low' },
        { id: 'next', label: '下一步', kind: 'nav', target: 'confirm', risk: 'low', requires: ['patientName', 'idCard', 'phone'] },
      ],
    },
    {
      id: 'confirm',
      title: '确认预约信息',
      subtitle: '第 4 步 / 共 4 步',
      fields: [],
      actions: [
        { id: 'back', label: '上一步', kind: 'nav', target: 'info', risk: 'low' },
        { id: 'submitBooking', label: '确认预约并提交', kind: 'submit', risk: 'high', target: 'done' },
      ],
    },
    {
      id: 'done',
      title: '预约成功',
      subtitle: '已完成',
      fields: [],
      actions: [{ id: 'restart', label: '再约一次', kind: 'nav', target: 'dept', risk: 'low' }],
    },
  ],
};
