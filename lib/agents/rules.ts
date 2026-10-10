/**
 * 规则引擎（兜底 / 无密钥演示模式）
 *
 * 这不是「假 AI」，而是 Agent 系统在模型不可用时的降级链路：
 * 规划器退化为「站点自带的槽位抽取器」，导航器退化为通用状态机推进。
 * 与大模型的路径共用同一套能力清单与安全裁决，保证行为一致。
 *
 * 注意：导航器这一层是**站点无关**的通用状态机，
 * 具体领域知识被隔离在各站点的 extractSlots 里 —— 新增站点不需要动这里。
 */

import { getPage, getSite, listCapabilities } from '../sim/registry';
import type { SessionState } from '../store';
import type { SlotPlan } from '../sim/types';

export interface TaskPlan extends SlotPlan {}

export function rulePlan(siteId: string, userText: string, known: Record<string, string>): TaskPlan {
  return getSite(siteId).extractSlots(userText, known);
}

export interface RuleAction {
  thought: string;
  action: string;
  value: string | null;
  risk: 'low' | 'medium' | 'high';
}

/**
 * 通用状态机推进：在当前页面能力清单里挑出下一个应该执行的动作。
 * 规则对所有站点一致：先填本页计划内字段 → 必填齐全才翻页 → 末页提交。
 */
export function ruleNextAction(session: SessionState, plan: Record<string, string>): RuleAction | null {
  const site = getSite(session.siteId);
  const caps = listCapabilities(session.siteId, session.pageId);
  const page = getPage(session.siteId, session.pageId);

  for (const field of page.fields) {
    if (session.values[field.id]) continue;
    const planned = plan[field.id];
    if (!planned) continue;
    const cap = caps.find((c) => c.id === `fill:${field.id}`);
    if (!cap) continue;
    return {
      thought: `先把「${field.label}」填好：${planned}`,
      action: cap.id,
      value: planned,
      risk: cap.risk,
    };
  }

  const unfilled = page.fields.filter((f) => f.required && !session.values[f.id]);
  if (unfilled.length) {
    return {
      thought: `还差${unfilled.map((f) => f.label).join('、')}，先停下来问清楚。`,
      action: 'ask',
      value: null,
      risk: 'low',
    };
  }

  const next = caps.find((c) => c.id === 'click:next');
  if (next) {
    return { thought: '这一页填完了，进入下一步。', action: next.id, value: null, risk: next.risk };
  }

  const submit = caps.find((c) => c.id === `click:${site.submitActionId}`);
  if (submit) {
    return {
      thought: '信息核对无误，可以提交。这一步不能撤销，先请本人确认。',
      action: submit.id,
      value: null,
      risk: submit.risk,
    };
  }

  return null;
}
