/**
 * Guardian —— 安全与可控性策略层
 *
 * AI 安全与可控性要有硬实现，不能只是写在文档里。这里做了四件事：
 * 1. 动作风险分级（low / medium / high），高危动作必须人工授权才可落地；
 * 2. 敏感字段脱敏：真实值只存在于会话内存，审计日志与界面展示一律掩码；
 * 3. 提示词注入检测：用户输入中若夹带越权指令，在进入大模型前拦截；
 * 4. 兜底机制：步数上限、字段校验、失败可重试、无 Key 时降级为规则引擎。
 */

import type { RiskLevel } from '../sim/types';
import type { SessionState } from '../store';

export type Verdict =
  | { allowed: true; risk: RiskLevel; maskedValue?: string }
  | { allowed: false; reason: string; risk: RiskLevel }
  | { allowed: false; needConfirm: true; reason: string; risk: 'high' };

const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  // 中文越权指令：忽略/无视/忘记 + 若干字 + 指令/规则/设定（中间允许插入代词与修饰语）
  [/忽略[^。！？\n]{0,16}(指令|规则|设定|约束|要求)/i, '试图覆盖系统既定指令'],
  [/无视[^。！？\n]{0,16}(指令|规则|设定|约束|要求)/i, '试图覆盖系统既定指令'],
  [/忘(记|掉)[^。！？\n]{0,16}(指令|规则|设定|约束|要求|身份)/i, '试图覆盖系统既定指令'],
  [/不管[^。！？\n]{0,12}(指令|规则|设定|约束)/i, '试图覆盖系统既定指令'],
  [/不要(遵守|执行)[^。！？\n]{0,12}(指令|规则|设定)/i, '试图覆盖系统既定指令'],
  // 绕过安全机制：核心红线是「绕过人工授权门禁」
  [/绕过[^。！？\n]{0,10}(安全|限制|规则|审查|授权|确认)/i, '试图绕过安全机制'],
  [/跳过[^。！？\n]{0,10}(授权|确认|审核|安全|验证)/i, '试图绕过安全机制'],
  [/(不|无|免)用?[^。！？\n]{0,6}(授权|二次确认|确认后就|审核)/i, '试图跳过人工授权门禁'],
  [/不(需要|用)(再)?(我|本人)?[^。！？\n]{0,6}(授权|确认|许可)/i, '试图跳过人工授权门禁'],
  [/无需(我|本人)?[^。！？\n]{0,6}(授权|确认|许可)/i, '试图跳过人工授权门禁'],
  // 英文注入
  [/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|rules|prompts)/i, '提示词注入（英文）'],
  [/disregard\s+(all\s+)?(previous|prior)\s+instructions/i, '提示词注入（英文）'],
  [/bypass\s+(the\s+)?(safety|approval|confirmation|guard)/i, '提示词注入（英文）'],
  // 角色劫持 / 系统提示词套取
  [/你现在是|你现在扮演|你现在充当/i, '尝试进行角色劫持'],
  [/system\s*prompt|system\s*:|你收到的系统/i, '尝试套取系统提示词'],
  [/(输出|打印|泄露|告诉我)你(的)?(系统|初始)?(提示词|指令|规则)/i, '尝试套取系统提示词'],
  [/重复你(的)?(系统|初始)提示/i, '尝试套取系统提示词'],
  [/reveal\s+your\s+(system\s+)?prompt/i, '尝试套取系统提示词'],
  [/<\|.*?\|>/, '检测到特殊控制符'],
];

/** 语义兜底：夹带「系统提示词/越权」意图但正则未覆盖时，按关键词组合判定 */
const INJECTION_KEYWORDS: Array<[string, string, string]> = [
  ['系统提示', '输出', '尝试套取系统提示词'],
  ['系统提示', '重复', '尝试套取系统提示词'],
  ['提示词', '忽略', '试图覆盖系统既定指令'],
  ['指令', '忽略', '试图覆盖系统既定指令'],
  ['授权', '不用', '试图跳过人工授权门禁'],
  ['授权', '跳过', '试图跳过人工授权门禁'],
];

export function detectInjection(text: string): string | null {
  for (const [p, why] of INJECTION_PATTERNS) {
    if (p.test(text)) return `${why}，已阻止其进入大模型`;
  }
  for (const [a, b, why] of INJECTION_KEYWORDS) {
    if (text.includes(a) && text.includes(b)) return `${why}，已阻止其进入大模型`;
  }
  return null;
}

/** 敏感值脱敏：身份证保留前 6 后 4，手机号保留前 3 后 4 */
export function maskValue(fieldId: string, value: string): string {
  if (fieldId === 'idCard') {
    if (value.length <= 10) return '****';
    return `${value.slice(0, 6)}********${value.slice(-4)}`;
  }
  if (fieldId === 'phone') {
    if (value.length <= 7) return '****';
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
  }
  return value;
}

const SENSITIVE_FIELDS = new Set(['idCard', 'phone']);

export function isSensitive(fieldId: string): boolean {
  return SENSITIVE_FIELDS.has(fieldId);
}

const ID_CARD_RE = /^\d{17}[\dXx]$/;
const PHONE_RE = /^1[3-9]\d{9}$/;

export interface ValidateResult {
  ok: boolean;
  message?: string;
}

export function validateField(fieldId: string, value: string): ValidateResult {
  if (fieldId === 'idCard' && !ID_CARD_RE.test(value)) {
    return { ok: false, message: '身份证号需为 18 位，最后一位可为 X' };
  }
  if (fieldId === 'phone' && !PHONE_RE.test(value)) {
    return { ok: false, message: '手机号需为 11 位中国大陆号码' };
  }
  if (!value || !value.trim()) {
    return { ok: false, message: '内容不能为空' };
  }
  return { ok: true };
}

/**
 * 执行前裁决：返回一个动作能否落地。
 */
export function authorize(
  session: SessionState,
  action: { id: string; risk: RiskLevel; label: string },
): Verdict {
  if (action.risk === 'high') {
    if (session.granted.includes(action.id)) {
      return { allowed: true, risk: 'high' };
    }
    return {
      allowed: false,
      needConfirm: true,
      risk: 'high',
      reason: `「${action.label}」属于不可撤销的高风险动作，需要本人（或家属）明确授权后才能执行`,
    };
  }
  return { allowed: true, risk: action.risk };
}

/**
 * 自由文本脱敏：审计日志会记录用户原话，而老人口语里常常直接报出身份证和手机号。
 * 只按已知会话字段替换是不够的（模型还没抽取出来时值就已经进日志了），
 * 因此这里对任意文本做模式级脱敏，保证「日志里永远没有明文」。
 */
const FREE_ID_RE = /\d{17}[\dXx]/g;
const FREE_PHONE_RE = /1[3-9]\d{9}/g;

export function maskFreeText(text: string): string {
  return text
    .replace(FREE_ID_RE, (m) => `${m.slice(0, 6)}********${m.slice(-4)}`)
    .replace(FREE_PHONE_RE, (m) => `${m.slice(0, 3)}****${m.slice(-4)}`);
}

/** 输出侧兜底过滤：回执文本中不得出现未脱敏的敏感值 */
export function redactSecrets(text: string, session: SessionState): string {
  let out = text;
  for (const [k, v] of Object.entries(session.values)) {
    if (!isSensitive(k) || !v) continue;
    out = out.split(v).join(maskValue(k, v));
  }
  return out;
}
