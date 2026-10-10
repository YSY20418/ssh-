/**
 * 浏览器内运行时（静态站点用）
 *
 * 静态导出（output: 'export'）后没有 Node 服务端，/api/* 接口不复存在。
 * 但本项目的引擎本来就是纯 TypeScript：会话状态机、风险裁决、脱敏、规则引擎
 * 全部不依赖 Node，因此可以在浏览器里原样跑起来。
 *
 * 关键点：**模型层自动降级**。浏览器里没有 LLM_API_KEY，`engineKind()` 会返回
 * 'rule'，于是走内置规则引擎——这与服务端"未配置密钥"时的行为完全一致，
 * 所以静态站的演示链路与服务端版本是同一条。
 *
 * 会话存储复用 lib/store.ts：它是一份纯内存状态机，在浏览器里天然是"每标签一份"，
 * 正合适，不需要另写一套。
 */

import { runAgent } from '../agents/engine';
import type { AgentEvent } from '../agents/events';
import { getSession, logAudit, resetSession, switchSite } from '../store';
import type { SessionState } from '../store';

/** 发起一次代驾（或授权后传空串续跑），产出与服务 SSE 完全相同的事件流 */
export async function* clientRun(
  sessionId: string,
  siteId: string,
  text: string,
): AsyncGenerator<AgentEvent> {
  const session = getSession(sessionId, siteId);
  // 复用同一会话但换了站点时，把会话切到目标站点（能力清单整体替换）
  if (siteId && session.siteId !== siteId) switchSite(session, siteId);
  yield* runAgent(session, text);
}

/** 授权 / 拒绝：语义与 /api/confirm 一致 */
export function clientConfirm(
  sessionId: string,
  siteId: string,
  actionId: string,
  grant: boolean,
): void {
  const session = getSession(sessionId, siteId);
  if (grant) {
    if (!session.granted.includes(actionId)) session.granted.push(actionId);
    logAudit(session, {
      actor: 'user',
      action: 'user.grant',
      detail: `人工授权执行高危动作 ${actionId}`,
      risk: 'high',
      masked: false,
    });
  } else {
    session.pending = null;
    logAudit(session, {
      actor: 'user',
      action: 'user.reject',
      detail: `人工拒绝执行高危动作 ${actionId}`,
      risk: 'high',
      masked: false,
    });
  }
}

/** 重置会话（切换站点、清空轨迹）；siteId 留空表示沿用当前站点 */
export function clientReset(sessionId: string, siteId?: string): SessionState {
  return resetSession(sessionId, siteId || undefined);
}

/** 在同一会话上换站点 */
export function clientSwitchSite(sessionId: string, siteId: string): SessionState {
  return switchSite(getSession(sessionId), siteId);
}

/** 审计日志（已是脱敏后的公开视图） */
export function clientAudit(sessionId: string, siteId: string) {
  const session = getSession(sessionId, siteId);
  return session.audit;
}
