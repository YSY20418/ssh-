import { NextResponse } from 'next/server';
import { runAgent, publicValues } from '@/lib/agents/engine';
import { sse } from '@/lib/agents/events';
import { getPage } from '@/lib/sim/registry';
import { getSession } from '@/lib/store';

export const maxDuration = 60;

export async function POST(req: Request) {
  let sessionId = 'default';
  let message = '';
  let siteId: string | undefined;

  try {
    const body = (await req.json()) as { sessionId?: string; message?: string; siteId?: string };
    sessionId = body.sessionId?.trim() || 'default';
    message = (body.message ?? '').trim();
    siteId = body.siteId?.trim() || undefined;
  } catch {
    return NextResponse.json({ error: '请求体解析失败' }, { status: 400 });
  }

  const session = getSession(sessionId, siteId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      try {
        // 首帧同步一次页面状态，保证 iframe 与服务端一致
        send(
          sse({
            t: 'page',
            pageId: session.pageId,
            values: publicValues(session),
            title: getPage(session.siteId, session.pageId).title,
          }),
        );
        for await (const event of runAgent(session, message)) {
          send(sse(event));
        }
      } catch (err) {
        send(sse({ t: 'error', message: err instanceof Error ? err.message : '代驾过程发生异常' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
