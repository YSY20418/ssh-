/**
 * 站点注册表
 *
 * Agent、安全层、MCP 工具层、前端渲染器全部只依赖这个注册表，
 * 不依赖任何具体站点 —— 新增站点 = 往数组里加一份 SiteDef。
 */

import { GOV } from './gov';
import { HOSPITAL } from './hospital';
import type { Capability, PageDef, SiteDef } from './types';

export const SITES: SiteDef[] = [HOSPITAL, GOV];

export const DEFAULT_SITE_ID = HOSPITAL.id;

export function listSites(): SiteDef[] {
  return SITES;
}

export function getSite(siteId?: string | null): SiteDef {
  const hit = SITES.find((s) => s.id === siteId);
  return hit ?? SITES[0];
}

export function getPage(siteId: string, pageId: string): PageDef {
  const site = getSite(siteId);
  const page = site.pages.find((p) => p.id === pageId);
  if (!page) throw new Error(`站点 ${site.id} 没有页面 ${pageId}`);
  return page;
}

/**
 * 把某个页面编译成能力清单 —— 这就是暴露给 Agent / MCP 客户端的工具列表。
 */
export function listCapabilities(siteId: string, pageId: string): Capability[] {
  const page = getPage(siteId, pageId);
  const caps: Capability[] = [];

  for (const f of page.fields) {
    caps.push({
      id: `fill:${f.id}`,
      verb: 'fill',
      target: f.id,
      label: `填写「${f.label}」`,
      risk: f.risk ?? (f.sensitive ? 'medium' : 'low'),
      params: ['value'],
      description: f.options ? `可选值: ${f.options.join(' / ')}` : `输入${f.label}`,
    });
  }

  for (const a of page.actions) {
    caps.push({
      id: `click:${a.id}`,
      verb: a.kind === 'submit' ? 'submit' : 'click',
      target: a.id,
      label: a.label,
      risk: a.risk,
      params: [],
      description:
        a.kind === 'submit'
          ? '不可撤销动作，执行前必须经人工授权'
          : `页面跳转到「${a.target}」`,
    });
  }

  return caps;
}

/** 某站点全部页面的能力并集 —— 供 MCP tools/list 使用 */
export function listAllCapabilities(siteId: string): Array<Capability & { pageId: string; pageTitle: string }> {
  const site = getSite(siteId);
  const out: Array<Capability & { pageId: string; pageTitle: string }> = [];
  const seen = new Set<string>();
  for (const page of site.pages) {
    for (const cap of listCapabilities(siteId, page.id)) {
      if (seen.has(cap.id)) continue;
      seen.add(cap.id);
      out.push({ ...cap, pageId: page.id, pageTitle: page.title });
    }
  }
  return out;
}

/** 确认页展示用：站点可在回执里派生出金额等派生字段 */
export function confirmValues(siteId: string, values: Record<string, string>): Record<string, string> {
  const site = getSite(siteId);
  return { ...values, ...site.buildReceipt(values) };
}
