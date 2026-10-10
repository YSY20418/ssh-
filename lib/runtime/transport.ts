/**
 * 统一数据通道（Transport）
 *
 * 同一个界面要能在两种形态下跑：
 *  - **服务端形态**（npm run dev / next start）：走 /api/* 接口，SSE 流式；
 *  - **静态形态**（output: 'export' 导出的纯静态站点）：没有服务端，
 *    直接在浏览器里调用同一份引擎（lib/runtime/client.ts）。
 *
 * 这里把两种形态的差异收敛到一个模块：界面只知道「我要跑一次代驾」，
 * 不关心事件是从网络流来的还是本地生成器产出的。两种形态产出的
 * AgentEvent 序列完全一致，因此同一套渲染与回放逻辑都能复用。
 *
 * 判定方式：构建时注入 NEXT_PUBLIC_STATIC=1，编译期即可确定，
 * 服务端形态不会把引擎代码打进客户端包，静态形态也不会去请求不存在的接口。
 */

import type { AgentEvent } from '../agents/events';
import type { RiskLevel } from '../sim/types';

/** 静态形态标记。构建期常量，打包器会据此裁剪分支。 */
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC === '1';

export interface EngineInfo {
  engine: string;
  model: string;
  provider: string;
}

export interface AuditView {
  sessionId: string;
  siteId?: string;
  siteName?: string;
  pageId?: string;
  steps?: number;
  granted?: string[];
  stats: Record<string, number>;
  entries: Array<{
    ts: number;
    time: string;
    actor: string;
    action: string;
    detail: string;
    risk: RiskLevel;
    masked: boolean;
  }>;
}

export interface McpView {
  server?: string;
  protocolVersion?: string;
  toolCount?: number;
  tools: Array<{ name: string; description: string; inputSchema?: unknown }>;
}

export interface EvalView {
  ok: boolean;
  generatedAt?: string | null;
  cases?: number;
  passed?: number;
  total?: number;
  rows?: Array<{
    id: string;
    site: string;
    type: string;
    passed: number;
    total: number;
    details: string[];
  }>;
  message?: string;
}

/** 引擎信息：静态形态恒为规则引擎（浏览器内不持有密钥） */
export async function fetchEngineInfo(): Promise<EngineInfo | null> {
  if (IS_STATIC) {
    const { engineKind } = await import('../agents/llm');
    const kind = engineKind();
    return {
      engine: kind,
      model: kind === 'llm' ? '在线模型' : '内置规则引擎',
      provider: kind === 'llm' ? '浏览器直连' : '本地（无需密钥）',
    };
  }
  try {
    const res = await fetch('/api/session');
    const d = (await res.json()) as { engine?: EngineInfo };
    return d.engine ?? null;
  } catch {
    return null;
  }
}

/** 跑一次代驾（或授权后续跑）：统一为 AsyncGenerator，逐事件产出 */
export async function* streamRun(args: {
  sessionId: string;
  siteId: string;
  message: string;
}): AsyncGenerator<AgentEvent> {
  if (IS_STATIC) {
    const { clientRun } = await import('./client');
    yield* clientRun(args.sessionId, args.siteId, args.message);
    return;
  }

  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: args.sessionId, message: args.message, siteId: args.siteId }),
  });
  if (!res.body) throw new Error('服务端未返回数据流');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith('data:')) continue;
      try {
        yield JSON.parse(line.slice(5).trim()) as AgentEvent;
      } catch {
        /* 忽略非法帧 */
      }
    }
  }
}

/** 人工授权 / 拒绝 */
export async function postConfirm(args: {
  sessionId: string;
  siteId: string;
  actionId: string;
  grant: boolean;
}): Promise<void> {
  if (IS_STATIC) {
    const { clientConfirm } = await import('./client');
    clientConfirm(args.sessionId, args.siteId, args.actionId, args.grant);
    return;
  }
  await fetch('/api/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: args.sessionId,
      actionId: args.actionId,
      grant: args.grant,
    }),
  });
}

/** 建会话 / 换站点 / 重置 */
export async function postSession(args: {
  sessionId: string;
  siteId?: string;
  reset?: boolean;
}): Promise<void> {
  if (IS_STATIC) {
    const { clientReset } = await import('./client');
    clientReset(args.sessionId, args.siteId ?? '');
    return;
  }
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

/** 审计日志（返回的本来就是写入时已脱敏的公开视图） */
export async function fetchAudit(sessionId: string): Promise<AuditView> {
  if (IS_STATIC) {
    const { clientAudit } = await import('./client');
    const { getSession } = await import('../store');
    const session = getSession(sessionId);
    const entries = clientAudit(sessionId, session.siteId).map((e) => ({
      ts: e.ts,
      time: new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false }),
      actor: e.actor,
      action: e.action,
      detail: e.detail,
      risk: e.risk,
      masked: e.masked,
    }));
    return {
      sessionId: session.id,
      siteId: session.siteId,
      pageId: session.pageId,
      steps: session.stepCount,
      granted: session.granted,
      stats: {
        total: entries.length,
        high: entries.filter((e) => e.risk === 'high').length,
        medium: entries.filter((e) => e.risk === 'medium').length,
        masked: entries.filter((e) => e.masked).length,
        granted: session.granted.length,
      },
      entries,
    };
  }
  const res = await fetch(`/api/audit?sessionId=${encodeURIComponent(sessionId)}`);
  const d = (await res.json()) as AuditView;
  return {
    sessionId: d.sessionId,
    siteId: d.siteId,
    siteName: d.siteName,
    pageId: d.pageId,
    steps: d.steps,
    granted: d.granted,
    stats: d.stats ?? {},
    entries: d.entries ?? [],
  };
}

/** MCP 工具清单：静态形态直接调用同一份 core，保证裁决规则不漂移 */
export async function fetchMcpTools(): Promise<McpView> {
  if (IS_STATIC) {
    const { toolsPayload, PROTOCOL_VERSION } = await import('../mcp/core');
    const tools = toolsPayload();
    return {
      server: 'webpilot-capability-server',
      protocolVersion: PROTOCOL_VERSION,
      toolCount: tools.length,
      tools: tools as McpView['tools'],
    };
  }
  const res = await fetch('/api/mcp');
  const d = (await res.json()) as McpView;
  return { server: d.server, protocolVersion: d.protocolVersion, toolCount: d.toolCount, tools: d.tools ?? [] };
}

/**
 * 评测结果。
 * 服务端形态读 scripts/eval-report.md；静态形态没有服务端，
 * 改为在浏览器里当场跑一遍自检（同一套引擎、同一套断言），结果结构一致。
 */
export async function fetchEval(): Promise<EvalView> {
  if (IS_STATIC) {
    const { runBrowserSelfCheck } = await import('./selfcheck');
    return runBrowserSelfCheck();
  }
  const res = await fetch('/api/eval');
  return (await res.json()) as EvalView;
}
