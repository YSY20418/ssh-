import SimSiteRoute from '@/components/SimSiteRoute';
import { listSites } from '@/lib/sim/registry';

/**
 * 被代驾站点的路由入口（服务端组件，仅负责枚举站点）
 *
 * 静态导出时动态路由必须有 generateStaticParams，否则构建会失败。
 * 站点清单来自注册表，因此新增站点会自动获得一个可独立访问的静态地址。
 */
export function generateStaticParams() {
  return listSites().map((s) => ({ site: s.id }));
}

export default async function Page({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  return <SimSiteRoute siteId={site} />;
}
