/**
 * 两种构建形态：
 *  - 默认（服务端形态）：next dev / next start，带 /api/* 接口；
 *  - NEXT_PUBLIC_STATIC=1（静态形态）：output: 'export'，产出纯静态 out/ 目录，
 *    丢到任意静态空间即可用 http 打开，不需要 Node 服务。
 *
 * 静态形态下 Agent 引擎在浏览器里跑（见 lib/runtime/），
 * 因此代驾流程、授权门禁、脱敏、审计全部保留，只是没有了服务端接口。
 */

const isStatic = process.env.NEXT_PUBLIC_STATIC === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // 服务端状态机在 dev 下也应保持单例
    serverActions: {},
  },
  ...(isStatic
    ? {
        output: 'export',
        // 输出为「目录 + index.html」，任意静态服务器都能正确索引
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  // 可通过环境变量切换构建目录。受限环境（沙箱/只读策略）下 Next 清理
  // 默认 .next 可能被安全策略拦截，指定一个独立目录即可规避。
  ...(process.env.NEXT_DIST_DIR
    ? { distDir: process.env.NEXT_DIST_DIR }
    : isStatic
      ? // 导出模式下产物直接落在 distDir，因此把它指向 out/
        { distDir: 'out' }
      : {}),
};

export default nextConfig;
