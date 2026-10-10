/** Agent 执行流的事件协议（服务端 → 前端 SSE） */

import type { RiskLevel } from '../sim/types';

export type AgentName = 'planner' | 'navigator' | 'guardian' | 'reporter';

export type AgentEvent =
  | { t: 'agent'; agent: AgentName; delta: string }
  | { t: 'agent_end'; agent: AgentName }
  | { t: 'tool'; name: string; args: string; result: string; risk: RiskLevel }
  | { t: 'page'; pageId: string; values: Record<string, string>; title: string }
  | { t: 'need_confirm'; actionId: string; label: string; reason: string }
  | { t: 'ask'; question: string }
  | { t: 'receipt'; receipt: Record<string, string> }
  | { t: 'done'; summary: string; engine: 'llm' | 'rule'; steps: number }
  /** 提示性事件：不中断流程，但需要在轨迹上留痕（如能力语义纠正） */
  | { t: 'notice'; text: string; tone: 'info' | 'warn' | 'error' | 'ok' }
  | { t: 'error'; message: string };

export function sse(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
