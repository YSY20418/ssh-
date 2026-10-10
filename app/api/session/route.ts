import { NextResponse } from 'next/server';
import { publicValues } from '@/lib/agents/engine';
import { modelInfo } from '@/lib/agents/llm';
import { getPage, getSite, listSites } from '@/lib/sim/registry';
import { createSession, getSession, resetSession, switchSite } from '@/lib/store';

/** GET /api/session?sessionId=xxx —— 查询会话状态；不带 sessionId 时返回站点目录 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get('sessionId')?.trim();

  if (!id) {
    return NextResponse.json({
      sites: listSites().map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        tagline: s.tagline,
        startPage: s.startPage,
        pages: s.pages.map((p) => p.id),
        examples: s.examples,
      })),
      defaultSiteId: getSite().id,
      // 引擎状态必须随目录一起下发：界面顶部的「在线模型 / 规则引擎兜底」标识依赖它，
      // 之前只在带 sessionId 的分支里才有，导致首屏永远显示「待运行」。
      engine: modelInfo(),
    });
  }

  const session = getSession(id);
  return NextResponse.json({
    id: session.id,
    siteId: session.siteId,
    siteName: getSite(session.siteId).name,
    pageId: session.pageId,
    title: getPage(session.siteId, session.pageId).title,
    values: publicValues(session),
    receipt: session.receipt,
    audit: session.audit.slice(-20),
    granted: session.granted,
    engine: modelInfo(),
  });
}

/**
 * POST /api/session
 * { sessionId, reset?: boolean, siteId?: string }
 * - reset 为真：重置会话
 * - 传 siteId：切换（或指定）目标站点，用于演示「同一套 Agent 换一个网站继续代驾」
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    reset?: boolean;
    siteId?: string;
  };
  const id = body.sessionId?.trim() || `s-${Date.now()}`;
  const siteId = body.siteId?.trim();

  let session = body.reset ? resetSession(id, siteId) : getSession(id, siteId);

  if (!body.reset && siteId && session.siteId !== siteId) {
    session = switchSite(session, siteId);
  }

  return NextResponse.json({
    id: session.id,
    siteId: session.siteId,
    siteName: getSite(session.siteId).name,
    pageId: session.pageId,
    title: getPage(session.siteId, session.pageId).title,
    values: publicValues(session),
    examples: getSite(session.siteId).examples,
  });
}
