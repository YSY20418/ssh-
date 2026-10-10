'use client';

import { confirmValues, getPage, getSite } from '@/lib/sim/registry';

export interface SimState {
  pageId: string;
  values: Record<string, string>;
  receipt?: Record<string, string> | null;
  /** 正在被 Agent 操作的字段 / 动作 */
  highlight?: string | null;
}

/**
 * 被代驾站点本体（站点无关渲染器）
 *
 * 每个可操作单元都带 data-cap-id 与 aria-label —— 这是「能力优先」的 Agentic Web 约定，
 * Agent 不靠猜 DOM，而是按能力契约执行。
 *
 * 这个组件不认识任何具体业务：页面结构、步骤文案、核对项、回执格式全部由 SiteDef 提供，
 * 因此新增站点不需要改一行前端代码。
 */
export default function SimSite({ siteId, state }: { siteId: string; state: SimState }) {
  const site = getSite(siteId);
  const page = getPage(siteId, state.pageId);
  const flowPages = site.pages.filter((p) => p.id !== 'done');
  const currentStep = flowPages.findIndex((p) => p.id === state.pageId);
  const focusId = state.highlight ?? null;
  const confirmData = confirmValues(siteId, state.values);
  const receipt = state.receipt ?? null;

  return (
    <div className="min-h-full bg-white text-[#16202e]">
      <header className="border-b border-[#0f3d75] bg-[#0f6e8f] px-7 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[19px] font-medium tracking-wide">{site.name}</p>
            <p className="mt-0.5 text-[13.5px] text-white/70">{site.url}</p>
          </div>
          <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[13.5px]">
            {site.tagline}
          </span>
        </div>
      </header>

      {state.pageId !== 'done' && (
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#eceff4] bg-[#f7f9fc] px-7 py-3 text-[14.5px]">
          {site.stepLabels.map((label, i) => {
            const active = i === currentStep;
            const done = currentStep > i;
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[13.5px] ${
                    active
                      ? 'bg-[#0f6e8f] text-white'
                      : done
                        ? 'bg-[#15803d] text-white'
                        : 'bg-[#dde2ea] text-[#6b7280]'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={active ? 'font-medium text-[#0f6e8f]' : 'text-[#6b7280]'}>{label}</span>
                {i < site.stepLabels.length - 1 && <span className="text-[#ccd2dc]">—</span>}
              </div>
            );
          })}
        </nav>
      )}

      <main className="px-7 py-6">
        <h1 className="text-[22px] font-medium tracking-tight">{page.title}</h1>
        <p className="mt-1 text-[14px] text-[#6b7280]">{page.subtitle}</p>

        {page.id === 'confirm' && (
          <div className="mt-5 rounded-xl border border-[#e6eaf0] bg-[#f8fafc] p-5">
            <p className="mb-3 text-[16.5px] font-medium">请核对信息</p>
            <dl className="grid gap-2 text-[16.5px] sm:grid-cols-2">
              {site.confirmRows.map((row) => (
                <div
                  key={row.key}
                  className="flex justify-between gap-4 border-b border-dashed border-[#e6eaf0] py-2"
                >
                  <dt className="text-[#6b7280]">{row.label}</dt>
                  <dd className="font-medium">{confirmData[row.key] || '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[14px] text-[#8a6d3b]">提交后不可自行撤销，请确认无误再继续。</p>
          </div>
        )}

        {state.pageId === 'done' && receipt && (
          <div className="mt-5 rounded-xl border border-[#b7e4c7] bg-[#eefaf3] p-6">
            <p className="text-[20px] font-medium text-[#15803d]">{page.title}</p>
            <dl className="mt-4 grid gap-3 text-[17px] sm:grid-cols-2">
              {site.receiptRows.map((row) => (
                <div
                  key={row.key}
                  className="flex justify-between gap-4 border-b border-dashed border-[#b7e4c7] py-2"
                >
                  <dt className="text-[#4b5563]">{row.label}</dt>
                  <dd className="font-medium">{receipt[row.key] || '—'}</dd>
                </div>
              ))}
            </dl>
            {Object.entries(receipt)
              .filter(([k]) => k.endsWith('Tip'))
              .map(([k, v]) => (
                <p key={k} className="mt-3 text-[16px] leading-relaxed text-[#15803d]">
                  {v}
                </p>
              ))}
          </div>
        )}

        {page.fields.length > 0 && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {page.fields.map((f) => {
              const value = state.values[f.id];
              const focused = focusId === `fill:${f.id}`;
              return (
                <div
                  key={f.id}
                  data-cap-id={`fill:${f.id}`}
                  aria-label={`填写${f.label}`}
                  className={`rounded-xl border p-4 transition-all duration-300 ${
                    focused
                      ? 'border-[#0f6e8f] bg-[#f2f7fd] wp-focus'
                      : 'border-[#e6eaf0] bg-white'
                  }`}
                >
                  <label className="block text-[16px] text-[#4b5563]">
                    {f.label}
                    {f.required && <span className="ml-1 text-[#c0392b]">*</span>}
                    {f.sensitive && (
                      <span className="ml-2 rounded bg-[#fdf3c7] px-2 py-0.5 text-[13.5px] text-[#8a6d3b]">
                        隐私字段
                      </span>
                    )}
                  </label>
                  <div
                    className={`mt-2 rounded-lg border px-3 py-3 text-[18px] ${
                      value
                        ? 'border-[#0f6e8f] bg-white text-[#16202e]'
                        : 'border-dashed border-[#ccd2dc] bg-[#fafbfd] text-[#9aa3af]'
                    }`}
                  >
                    {value || f.placeholder || '待填写'}
                  </div>
                  {f.options && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {f.options.map((opt) => (
                        <span
                          key={opt}
                          className={`rounded-full border px-3 py-1 text-[14px] ${
                            value === opt
                              ? 'border-[#0f6e8f] bg-[#e1f0f5] text-[#0f6e8f]'
                              : 'border-[#e6eaf0] text-[#6b7280]'
                          }`}
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          {page.actions.map((a) => {
            const focused = focusId === `click:${a.id}`;
            const primary = a.kind === 'submit';
            return (
              <button
                key={a.id}
                type="button"
                data-cap-id={`click:${a.id}`}
                aria-label={a.label}
                className={`rounded-lg px-6 py-3 text-[18px] font-medium transition-all duration-300 ${
                  primary
                    ? 'bg-[#b45309] text-white'
                    : a.id === 'back'
                      ? 'border border-[#ccd2dc] bg-white text-[#4b5563]'
                      : 'bg-[#0f6e8f] text-white'
                } ${focused ? 'wp-focus' : ''}`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </main>

      <footer className="mt-8 border-t border-[#eceff4] px-7 py-4 text-[13.5px] text-[#9aa3af]">
        本页面为演示用仿真站点，声明了完整能力清单供 Agent 调用。
      </footer>
    </div>
  );
}
