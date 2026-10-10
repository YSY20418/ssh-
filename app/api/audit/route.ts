/**
 * GET /api/audit?sessionId=xxx
 *
 * 把会话的可审计轨迹原样吐给前端展示。
 * 注意：这里返回的 audit 条目**本来就是脱敏后写入的**（敏感值在 logAudit 时已掩码），
 * 所以这个端点不需要再做一次脱敏 —— 它展示的正是「审计者真正能看到的东西」。
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/store';
import { getSite } from '@/lib/sim/registry';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('sessionId')?.trim() || 'default';
  const session = getSession(id);
  const site = getSite(session.siteId);

  const entries = session.audit.map((e) => ({
    ts: e.ts,
    time: new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false }),
    actor: e.actor,
    action: e.action,
    detail: e.detail,
    risk: e.risk,
    masked: e.masked,
  }));

  return NextResponse.json({
    sessionId: session.id,
    siteId: session.siteId,
    siteName: site.name,
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
  });
}
