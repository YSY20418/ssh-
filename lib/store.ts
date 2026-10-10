/**
 * 会话级页面状态机（服务端单例）
 *
 * 被代驾站点的真实状态保存在服务端，Agent 在服务端直接操作状态机，
 * 前端 iframe 只负责渲染与回放 —— 这样 Agent 的动作是可审计、可回放、可回滚的。
 */

import { DEFAULT_SITE_ID, getPage, getSite } from './sim/registry';

export interface AuditEntry {
  ts: number;
  actor: 'user' | 'agent' | 'guardian' | 'system';
  action: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  /** 敏感值是否已脱敏存储 */
  masked: boolean;
}

export interface SessionState {
  id: string;
  siteId: string;
  pageId: string;
  /** 页面实际已填写的值（Agent 操作的结果） */
  values: Record<string, string>;
  /** 已从对话中收集到、但尚未填进页面的值 */
  collected: Record<string, string>;
  audit: AuditEntry[];
  /** 已被人工授权的高危动作 id */
  granted: string[];
  /** 当前等待人工授权的动作 id */
  pending: string | null;
  /** 提交后生成的业务回执 */
  receipt: Record<string, string> | null;
  /**
   * 自我反思记录：每一步失败的原因。
   * 智能体下一次决策时会读到它们，从而换策略而不是原地重试同一条死路 ——
   * 这是「自主决策能力」的证据，也让失败可解释。
   */
  reflections: string[];
  createdAt: number;
  stepCount: number;
}

const MAX_STEPS = 24;

type Store = Map<string, SessionState>;

const globalRef = globalThis as unknown as { __webpilotStore?: Store };
const sessions: Store = globalRef.__webpilotStore ?? new Map();
globalRef.__webpilotStore = sessions;

export function createSession(id: string, siteId: string = DEFAULT_SITE_ID): SessionState {
  const site = getSite(siteId);
  const session: SessionState = {
    id,
    siteId: site.id,
    pageId: site.startPage,
    values: {},
    collected: {},
    audit: [
      {
        ts: Date.now(),
        actor: 'system',
        action: 'session.create',
        detail: `创建代驾会话，目标站点 ${site.name}`,
        risk: 'low',
        masked: false,
      },
    ],
    granted: [],
    pending: null,
    receipt: null,
    createdAt: Date.now(),
    stepCount: 0,
    reflections: [],
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string, siteId?: string): SessionState {
  const existing = sessions.get(id);
  if (existing) return existing;
  return createSession(id, siteId ?? DEFAULT_SITE_ID);
}

export function resetSession(id: string, siteId?: string): SessionState {
  const nextSite = siteId ?? sessions.get(id)?.siteId ?? DEFAULT_SITE_ID;
  sessions.delete(id);
  return createSession(id, nextSite);
}

/** 切换会话的目标站点（能力协议跨站点复用演示用） */
export function switchSite(session: SessionState, siteId: string): SessionState {
  const site = getSite(siteId);
  session.siteId = site.id;
  session.pageId = site.startPage;
  session.values = {};
  session.collected = {};
  session.receipt = null;
  session.pending = null;
  session.granted = [];
  session.stepCount = 0;
  logAudit(session, {
    actor: 'system',
    action: 'session.switchSite',
    detail: `切换目标站点为 ${site.name}（能力清单整体替换，Agent 与安全策略不变）`,
    risk: 'low',
    masked: false,
  });
  return session;
}

export function logAudit(
  session: SessionState,
  entry: Omit<AuditEntry, 'ts'>,
): void {
  session.audit.push({ ...entry, ts: Date.now() });
}

export function canStep(session: SessionState): boolean {
  return session.stepCount < MAX_STEPS;
}

export function bumpStep(session: SessionState): void {
  session.stepCount += 1;
}

export function missingRequired(session: SessionState): string[] {
  const page = getPage(session.siteId, session.pageId);
  return page.fields
    .filter((f) => f.required && !session.values[f.id])
    .map((f) => f.id);
}
