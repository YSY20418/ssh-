'use client';

import { useEffect, useRef, useState } from 'react';
import SimSite, { type SimState } from './SimSite';
import { getSite } from '@/lib/sim/registry';

/**
 * 被代驾站点的路由视图（客户端）
 *
 * 以独立路由承载站点（/sim/:siteId），主控台通过 iframe + postMessage 驱动它，
 * 视觉与交互上都保持「这是一个真实存在的第三方网站」。
 *
 * 单独拆成客户端组件的原因：静态导出（output: 'export'）要求动态路由提供
 * generateStaticParams，而它只能由服务端组件导出——于是路由页负责枚举站点，
 * 这里负责渲染。服务端形态与静态形态共用同一份渲染逻辑。
 */
export default function SimSiteRoute({ siteId }: { siteId: string }) {
  const site = getSite(siteId);
  const [state, setState] = useState<SimState>({
    pageId: site.startPage,
    values: {},
    receipt: null,
    highlight: null,
  });
  const ready = useRef(false);

  useEffect(() => {
    setState({ pageId: site.startPage, values: {}, receipt: null, highlight: null });
  }, [site.startPage]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; state?: SimState } | null;
      if (!data || data.type !== 'wp:state' || !data.state) return;
      setState(data.state);
    };
    window.addEventListener('message', onMessage);
    if (!ready.current) {
      ready.current = true;
      window.parent.postMessage({ type: 'wp:hello' }, '*');
    }
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return <SimSite siteId={siteId} state={state} />;
}
