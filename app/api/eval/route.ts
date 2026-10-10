/**
 * GET /api/eval
 *
 * 把 scripts/eval-report.md 解析成结构化 JSON，直接在界面上展示自动化评测结果。
 * 目的：让「测试与 AI 辅助验证」这件事在演示现场可见，而不是只躺在仓库里。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REPORT = path.join(process.cwd(), 'scripts', 'eval-report.md');

interface EvalRow {
  id: string;
  site: string;
  type: string;
  passed: number;
  total: number;
  details: string[];
}

function parse(md: string) {
  const timeMatch = md.match(/生成时间：(\S+)/);
  const sumMatch = md.match(/用例数：(\d+)\s*断言通过：(\d+)\/(\d+)/);

  const rows: EvalRow[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*([a-z0-9-]+)\s*\|\s*([a-z-]+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\/(\d+)\s*\|\s*(.+?)\s*\|$/);
    if (!m) continue;
    rows.push({
      id: m[1],
      site: m[2],
      type: m[3],
      passed: Number(m[4]),
      total: Number(m[5]),
      details: m[6].split('；').map((s) => s.replace(/^[√✘]\s*/, '').trim()).filter(Boolean),
    });
  }

  return {
    generatedAt: timeMatch?.[1] ?? null,
    cases: sumMatch ? Number(sumMatch[1]) : rows.length,
    passed: sumMatch ? Number(sumMatch[2]) : rows.reduce((a, r) => a + r.passed, 0),
    total: sumMatch ? Number(sumMatch[3]) : rows.reduce((a, r) => a + r.total, 0),
    rows,
  };
}

export async function GET() {
  try {
    const md = await readFile(REPORT, 'utf8');
    return NextResponse.json({ ok: true, ...parse(md) });
  } catch {
    return NextResponse.json({
      ok: false,
      message: '尚未生成评测报告，请先执行 npm run verify 或 npm run eval',
    });
  }
}
