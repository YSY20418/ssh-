/**
 * 四智能体编排引擎
 *
 * Planner   —— 把老人的口语转成结构化任务（RAG 增强的症状→科室映射）
 * Navigator —— 在页面能力清单内逐步选择动作（Function Calling 的等价实现）
 * Guardian  —— 每个动作执行前的风险裁决与人工授权门禁
 * Reporter  —— 把结果改写成老人听得懂的播报
 *
 * 与大模型的耦合被压缩在两处（planner / navigator / reporter 的文本生成），
 * 其余全部是确定性代码，因此模型不可用也能完整跑通 —— 这是可控性的核心设计。
 */

import { describeMatch, matchCapability } from './capmatch';
import { formatContext, retrieve } from '../rag/guides';
import { getPage, getSite, listCapabilities } from '../sim/registry';
import type { Capability } from '../sim/types';
import { bumpStep, canStep, logAudit } from '../store';
import type { SessionState } from '../store';
import {
  authorize,
  detectInjection,
  isSensitive,
  maskFreeText,
  maskValue,
  redactSecrets,
  validateField,
} from '../safety/guardian';
import type { AgentEvent, AgentName } from './events';
import { engineKind, extractJson, streamCompletion } from './llm';
import {
  FALLBACK_SYSTEM,
  GUARDIAN_SYSTEM,
  NAVIGATOR_SYSTEM,
  PLANNER_SYSTEM,
  REPORTER_SYSTEM,
} from './prompts';
import type { RuleAction } from './rules';
import { ruleNextAction, rulePlan } from './rules';

// 一次代驾最多执行 16 个动作（4 页 × 3~4 步 + 提交），超出即视为异常并停止
const MAX_ACTIONS = 16;

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/** 把一段文本按小片推送，模拟流式思考（规则引擎路径使用） */
async function* emitText(agent: AgentName, text: string): AsyncGenerator<AgentEvent> {
  const size = 8;
  for (let i = 0; i < text.length; i += size) {
    yield { t: 'agent', agent, delta: text.slice(i, i + size) };
  }
  yield { t: 'agent_end', agent };
}

interface PlanResult {
  plan: Record<string, string>;
  missing: string[];
  ask: string;
  stop: boolean;
}

/** Planner：LLM 优先，解析失败自动降级规则引擎 */
async function* runPlanner(session: SessionState, userText: string): AsyncGenerator<AgentEvent, PlanResult> {
  const known = { ...session.collected, ...session.values };

  const site = getSite(session.siteId);

  if (engineKind() === 'rule') {
    const p = rulePlan(session.siteId, userText, known);
    yield* emitText('planner', p.thought);
    return { plan: p.plan, missing: p.missing, ask: p.ask, stop: p.stop };
  }

  const rag = retrieve(userText, 3);
  const prompt = [
    `<user_input>${userText}</user_input>`,
    `<knowledge>${formatContext(rag)}</knowledge>`,
    `<known>${JSON.stringify(known)}</known>`,
    `<required_fields>${site.requiredFields.join(', ')}</required_fields>`,
    `<site>${site.name}</site>`,
    `<domain_constraints>${site.domainHints}</domain_constraints>`,
  ].join('\n');

  let raw = '';
  try {
    for await (const delta of streamCompletion(PLANNER_SYSTEM, prompt)) {
      raw += delta;
      yield { t: 'agent', agent: 'planner', delta };
    }
  } catch {
    yield* emitText('planner', '模型不可用，已切换规则引擎');
  }
  yield { t: 'agent_end', agent: 'planner' };

  let parsed = extractJson(raw) as PlanResult | null;
  if (!parsed) {
    let retry = '';
    try {
      for await (const delta of streamCompletion(`${PLANNER_SYSTEM}\n${FALLBACK_SYSTEM}`, prompt)) {
        retry += delta;
        yield { t: 'agent', agent: 'planner', delta };
      }
      yield { t: 'agent_end', agent: 'planner' };
      parsed = extractJson(retry) as PlanResult | null;
    } catch {
      /* ignore */
    }
  }

  if (!parsed) {
    const p = rulePlan(session.siteId, userText, known);
    yield* emitText('planner', `模型输出不可解析，规则引擎接管：${p.thought}`);
    return { plan: p.plan, missing: p.missing, ask: p.ask, stop: p.stop };
  }

  const plan = (parsed.plan ?? {}) as Record<string, string>;
  const merged: Record<string, string> = { ...known };
  for (const [k, v] of Object.entries(plan)) {
    if (v && !merged[k]) merged[k] = safeText(v);
  }

  // 必填字段由站点声明（含业务关键槽位），引擎不硬编码任何具体业务字段
  const required = site.requiredFields;
  const missing = Array.isArray(parsed.missing) ? parsed.missing.map(String) : required.filter((k) => !merged[k]);
  const unresolved = required.filter((k) => !merged[k]);

  return {
    plan: merged,
    missing: unresolved.length ? unresolved : missing,
    ask: safeText(parsed.ask),
    stop: unresolved.length > 0,
  };
}

/** Guardian：风险裁决（规则为主，LLM 负责生成人话解释） */
async function* runGuardian(cap: Capability): AsyncGenerator<AgentEvent, { needConfirm: boolean; reason: string }> {
  if (cap.risk !== 'high') {
    yield* emitText('guardian', cap.risk === 'medium' ? '涉及个人信息，将脱敏展示' : '低风险动作，可以直接执行');
    return { needConfirm: false, reason: '' };
  }

  let explanation = `「${cap.label}」提交后不可撤销，需要本人或家属点一下确认。`;
  if (engineKind() === 'llm') {
    try {
      let raw = '';
      for await (const delta of streamCompletion(GUARDIAN_SYSTEM, JSON.stringify({ action: cap.id, label: cap.label, risk: cap.risk }))) {
        raw += delta;
        yield { t: 'agent', agent: 'guardian', delta };
      }
      yield { t: 'agent_end', agent: 'guardian' };
      const parsed = extractJson(raw) as { explanation?: string } | null;
      if (parsed?.explanation) explanation = parsed.explanation;
    } catch {
      /* 保持默认解释 */
    }
  }
  if (engineKind() === 'rule') {
    yield* emitText('guardian', explanation);
  }
  return { needConfirm: true, reason: explanation };
}

interface DecideResult {
  action: RuleAction | null;
}

/** Navigator：在当前页能力清单内选一个动作 */
async function* runNavigator(session: SessionState, plan: Record<string, string>): AsyncGenerator<AgentEvent, DecideResult> {
  const page = getPage(session.siteId, session.pageId);
  const caps = listCapabilities(session.siteId, session.pageId);

  if (engineKind() === 'rule') {
    const action = ruleNextAction(session, plan);
    if (!action) return { action: null };
    yield* emitText('navigator', action.thought);
    return { action };
  }

  const prompt = [
    `<page>${JSON.stringify({ id: page.id, title: page.title, values: session.values, required: page.fields.filter((f) => f.required).map((f) => f.id) })}</page>`,
    `<capabilities>${JSON.stringify(caps.map((c) => ({ id: c.id, label: c.label, risk: c.risk, params: c.params, description: c.description })))}</capabilities>`,
    `<plan>${JSON.stringify(plan)}</plan>`,
    `<history>${JSON.stringify(session.audit.slice(-6).map((a) => a.action))}</history>`,
    // 自我反思：把此前失败过的原因回灌给模型，逼它换策略而不是原地重试
    `<past_failures>${session.reflections.slice(-3).join('；') || '（无）'}</past_failures>`,
    '<rule>若 past_failures 非空，说明此前有动作失败过。必须换一个不同的能力，严禁重复同一个失败动作。</rule>',
  ].join('\n');

  let raw = '';
  try {
    for await (const delta of streamCompletion(NAVIGATOR_SYSTEM, prompt)) {
      raw += delta;
      yield { t: 'agent', agent: 'navigator', delta };
    }
    yield { t: 'agent_end', agent: 'navigator' };
  } catch {
    const fallback = ruleNextAction(session, plan);
    yield* emitText('navigator', fallback ? `模型不可用，规则引擎接管：${fallback.thought}` : '模型不可用且无可执行动作');
    return { action: fallback };
  }

  const parsed = extractJson(raw) as { action?: string; value?: string | null; thought?: string } | null;
  if (!parsed?.action) {
    const fallback = ruleNextAction(session, plan);
    yield* emitText('navigator', fallback ? `输出不可解析，规则引擎接管：${fallback.thought}` : '输出不可解析且无可执行动作');
    return { action: fallback };
  }

  return {
    action: {
      thought: safeText(parsed.thought, '执行下一步'),
      action: parsed.action,
      value: parsed.value ?? null,
      risk: caps.find((c) => c.id === parsed.action)?.risk ?? 'low',
    },
  };
}

/**
 * 业务回执的字段结构由站点自己声明（SiteDef.buildReceipt），
 * 引擎只负责在提交成功时触发它 —— 因此新增站点不需要改引擎。
 */

/**
 * 执行一个能力（确定性代码，模型不参与）
 * Agent 编排与 MCP 工具层共用这一份实现，保证两条入口行为完全一致。
 */
export function executeCapability(
  session: SessionState,
  cap: Capability,
  value: string | null,
): { ok: boolean; message: string } {
  if (cap.verb === 'fill') {
    const fieldId = cap.target;
    const input = (value ?? '').trim();
    const check = validateField(fieldId, input);
    if (!check.ok) return { ok: false, message: check.message ?? '校验失败' };
    session.values[fieldId] = input;
    const masked = isSensitive(fieldId);
    logAudit(session, {
      actor: 'agent',
      action: cap.id,
      detail: `填写 ${fieldId} = ${masked ? maskValue(fieldId, input) : input}`,
      risk: masked ? 'medium' : 'low',
      masked,
    });
    return { ok: true, message: masked ? `已填写（已脱敏存储：${maskValue(fieldId, input)}）` : `已填写 ${fieldId}` };
  }

  const page = getPage(session.siteId, session.pageId);
  const actionDef = page.actions.find((a) => a.id === cap.target);
  if (!actionDef) return { ok: false, message: '当前页面没有这个动作' };

  if (actionDef.requires?.length) {
    const miss = actionDef.requires.filter((f) => !session.values[f]);
    if (miss.length) return { ok: false, message: `还有必填项没填：${miss.join('、')}` };
  }

  if (actionDef.kind === 'submit') {
    session.receipt = getSite(session.siteId).buildReceipt(session.values);
  }
  if (cap.target === 'restart') {
    session.values = {};
    session.receipt = null;
  }

  session.pageId = actionDef.target ?? session.pageId;
  logAudit(session, {
    actor: 'agent',
    action: cap.id,
    detail: `执行「${actionDef.label}」，页面进入 ${session.pageId}`,
    risk: actionDef.risk,
    masked: false,
  });
  return {
    ok: true,
    message: actionDef.kind === 'submit'
      ? `已执行「${actionDef.label}」`
      : `已进入「${getPage(session.siteId, session.pageId).title}」`,
  };
}

/** Reporter：生成老人听得懂的结果播报 */
async function* runReporter(session: SessionState): AsyncGenerator<AgentEvent, string> {
  const site = getSite(session.siteId);
  const done = session.pageId === 'done';
  const blocking = session.pending;
  const receipt = session.receipt ?? {};
  const rows = site.receiptRows
    .map((row) => `${row.label} ${receipt[row.key] ?? ''}`.trim())
    .filter((t) => t.length > 2);
  const tips = Object.entries(receipt)
    .filter(([k]) => k.endsWith('Tip'))
    .map(([, v]) => v);
  const base = done
    ? `${site.pages[site.pages.length - 1].title}了。${rows.slice(0, 4).join('，')}。${tips.join('')}`
    : blocking
      ? '已经填到最后一页了，正在等您点一下确认，我才能提交。'
      : '还没办完，我先做到这里。您可以再告诉我缺的信息。';

  if (engineKind() === 'rule') {
    yield* emitText('reporter', base);
    return base;
  }

  let text = '';
  try {
    const prompt = `<result>${JSON.stringify({ page: session.pageId, receipt: session.receipt, pending: session.pending })}</result>`;
    for await (const delta of streamCompletion(REPORTER_SYSTEM, prompt)) {
      text += delta;
      yield { t: 'agent', agent: 'reporter', delta };
    }
    yield { t: 'agent_end', agent: 'reporter' };
  } catch {
    text = base;
    yield* emitText('reporter', base);
  }
  const final = redactSecrets(text.trim() || base, session);
  return final;
}

/**
 * 信息不全时的「能填先填」：当前页已经拿到的字段先落上去，再一次性追问缺口。
 * 否则老人看到的会是一片空白 —— 明明科室已经听懂了，页面上却什么都没填。
 */
async function* fillKnownFields(session: SessionState, plan: Record<string, string>): AsyncGenerator<AgentEvent> {
  const caps = listCapabilities(session.siteId, session.pageId);
  for (const cap of caps) {
    if (cap.verb !== 'fill') continue;
    const value = plan[cap.target] ?? session.collected[cap.target];
    if (!value || session.values[cap.target]) continue;
    const verdict = authorize(session, { id: cap.id, risk: cap.risk, label: cap.label });
    if (!verdict.allowed) continue;
    const r = executeCapability(session, cap, value);
    if (!r.ok) continue;
    yield { t: 'tool', name: cap.id, args: JSON.stringify({ value }), result: r.message, risk: cap.risk };
    yield {
      t: 'page',
      pageId: session.pageId,
      values: publicValues(session),
      title: getPage(session.siteId, session.pageId).title,
    };
  }
}

/**
 * 主流程
 */
export async function* runAgent(session: SessionState, userText: string): AsyncGenerator<AgentEvent> {
  const injection = detectInjection(userText);
  if (injection) {
    logAudit(session, { actor: 'guardian', action: 'guard.block', detail: injection, risk: 'high', masked: false });
    yield { t: 'error', message: `安全策略已拦截：${injection}。请只描述您要办的事。` };
    return;
  }

  // 用户原话进审计前先做模式级脱敏：老人常在口语里直接报身份证与手机号
  const said = maskFreeText(userText).slice(0, 120);
  logAudit(session, {
    actor: 'user',
    action: 'user.say',
    detail: said,
    risk: 'low',
    masked: said !== userText.slice(0, 120),
  });

  const resuming = Boolean(session.pending) && session.granted.includes(session.pending!);
  if (resuming) session.pending = null;

  let planResult: PlanResult;
  if (resuming && Object.keys(session.collected).length) {
    planResult = { plan: { ...session.collected }, missing: [], ask: '', stop: false };
    yield* emitText('planner', '已获得授权，继续未完成的代驾任务。');
  } else {
    planResult = yield* runPlanner(session, userText);
  }

  for (const [k, v] of Object.entries(planResult.plan)) {
    if (v && !session.collected[k]) session.collected[k] = v;
  }

  if (planResult.stop && !resuming) {
    // 先落已听懂的字段，再追问缺口 —— 进度可见，追问才有对象感
    yield* fillKnownFields(session, planResult.plan);
    const question = planResult.ask || '还差一点信息，能再告诉我吗？';
    yield { t: 'ask', question };
    return;
  }

  let actions = 0;
  while (actions < MAX_ACTIONS && session.pageId !== 'done' && canStep(session)) {
    const { action } = yield* runNavigator(session, planResult.plan);
    actions += 1;

    if (!action) {
      yield { t: 'error', message: '当前页面没有可执行的动作，代驾暂停。' };
      break;
    }
    if (action.action === 'ask') {
      yield { t: 'ask', question: '还有必填信息没拿到，请您补充一下。' };
      return;
    }

    const caps = listCapabilities(session.siteId, session.pageId);
    let cap = caps.find((c) => c.id === action.action) ?? null;

    if (!cap) {
      // 防幻觉闸门：不在清单内的一律不放行。
      // 但先用语义检索（Tool RAG）找最接近的能力——老人说的是人话，不是能力 id，
      // 模型也可能输出形近的错误 id。只有置信度跨过阈值才自动纠正，且纠正后
      // 仍然完整走风险裁决与人工授权，不存在「检索到就执行」的捷径。
      const hit = matchCapability(action.action, caps);
      if (hit?.confident) {
        cap = caps.find((c) => c.id === hit.id) ?? null;
        if (cap) {
          yield { t: 'notice', text: describeMatch(hit), tone: 'warn' };
          logAudit(session, {
            actor: 'agent',
            action: 'capability.autocorrect',
            detail: `原动作 ${action.action} → 纠正为 ${cap.id}（置信度 ${Math.round(hit.score * 100)}%）`,
            risk: cap.risk,
            masked: false,
          });
        }
      }
      if (!cap) {
        const why = hit ? describeMatch(hit) : `动作 ${action.action} 不在当前页能力清单内`;
        session.reflections.push(why);
        yield { t: 'error', message: `${why}，已被拦截（防幻觉闸门）。` };
        continue;
      }
    }

    const verdict = authorize(session, { id: cap.id, risk: cap.risk, label: cap.label });
    let reason = '';
    let needConfirm = false;
    if (!verdict.allowed) {
      if ('needConfirm' in verdict && verdict.needConfirm) {
        needConfirm = true;
        reason = verdict.reason;
        const g = yield* runGuardian(cap);
        if (g.reason) reason = g.reason;
      } else {
        yield { t: 'error', message: verdict.reason };
        return;
      }
    }

    if (needConfirm) {
      session.pending = cap.id;
      yield { t: 'need_confirm', actionId: cap.id, label: cap.label, reason };
      // 等授权时也走一遍 Reporter：老人听到的是「就差您点一下确认」，而不是一片沉默
      const pendingSummary = yield* runReporter(session);
      yield { t: 'done', summary: pendingSummary, engine: engineKind(), steps: session.stepCount };
      return;
    }

    const result = executeCapability(session, cap, action.value);
    yield {
      t: 'tool',
      name: cap.id,
      args: action.value ? JSON.stringify({ value: action.value }) : '{}',
      result: result.message,
      risk: cap.risk,
    };
    yield {
      t: 'page',
      pageId: session.pageId,
      values: publicValues(session),
      title: getPage(session.siteId, session.pageId).title,
    };

    if (!result.ok) {
      const why = `执行能力 ${cap.id}（${cap.label}）未成功：${result.message}`;
      session.reflections.push(why);
      logAudit(session, {
        actor: 'agent',
        action: 'capability.failed',
        detail: why,
        risk: cap.risk,
        masked: false,
      });
      yield { t: 'ask', question: `这一步没成功：${result.message}。请您补充或换个说法。` };
      return;
    }
    bumpStep(session);
  }

  if (session.receipt) {
    yield { t: 'receipt', receipt: publicReceipt(session) };
  }

  const summary = yield* runReporter(session);
  yield { t: 'done', summary, engine: engineKind(), steps: session.stepCount };
}

export function publicValues(session: SessionState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(session.values)) {
    out[k] = isSensitive(k) ? maskValue(k, v) : v;
  }
  return out;
}

export function publicReceipt(session: SessionState): Record<string, string> {
  const r = session.receipt ?? {};
  // 回执面向本人展示，保留姓名；身份证与手机号一律不出回执
  return Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'idCard' && k !== 'phone'));
}
