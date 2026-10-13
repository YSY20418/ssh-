import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '小鱼儿 · 网页代驾 Agent',
  description:
    '面向银发群体的 AI 网页代驾：一句话说出需求，智能体替你在真实网页流程里跑完全部步骤，高危动作必须本人授权。',
  keywords: ['AI Agent', 'Browser Agent', '适老化', '网页代驾', 'MCP', '银发数字鸿沟'],
};

export const viewport: Viewport = {
  themeColor: '#12508f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
