'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TechPanels from '@/components/TechPanels';
import type { SimState } from '@/components/SimSite';
import VoiceInput from '@/components/VoiceInput';
import type { AgentEvent, AgentName } from '@/lib/agents/events';
import { getSite, listSites } from '@/lib/sim/registry';
import type { RiskLevel } from '@/lib/sim/types';
import { fetchEngineInfo, IS_STATIC, postConfirm, postSession, streamRun } from '@/lib/runtime/transport';

type Item =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; agent: AgentName; text: string; streaming: boolean }
  | { kind: 'tool'; name: string; result: string; risk: RiskLevel }
  | { kind: 'notice'; text: string; tone: 'info' | 'warn' | 'error' | 'ok' };

const AGENTS: Array<{ id: AgentName; label: string; short: string }> = [
  { id: 'planner', label: '任务规划', short: '规划' },
  { id: 'navigator', label: '网页导航', short: '执行' },
  { id: 'guardian', label: '安全守门', short: '守门' },
  { id: 'reporter', label: '结果播报', short: '播报' },
];

/**
 * 四个智能体在界面上的名字。
 * 面向老人，一律不出现英文；这里统一用繁体作品牌记忆点（全站唯一的繁体区），
 * 与正文的简体形成「角色名 = 有温度的称呼」的视觉区分。
 */
const AGENT_TEXT: Record<AgentName, string> = {
  planner: '聽懂您的話',
  navigator: '替您一步步辦',
  guardian: '替您把好關',
  reporter: '把結果講給您聽',
};

const RISK_LABEL: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险·已脱敏',
  high: '高风险·需授权',
};

/** 流式输出时从 JSON 里优先取出 thought 字段，让「思考过程」可读 */
function prettyThought(raw: string): string {
  const m = raw.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) return m[1].replace(/\\"/g, '"');
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 160)}…` : cleaned;
}

export default function Page() {
  const sites = useMemo(() => listSites(), []);
  const [siteId, setSiteId] = useState(sites[0].id);
  const site = useMemo(() => getSite(siteId), [siteId]);

  const [sessionId, setSessionId] = useState('default');
  const [items, setItems] = useState<Item[]>([]);
  const [sim, setSim] = useState<SimState>({
    pageId: sites[0].startPage,
    values: {},
    receipt: null,
    highlight: null,
  });
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentName | null>(null);
  const [confirm, setConfirm] = useState<{ actionId: string; label: string; reason: string } | null>(null);
  const [receipt, setReceipt] = useState<Record<string, string> | null>(null);
  const [summary, setSummary] = useState('');
  const [engine, setEngine] = useState<{ engine: string; model: string; provider: string } | null>(null);
  const [speak, setSpeak] = useState(true);
  /** 完整事件流：用于导出留档与界面重放（回放时不重复记录） */
  const [trace, setTrace] = useState<AgentEvent[]>([]);
  const [replaying, setReplaying] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const simRef = useRef(sim);
  simRef.current = sim;
  const bottomRef = useRef<HTMLDivElement>(null);
  const traceRef = useRef<AgentEvent[]>([]);
  traceRef.current = trace;
  const replayingRef = useRef(false);
  replayingRef.current = replaying;

  useEffect(() => {
    setSessionId(`s-${Math.random().toString(36).slice(2, 8)}`);
    void fetchEngineInfo()
      .then((info) => {
        if (info) setEngine(info);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'wp:state', state: sim }, '*');
  }, [sim]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === 'wp:hello') {
        iframeRef.current?.contentWindow?.postMessage({ type: 'wp:state', state: simRef.current }, '*');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items, summary]);

  const push = useCallback((item: Item) => setItems((prev) => [...prev, item]), []);

  const handleEvent = useCallback(
    (evt: AgentEvent, record = true) => {
      if (record) setTrace((prev) => [...prev, evt]);
      switch (evt.t) {
        case 'agent': {
          setActiveAgent(evt.agent);
          setItems((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.kind === 'agent' && last.agent === evt.agent && last.streaming) {
              return [...prev.slice(0, -1), { ...last, text: last.text + evt.delta }];
            }
            return [...prev, { kind: 'agent', agent: evt.agent, text: evt.delta, streaming: true }];
          });
          break;
        }
        case 'agent_end': {
          setItems((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.kind === 'agent' && last.agent === evt.agent) {
              return [...prev.slice(0, -1), { ...last, streaming: false }];
            }
            return prev;
          });
          break;
        }
        case 'tool': {
          push({ kind: 'tool', name: evt.name, result: evt.result, risk: evt.risk });
          setSim((prev) => ({ ...prev, highlight: evt.name }));
          break;
        }
        case 'page': {
          setSim((prev) => ({ pageId: evt.pageId, values: evt.values, receipt: prev.receipt, highlight: null }));
          break;
        }
        case 'need_confirm': {
          setConfirm({ actionId: evt.actionId, label: evt.label, reason: evt.reason });
          push({ kind: 'notice', text: `已暂停：${evt.reason}`, tone: 'warn' });
          break;
        }
        case 'ask': {
          push({ kind: 'notice', text: evt.question, tone: 'info' });
          break;
        }
        case 'receipt': {
          setReceipt(evt.receipt);
          setSim((prev) => ({ ...prev, receipt: evt.receipt }));
          break;
        }
        case 'done': {
          setSummary(evt.summary);
          setActiveAgent(null);
          if (speak && !replayingRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const utter = new SpeechSynthesisUtterance(evt.summary);
            utter.lang = 'zh-CN';
            window.speechSynthesis.speak(utter);
          }
          break;
        }
        case 'notice': {
          push({ kind: 'notice', text: evt.text, tone: evt.tone });
          break;
        }
        case 'error': {
          push({ kind: 'notice', text: evt.message, tone: 'error' });
          break;
        }
      }
    },
    [push, speak],
  );

  const run = useCallback(
    async (text: string) => {
      setRunning(true);
      try {
        // 服务端形态走 SSE，静态形态在浏览器内跑引擎 —— 事件序列完全一致
        for await (const evt of streamRun({ sessionId, siteId, message: text })) {
          handleEvent(evt);
        }
      } catch (err) {
        push({ kind: 'notice', text: err instanceof Error ? err.message : '请求失败', tone: 'error' });
      } finally {
        setRunning(false);
      }
    },
    [handleEvent, push, sessionId, siteId],
  );

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || running) return;
    setInput('');
    push({ kind: 'user', text });
    void run(text);
  }, [input, push, run, running]);

  const respondConfirm = useCallback(
    async (grant: boolean) => {
      if (!confirm) return;
      await postConfirm({ sessionId, siteId, actionId: confirm.actionId, grant });
      setConfirm(null);
      if (grant) {
        push({ kind: 'notice', text: '已授权，代驾继续。', tone: 'ok' });
        await run('');
      } else {
        push({ kind: 'notice', text: '已取消这一步，代驾停止。', tone: 'warn' });
      }
    },
    [confirm, push, run, sessionId],
  );

  /** 切换被代驾站点：Agent、安全策略、编排完全不变，只换能力清单 */
  const switchSite = useCallback(
    async (next: string) => {
      const id = `s-${Math.random().toString(36).slice(2, 8)}`;
      await postSession({ sessionId: id, siteId: next, reset: true });
      const target = getSite(next);
      setSiteId(next);
      setSessionId(id);
      setItems([]);
      setTrace([]);
      setSim({ pageId: target.startPage, values: {}, receipt: null, highlight: null });
      setReceipt(null);
      setSummary('');
      setConfirm(null);
      setActiveAgent(null);
    },
    [],
  );

  /** 把已记录的一次代驾原速重放 —— 用于演示「可回放」与复盘失败轨迹 */
  const replay = useCallback(async () => {
    const snapshot = traceRef.current;
    if (!snapshot.length || replayingRef.current) return;
    replayingRef.current = true;
    setReplaying(true);
    setItems([]);
    setReceipt(null);
    setSummary('');
    setConfirm(null);
    setActiveAgent(null);
    setSim({ pageId: site.startPage, values: {}, receipt: null, highlight: null });
    for (const evt of snapshot) {
      handleEvent(evt, false);
      await new Promise((r) => setTimeout(r, evt.t === 'agent' ? 40 : 240));
    }
    replayingRef.current = false;
    setReplaying(false);
  }, [handleEvent, site.startPage]);

  const reset = useCallback(async () => {
    const id = `s-${Math.random().toString(36).slice(2, 8)}`;
    await postSession({ sessionId: id, reset: true });
    setSessionId(id);
    setItems([]);
    setTrace([]);
    setSim({ pageId: site.startPage, values: {}, receipt: null, highlight: null });
    setReceipt(null);
    setSummary('');
    setConfirm(null);
    setActiveAgent(null);
  }, [site.startPage]);

  const engineLabel = engine
    ? engine.engine === 'llm'
      ? `在线大模型 · ${engine.provider}`
      : '规则引擎兜底（离线可用）'
    : '待运行';

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_420px_at_50%_-140px,#e4f1f6_0%,#f4f6f9_62%)]">
      <div className="mx-auto max-w-[1440px] px-5 py-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f6e8f] text-[20px] font-medium text-white">
            渡
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-[27px] font-medium tracking-tight text-[#16202e]">阿渡</h1>
              <span className="text-[14px] tracking-[0.2em] text-[#8ba7bb]">網頁代駕</span>
            </div>
            <p className="mt-0.5 text-[16px] text-[#6b7280]">
              说一句话，剩下的交给它 —— 为银发群体做的网页代驾助手
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[#e6eaf0] bg-white px-3.5 py-1.5 text-[14px] text-[#5b6673]">
            {engineLabel}
          </span>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-[#ccd2dc] bg-white px-4 py-2 text-[15.5px] text-[#4b5563] transition hover:border-[#0f6e8f] hover:text-[#0f6e8f]"
          >
            新会话
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.42fr_1fr]">
        {/* 左：被代驾的站点 */}
        <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white shadow-[0_1px_2px_rgba(16,32,54,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceff4] px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  running ? 'bg-[#0f6e8f] wp-blink' : 'bg-[#ccd2dc]'
                }`}
                aria-hidden
              />
              <span className="text-[15.5px] text-[#4b5563]">
                {running ? '智能体正在代驾…' : '待命'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sites.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void switchSite(s.id)}
                  className={`rounded-lg px-3.5 py-1.5 text-[14.5px] transition ${
                    s.id === siteId
                      ? 'bg-[#0f6e8f] text-white'
                      : 'border border-[#e6eaf0] bg-white text-[#5b6673] hover:border-[#0f6e8f] hover:text-[#0f6e8f]'
                  }`}
                >
                  {s.name.split(' · ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#fbfcfe]">
            <iframe
              key={siteId}
              ref={iframeRef}
              title={`被代驾站点：${site.name}`}
              src={`/sim/${siteId}`}
              className="h-[640px] w-full border-0"
            />
          </div>

          <div className="border-t border-[#eceff4] px-5 py-3 text-[13.5px] text-[#9aa3af]">
            当前站点：{site.name} · 能力清单由网页自行声明，Agent 只能在清单内动作
          </div>
        </section>

        {/* 右：智能体轨迹 */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white shadow-[0_1px_2px_rgba(16,32,54,0.04)]">
          <div className="flex items-center justify-between border-b border-[#eceff4] px-5 py-3.5">
            <h2 className="text-[17px] font-medium text-[#16202e]">智能体执行轨迹</h2>
            <div className="flex items-center gap-1.5">
              {AGENTS.map((a) => (
                <span
                  key={a.id}
                  className={`rounded-md px-2 py-1 text-[13.5px] transition ${
                    activeAgent === a.id
                      ? 'bg-[#0f6e8f] text-white'
                      : 'bg-[#f2f5f9] text-[#8b95a3]'
                  }`}
                >
                  {a.short}
                </span>
              ))}
            </div>
          </div>

          <div className="wp-scroll h-[470px] overflow-y-auto px-5 py-4">
            {confirm && (
              <div className="mb-4 rounded-xl border border-[#e0b563] bg-[#fffaf0] p-4">
                <p className="text-[17px] font-medium text-[#8a5a10]">需要您确认后才能继续</p>
                <p className="mt-2 text-[16px] leading-relaxed text-[#4b5563]">{confirm.reason}</p>
                <p className="mt-1 text-[14px] text-[#8a6d3b]">待执行动作：{confirm.label}</p>
                <div className="mt-3.5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void respondConfirm(true)}
                    className="rounded-lg bg-[#b45309] px-5 py-2.5 text-[17px] font-medium text-white transition hover:bg-[#96440a]"
                  >
                    我确认，让它提交
                  </button>
                  <button
                    type="button"
                    onClick={() => void respondConfirm(false)}
                    className="rounded-lg border border-[#ccd2dc] bg-white px-5 py-2.5 text-[17px] text-[#4b5563]"
                  >
                    先不要
                  </button>
                </div>
              </div>
            )}

            {items.length === 0 && !summary && (
              <div className="rounded-xl border border-dashed border-[#dde2ea] bg-[#fafbfd] p-5 text-[16px] leading-relaxed text-[#6b7280]">
                对着下面说一句话（或直接打字），智能体会全程代劳：
                <div className="mt-3 flex flex-col gap-2">
                  {site.examples.slice(0, 2).map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setInput(e)}
                      className="rounded-lg border border-[#e6eaf0] bg-white px-3.5 py-2.5 text-left text-[15.5px] text-[#16202e] transition hover:border-[#0f6e8f]"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 border-l border-[#eceff4] pl-5">
              {items.map((item, i) => {
                if (item.kind === 'user') {
                  return (
                    <div key={i} className="relative wp-rise">
                      <span className="absolute -left-[26px] top-3.5 h-2 w-2 rounded-full bg-[#0f6e8f]" />
                      <div className="rounded-xl rounded-tl-sm bg-[#0f6e8f] px-4 py-3 text-[17px] leading-relaxed text-white">
                        {item.text}
                      </div>
                    </div>
                  );
                }
                if (item.kind === 'agent') {
                  return (
                    <div key={i} className="relative wp-rise">
                      <span className="absolute -left-[26px] top-3.5 h-2 w-2 rounded-full bg-[#c3cbd6]" />
                      <div className="rounded-xl border border-[#eceff4] bg-[#fafbfd] px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[14px] font-medium tracking-wide text-[#6b7280]">
                            {AGENT_TEXT[item.agent]}
                          </span>
                          {item.streaming && (
                            <span className="text-[13.5px] text-[#9aa3af]">输出中…</span>
                          )}
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-[16.5px] leading-relaxed text-[#16202e]">
                          {prettyThought(item.text)}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (item.kind === 'tool') {
                  return (
                    <div key={i} className="relative wp-rise">
                      <span
                        className={`absolute -left-[26px] top-3.5 h-2 w-2 rounded-full ${
                          item.risk === 'high'
                            ? 'bg-[#b45309]'
                            : item.risk === 'medium'
                              ? 'bg-[#d9a441]'
                              : 'bg-[#c3cbd6]'
                        }`}
                      />
                      <div className="rounded-xl border border-[#eceff4] bg-white px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <code className="text-[14px] font-medium text-[#16202e]">{item.name}</code>
                          <span className="shrink-0 text-[13.5px] text-[#8b95a3]">{RISK_LABEL[item.risk]}</span>
                        </div>
                        <p className="mt-1 text-[15.5px] text-[#4b5563]">{item.result}</p>
                      </div>
                    </div>
                  );
                }
                const tone =
                  item.tone === 'error'
                    ? 'border-[#e8b4b4] bg-[#fdf3f3] text-[#a32d2d]'
                    : item.tone === 'warn'
                      ? 'border-[#e0c088] bg-[#fffaf0] text-[#8a5a10]'
                      : item.tone === 'ok'
                        ? 'border-[#a8ddc4] bg-[#f0faf5] text-[#15803d]'
                        : 'border-[#e6eaf0] bg-[#f7f9fc] text-[#4b5563]';
                return (
                  <div key={i} className="relative">
                    <span className="absolute -left-[26px] top-3.5 h-2 w-2 rounded-full bg-[#c3cbd6]" />
                    <div className={`rounded-xl border px-4 py-3 text-[16px] leading-relaxed ${tone}`}>
                      {item.text}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {receipt && (
              <div className="mt-4 rounded-xl border border-[#a8ddc4] bg-[#f0faf5] p-4">
                <p className="text-[17px] font-medium text-[#15803d]">
                  {site.pages[site.pages.length - 1].title}
                </p>
                <div className="mt-2 grid gap-1.5 text-[15.5px] text-[#4b5563]">
                  {site.receiptRows.slice(0, 4).map((row) => (
                    <div key={row.key} className="flex justify-between gap-4">
                      <span className="text-[#6b7280]">{row.label}</span>
                      <span className="font-medium text-[#16202e]">{receipt[row.key] || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary && (
              <div className="mt-4 rounded-xl border border-[#e6eaf0] bg-[#f7f9fc] p-4">
                <p className="text-[16.5px] leading-relaxed text-[#16202e]">{summary}</p>
              </div>
            )}
          </div>

          <div className="border-t border-[#eceff4] p-4">
            <div className="flex flex-wrap items-end gap-2.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                }}
                rows={2}
                placeholder="说出您要办的事，例如：我膝盖疼，想明天上午去医院"
                className="min-h-[62px] flex-1 rounded-lg border border-[#ccd2dc] px-3.5 py-3 text-[17px] outline-none transition focus:border-[#0f6e8f]"
              />
              <button
                type="button"
                onClick={submit}
                disabled={running || !input.trim()}
                className="min-h-[62px] rounded-lg bg-[#0f6e8f] px-6 text-[18px] font-medium text-white transition hover:bg-[#0b5a75] disabled:bg-[#9dc0cc]"
              >
                {running ? '执行中…' : '开始代驾'}
              </button>
              <VoiceInput onResult={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))} disabled={running} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[14px] text-[#9aa3af]">快捷话术：</span>
              {site.examples.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setInput(e)}
                  className="rounded-full border border-[#e6eaf0] bg-white px-3 py-1.5 text-[14px] text-[#4b5563] transition hover:border-[#0f6e8f] hover:text-[#0f6e8f]"
                >
                  {e.slice(0, 14)}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-2 text-[14px] text-[#6b7280]">
                <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
                语音播报结果
              </label>
            </div>
          </div>
        </section>
      </div>

      <TechPanels sessionId={sessionId} trace={trace} onReplay={() => void replay()} replaying={replaying} />

      <footer className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] leading-relaxed text-[#8b95a3]">
        <span>
          被代驾站点为演示用仿真站点，其每个可操作单元都声明为标准「能力」，智能体只能按能力清单执行。
        </span>
        <span>
          涉及提交、缴费等不可撤销动作时，「替您把好關」会强制暂停并请求您亲自授权；身份证与手机号全程脱敏。
        </span>
        <span className="text-[#0f6e8f]">
          {IS_STATIC ? '能力服务清单见右侧「能力服务」面板' : (
            <a href="/api/mcp" className="underline decoration-dotted">
              查看网页能力服务清单 →
            </a>
          )}
        </span>
      </footer>
      </div>
    </div>
  );
}
