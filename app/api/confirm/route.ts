import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/store';
import { getSession } from '@/lib/store';

/**
 * 人工授权：把高危动作加入白名单后，Agent 才会继续执行。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; actionId?: string; grant?: boolean };
  const sessionId = body.sessionId?.trim() || 'default';
  const actionId = body.actionId?.trim();
  const grant = body.grant !== false;

  if (!actionId) return NextResponse.json({ error: '缺少 actionId' }, { status: 400 });

  const session = getSession(sessionId);
  if (grant) {
    if (!session.granted.includes(actionId)) session.granted.push(actionId);
    // 保留 pending，由引擎下一轮判定「已授权并续跑」
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

  return NextResponse.json({ ok: true, granted: session.granted });
}
