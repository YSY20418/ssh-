/**
 * MCP 服务端（JSON-RPC 2.0 over HTTP）
 *
 * 这一层把「网页能力清单」直接暴露为标准 MCP 工具，
 * 因此任何支持 MCP 的客户端（Claude Desktop、Cursor、自建 Agent）都能驱动被代驾的网页，
 * 而不必经过本项目自带的编排器。
 *
 * 关键约束：MCP 入口与内置 Agent 走**同一套能力清单与同一套安全裁决**，
 * 外部客户端同样无法凭空调用不存在的动作，高危动作同样必须人工授权。
 *
 * 协议实现在 `lib/mcp/core.ts`，与传输方式无关——静态站点里的浏览器端调用的是同一份，
 * 保证两条通道的裁决规则不会漂移。
 */

import { NextResponse } from 'next/server';
import { dispatch, PROTOCOL_VERSION, rpcError, toolsPayload } from '@/lib/mcp/core';
import { listSites } from '@/lib/sim/registry';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'JSON 解析失败'), { status: 400 });
  }

  const { id, method, params = {} } = body;
  return NextResponse.json(dispatch(String(method ?? ''), id, params));
}

/** GET：给外部客户端与演示用的自描述清单（无需 MCP 客户端即可查看） */
export async function GET() {
  const tools = toolsPayload();
  return NextResponse.json({
    server: 'webpilot-capability-server',
    protocolVersion: PROTOCOL_VERSION,
    endpoint: '/api/mcp',
    transport: 'JSON-RPC 2.0 over HTTP POST',
    sites: listSites().map((s) => ({ id: s.id, name: s.name, pages: s.pages.map((p) => p.id) })),
    toolCount: tools.length,
    tools,
    example: {
      initialize: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      listTools: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      callTool: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'city-hospital__fill_department',
          arguments: { sessionId: 'demo', value: '骨科' },
        },
      },
    },
  });
}
