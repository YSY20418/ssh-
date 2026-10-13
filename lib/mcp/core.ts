/**
 * MCP 能力服务器的核心逻辑（与传输方式无关）
 *
 * 抽出来的理由：同一套能力清单与安全裁决，既要服务 /api/mcp（Node 服务端），
 * 也要在静态站点里被浏览器端直接调用。若写两份，规则迟早会漂移——
 * 「MCP 通道与内置 Agent 走同一套裁决」这条约束就会失效。
 *
 * 因此这里只依赖纯内存模块（registry / store / guardian / engine），
 * 不碰 Request / Response，两端共用。
 */

import { describeMatch, matchCapability } from '../agents/capmatch';
import { executeCapability, publicValues } from '../agents/engine';
import { getSite, listAllCapabilities, listCapabilities, listSites } from '../sim/registry';
import { authorize } from '../safety/guardian';
import { getSession, logAudit } from '../store';
import type { Capability } from '../sim/types';

export const PROTOCOL_VERSION = '2025-06-18';

export function toolNameOf(siteId: string, cap: Capability): string {
  return `${siteId}__${cap.id.replace(':', '_')}`;
}

export function parseToolName(name: string): { siteId: string; capId: string } | null {
  const idx = name.indexOf('__');
  if (idx <= 0) return null;
  const siteId = name.slice(0, idx);
  const rest = name.slice(idx + 2);
  const u = rest.indexOf('_');
  if (u <= 0) return null;
  const verb = rest.slice(0, u);
  const target = rest.slice(u + 1);
  if (!['fill', 'click', 'submit'].includes(verb)) return null;
  return { siteId, capId: `${verb}:${target}` };
}

export function toolsPayload() {
  const tools: Array<Record<string, unknown>> = [];
  for (const site of listSites()) {
    for (const cap of listAllCapabilities(site.id)) {
      const isFill = cap.verb === 'fill';
      tools.push({
        name: toolNameOf(site.id, cap),
        description: `[${site.name}｜${cap.pageTitle}] ${cap.label}。${cap.description}。风险等级：${
          cap.risk === 'high' ? '高（需人工授权）' : cap.risk === 'medium' ? '中（值会脱敏）' : '低'
        }`,
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '代驾会话 ID，同一会话内页面状态会持续推进' },
            pageId: {
              type: 'string',
              description: `目标页面 id，可选值：${site.pages.map((p) => p.id).join(' / ')}；留空则用会话当前页`,
            },
            ...(isFill
              ? { value: { type: 'string', description: '要填写的内容，必须是选项原文或合法格式' } }
              : {}),
          },
          required: ['sessionId'],
        },
      });
    }
  }
  return tools;
}

export function rpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

export function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

export function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

export function handleCall(params: Record<string, unknown>) {
  const name = String(params.name ?? '');
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const parsed = parseToolName(name);
  if (!parsed) {
    return textResult({ ok: false, message: `工具名无法解析：${name}` }, true);
  }

  const site = getSite(parsed.siteId);
  const sessionId = String(args.sessionId ?? 'mcp-default').trim() || 'mcp-default';
  const session = getSession(sessionId, site.id);
  const pageId = String(args.pageId ?? session.pageId);

  const caps = listCapabilities(site.id, pageId);
  const cap = caps.find((c) => c.id === parsed.capId) ?? null;

  if (!cap) {
    // 与编排引擎同一套语义检索：形近的工具名先找最接近的能力。
    // 注意——检索只负责「召回建议」，MCP 通道同样不自动执行，
    // 必须由调用方显式用正确名称重试，避免「猜一个就替用户点了」。
    const hit = matchCapability(parsed.capId, caps);
    return textResult(
      {
        ok: false,
        message: `能力 ${parsed.capId} 不在页面 ${pageId} 的能力清单内，已被拦截（防幻觉闸门）`,
        suggestion: hit
          ? { id: hit.id, label: hit.label, score: Number(hit.score.toFixed(2)), confident: hit.confident }
          : null,
        hint: hit ? describeMatch(hit) : null,
        available: caps.map((c) => c.id),
      },
      true,
    );
  }

  const verdict = authorize(session, { id: cap.id, risk: cap.risk, label: cap.label });
  if (!verdict.allowed) {
    if ('needConfirm' in verdict && verdict.needConfirm) {
      session.pending = cap.id;
      return textResult(
        {
          ok: false,
          needConfirm: true,
          message: verdict.reason,
          hint: '高危动作需人工授权：授予后重新调用本工具即可执行',
        },
        true,
      );
    }
    return textResult({ ok: false, message: verdict.reason }, true);
  }

  const value = args.value === undefined ? null : String(args.value);
  const result = executeCapability(session, cap, value);
  session.pending = null;
  logAudit(session, {
    actor: 'system',
    action: 'mcp.call',
    detail: `MCP 客户端调用 ${name}：${result.message}`,
    risk: cap.risk,
    masked: cap.risk === 'medium',
  });

  return textResult({
    ok: result.ok,
    message: result.message,
    siteId: site.id,
    pageId: session.pageId,
    values: publicValues(session),
    receipt: session.receipt ?? null,
  });
}

/** JSON-RPC 方法分发（服务端与浏览器端共用一份） */
export function dispatch(method: string, id: unknown, params: Record<string, unknown>) {
  switch (method) {
    case 'initialize':
      return rpc(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'webpilot-capability-server', version: '1.0.0' },
        instructions:
          '小鱼儿 能力服务器。工具来自被代驾网页自行声明的能力清单，高危动作需人工授权后重试。',
      });
    case 'notifications/initialized':
    case 'ping':
      return rpc(id, {});
    case 'tools/list':
      return rpc(id, { tools: toolsPayload() });
    case 'tools/call':
      return rpc(id, handleCall(params));
    default:
      return rpcError(id, -32601, `不支持的方法：${method}`);
  }
}
