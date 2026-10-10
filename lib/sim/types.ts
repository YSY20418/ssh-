/**
 * 被代驾站点的抽象契约
 *
 * 关键设计：一个站点不是一堆 DOM，而是一份「可插拔的能力声明」。
 * 只要实现了 SiteDef，任何网页流程都能被同一套 Agent 编排、同一套安全裁决、
 * 同一个 MCP 工具层驱动 —— 这是本项目「能力优先于 UI」理念落到代码上的地方。
 *
 * 也正是因为这个抽象，新增一个站点的成本只有「写一份站点定义」，
 * 不需要改动 Agent、不需要改动安全层、不需要改动前端渲染器。
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface FieldDef {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'tel' | 'idcard';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  /** 敏感字段：进入审计与脱敏链路 */
  sensitive?: boolean;
  risk?: RiskLevel;
}

export interface ActionDef {
  id: string;
  label: string;
  kind: 'nav' | 'submit';
  risk: RiskLevel;
  target?: string;
  requires?: string[];
}

export interface PageDef {
  id: string;
  title: string;
  subtitle: string;
  fields: FieldDef[];
  actions: ActionDef[];
}

/** Planner 的槽位抽取结果（LLM 与规则引擎共用同一结构） */
export interface SlotPlan {
  thought: string;
  plan: Record<string, string>;
  missing: string[];
  ask: string;
  stop: boolean;
}

export interface SiteDef {
  id: string;
  name: string;
  url: string;
  tagline: string;
  startPage: string;
  pages: PageDef[];
  /** 必须集齐才能开始代驾的字段 */
  requiredFields: string[];
  /** 顶部步骤条文案 */
  stepLabels: string[];
  /** 确认页要核对的行 */
  confirmRows: Array<{ label: string; key: string }>;
  /** 完成页回执要展示的行 */
  receiptRows: Array<{ label: string; key: string }>;
  /** 给老人看的示例话术 */
  examples: string[];
  /** 注入 Planner 提示词的领域约束 */
  domainHints: string;
  /** 高危提交动作 id，Guardian 据此强制人工授权 */
  submitActionId: string;
  /** 规则引擎路径下的槽位抽取（无密钥演示时接管） */
  extractSlots(text: string, known: Record<string, string>): SlotPlan;
  /** 生成业务回执 */
  buildReceipt(values: Record<string, string>): Record<string, string>;
}

export interface Capability {
  id: string;
  verb: 'fill' | 'click' | 'submit';
  target: string;
  label: string;
  risk: RiskLevel;
  params: string[];
  description: string;
}
