'use client';

/**
 * 技术剖面面板
 *
 * 这一层的存在理由：能力清单、审计日志、自动化评测、轨迹回放这些能力
 * 在引擎里早就实现了，但界面上没有任何入口 —— 使用者和演示者根本看不到。
 * 这里把它们做成四个可见、可点开、可导出的数据面板。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentEvent } from '@/lib/agents/events';
import { fetchAudit, fetchEval, fetchMcpTools } from '@/lib/runtime/transport';

type TabId = 'capability' | 'audit' | 'eval' | 'trace';

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: 'capability', label: '能力清单（工具协议）', hint: '网页声明了什么，Agent 才能做什么' },
  { id: 'audit', label: '安全审计日志', hint: '每一步都可追溯，敏感值全程脱敏' },
  { id: 'eval', label: '自动化评测', hint: 'AI 辅助用例生成 + 规则断言判定' },
  { id: 'trace', label: '轨迹回放', hint: '一次代驾全过程可导出、可重放' },
];

interface McpTool {
  name: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

interface AuditEntry {
  time: string;
  actor: string;
  action: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  masked: boolean;
}

const ACTOR_LABEL: Record<string, string> = {
  user: '用户',
  agent: '智能体',
  guardian: '安全守门',
  system: '系统',
};

const RISK_BADGE: Record<string, string> = {
  high: 'bg-[#fdf3f3] text-[#a32d2d] border-[#e8b4b4]',
  medium: 'bg-[#fffaf0] text-[#8a5a10] border-[#e0c088]',
  low: 'bg-[#f2f5f9] text-[#6b7280] border-[#e6eaf0]',
};

const RISK_TEXT: Record<string, string> = { high: '高', medium: '中', low: '低' };

function riskOf(desc: string): 'low' | 'medium' | 'high' {
  if (desc.includes('风险等级：高')) return 'high';
  if (desc.includes('风险等级：中')) return 'medium';
  return 'low';
}

export default function TechPanels({
  sessionId,
  trace,
  onReplay,
  replaying,
}: {
  sessionId: string;
  trace: AgentEvent[];
  onReplay: () => void;
  replaying: boolean;
}) {
  const [tab, setTab] = useState<TabId>('capability');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [mcpMeta, setMcpMeta] = useState<{ server?: string; protocolVersion?: string; toolCount?: number }>({});
  const [audit, setAudit] = useState<{ entries: AuditEntry[]; stats: Record<string, number> } | null>(null);
  const [evalData, setEvalData] = useState<{
    ok: boolean;
    cases?: number;
    passed?: number;
    total?: number;
    rows?: Array<{ id: string; site: string; type: string; passed: number; total: number; details: string[] }>;
    message?: string;
  } | null>(null);

  useEffect(() => {
    void fetchMcpTools()
      .then((d) => {
        setMcpMeta({ server: d.server, protocolVersion: d.protocolVersion, toolCount: d.toolCount });
        setTools((d.tools ?? []).map((t) => ({ ...t, risk: riskOf(t.description) })));
      })
      .catch(() => undefined);
  }, []);

  const refreshAudit = useCallback(() => {
    void fetchAudit(sessionId)
      .then((d) => setAudit({ entries: (d.entries ?? []) as AuditEntry[], stats: d.stats ?? {} }))
      .catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    void fetchEval()
      .then(setEvalData)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshAudit();
    const t = setInterval(refreshAudit, 2_500);
    return () => clearInterval(t);
  }, [refreshAudit]);

  const grouped = useMemo(() => {
    const g = new Map<string, McpTool[]>();
    for (const t of tools) {
      const site = t.name.split('__')[0];
      if (!g.has(site)) g.set(site, []);
      g.get(site)!.push(t);
    }
    return [...g.entries()];
  }, [tools]);

  const downloadTrace = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          { sessionId, exportedAt: new Date().toISOString(), eventCount: trace.length, events: trace },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webpilot-trace-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionId, trace]);

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white shadow-[0_1px_2px_rgba(16,32,54,0.04)]">
      <div className="flex flex-wrap gap-1.5 border-b border-[#eceff4] px-4 py-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3.5 py-2 text-left text-[14.5px] transition ${
              tab === t.id
                ? 'bg-[#0f6e8f] text-white'
                : 'bg-[#f4f6f9] text-[#5b6673] hover:bg-[#e8eef6] hover:text-[#0f6e8f]'
            }`}
          >
            <span className="font-medium">{t.label}</span>
            <span className={`ml-2 text-[12.5px] ${tab === t.id ? 'text-[#c5daf2]' : 'text-[#9aa3af]'}`}>
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      <div className="wp-scroll max-h-[380px] overflow-y-auto px-5 py-4">
        {tab === 'capability' && (
          <div>
            <p className="mb-3 text-[14.5px] leading-relaxed text-[#4b5563]">
              被代驾网页的每个可操作单元都会声明为一个标准「能力」，并原样暴露为标准 MCP 工具
              <code className="mx-1 rounded bg-[#f2f5f9] px-1.5 py-0.5 text-[13px]">{mcpMeta.server ?? 'webpilot-capability-server'}</code>
              （协议 {mcpMeta.protocolVersion ?? '2025-06-18'}）。Agent 只能在清单内动作，越权调用会被拦截。
            </p>
            <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-full border border-[#e6eaf0] bg-[#f7f9fc] px-3 py-1 text-[#4b5563]">
                工具总数 {mcpMeta.toolCount ?? tools.length}
              </span>
              <span className="rounded-full border border-[#e8b4b4] bg-[#fdf3f3] px-3 py-1 text-[#a32d2d]">
                高危·需授权 {tools.filter((t) => t.risk === 'high').length}
              </span>
              <span className="rounded-full border border-[#e0c088] bg-[#fffaf0] px-3 py-1 text-[#8a5a10]">
                中危·值脱敏 {tools.filter((t) => t.risk === 'medium').length}
              </span>
            </div>
            {grouped.map(([site, list]) => (
              <div key={site} className="mb-4">
                <p className="mb-2 text-[14px] font-medium text-[#16202e]">{site}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {list.map((t) => (
                    <div
                      key={t.name}
                      className="flex items-start justify-between gap-3 rounded-lg border border-[#eceff4] bg-[#fafbfd] px-3 py-2"
                    >
                      <code className="break-all text-[12.5px] text-[#16202e]">{t.name}</code>
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11.5px] ${RISK_BADGE[t.risk]}`}>
                        {RISK_TEXT[t.risk]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'audit' && (
          <div>
            <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-full border border-[#e6eaf0] bg-[#f7f9fc] px-3 py-1 text-[#4b5563]">
                条目 {audit?.stats.total ?? 0}
              </span>
              <span className="rounded-full border border-[#e8b4b4] bg-[#fdf3f3] px-3 py-1 text-[#a32d2d]">
                高危 {audit?.stats.high ?? 0}
              </span>
              <span className="rounded-full border border-[#a8ddc4] bg-[#f0faf5] px-3 py-1 text-[#15803d]">
                已脱敏 {audit?.stats.masked ?? 0}
              </span>
              <span className="rounded-full border border-[#e6eaf0] bg-[#f7f9fc] px-3 py-1 text-[#4b5563]">
                已授权 {audit?.stats.granted ?? 0}
              </span>
            </div>
            {!audit || audit.entries.length === 0 ? (
              <p className="text-[14.5px] text-[#8b95a3]">暂无审计条目，发起一次代驾后即可看到完整轨迹。</p>
            ) : (
              <div className="space-y-1.5">
                {audit.entries
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-[#eceff4] bg-[#fafbfd] px-3 py-2">
                      <span className="w-[58px] shrink-0 text-[12.5px] text-[#9aa3af]">{e.time}</span>
                      <span className="shrink-0 rounded bg-[#eef2f7] px-1.5 py-0.5 text-[11.5px] text-[#4b5563]">
                        {ACTOR_LABEL[e.actor] ?? e.actor}
                      </span>
                      <span className="text-[13.5px] text-[#16202e]">{e.detail}</span>
                      <span className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[11.5px] ${RISK_BADGE[e.risk]}`}>
                        {RISK_TEXT[e.risk]}
                        {e.masked ? ' · 脱敏' : ''}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {tab === 'eval' && (
          <div>
            {!evalData?.ok ? (
              <p className="text-[14.5px] text-[#8b95a3]">{evalData?.message ?? '加载中…'}</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
                  <span className="rounded-full border border-[#a8ddc4] bg-[#f0faf5] px-3 py-1 text-[#15803d]">
                    断言通过 {evalData.passed}/{evalData.total}
                  </span>
                  <span className="rounded-full border border-[#e6eaf0] bg-[#f7f9fc] px-3 py-1 text-[#4b5563]">
                    用例 {evalData.cases}
                  </span>
                </div>
                <table className="w-full text-left text-[13.5px]">
                  <thead>
                    <tr className="text-[12.5px] text-[#8b95a3]">
                      <th className="py-1.5 pr-3 font-normal">用例</th>
                      <th className="py-1.5 pr-3 font-normal">站点</th>
                      <th className="py-1.5 pr-3 font-normal">类型</th>
                      <th className="py-1.5 pr-3 font-normal">断言</th>
                      <th className="py-1.5 font-normal">覆盖要点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(evalData.rows ?? []).map((r) => (
                      <tr key={r.id} className="border-t border-[#f0f3f7] align-top">
                        <td className="py-2 pr-3 font-medium text-[#16202e]">{r.id}</td>
                        <td className="py-2 pr-3 text-[#6b7280]">{r.site}</td>
                        <td className="py-2 pr-3 text-[#6b7280]">{r.type}</td>
                        <td className="py-2 pr-3 text-[#15803d]">
                          {r.passed}/{r.total}
                        </td>
                        <td className="py-2 text-[12.5px] leading-relaxed text-[#8b95a3]">
                          {r.details.slice(0, 4).join(' · ')}
                          {r.details.length > 4 ? ` …等 ${r.details.length} 项` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {tab === 'trace' && (
          <div>
            <p className="mb-3 text-[14.5px] leading-relaxed text-[#4b5563]">
              一次代驾的完整事件流会被完整记录（含每个智能体的思考、每个工具调用、每次风险裁决），
              可导出留档文件（JSON），也可在界面上原速重放 —— 这是「可审计、可回放」的直接证据。
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="text-[14px] text-[#4b5563]">
                当前会话事件数：<span className="font-medium text-[#16202e]">{trace.length}</span>
              </span>
              <button
                type="button"
                onClick={onReplay}
                disabled={trace.length === 0 || replaying}
                className="rounded-lg bg-[#0f6e8f] px-4 py-2 text-[14.5px] text-white transition hover:bg-[#0b5a75] disabled:bg-[#9dc0cc]"
              >
                {replaying ? '重放中…' : '重放这次代驾'}
              </button>
              <button
                type="button"
                onClick={downloadTrace}
                disabled={trace.length === 0}
                className="rounded-lg border border-[#ccd2dc] bg-white px-4 py-2 text-[14.5px] text-[#4b5563] transition hover:border-[#0f6e8f] hover:text-[#0f6e8f] disabled:text-[#b6bec9]"
              >
                导出留档（JSON）
              </button>
            </div>
            <div className="space-y-1">
              {trace.slice(0, 40).map((e, i) => (
                <div key={i} className="rounded-lg border border-[#eceff4] bg-[#fafbfd] px-3 py-1.5 text-[12.5px]">
                  <span className="mr-2 text-[#9aa3af]">{String(i + 1).padStart(2, '0')}</span>
                  <code className="text-[#16202e]">{e.t}</code>
                  {'name' in e && (
                    <span className="ml-2 text-[#4b5563]">{String((e as { name: string }).name)}</span>
                  )}
                  {'pageId' in e && (
                    <span className="ml-2 text-[#4b5563]">{String((e as { pageId: string }).pageId)}</span>
                  )}
                  {'agent' in e && (
                    <span className="ml-2 text-[#4b5563]">{String((e as { agent: string }).agent)}</span>
                  )}
                </div>
              ))}
              {trace.length > 40 && (
                <p className="pt-1 text-[12.5px] text-[#9aa3af]">… 其余 {trace.length - 40} 条已包含在导出的 JSON 中</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
