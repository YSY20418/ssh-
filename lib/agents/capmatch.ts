/**
 * 能力语义检索（Tool RAG）
 *
 * 为什么需要它
 * ──────────────
 * 「能力优先于 UI」的防幻觉闸门要求：智能体只能调用当前页声明过的能力 id。
 * 但精确匹配在真实场景里会撞墙——老人说的是「帮我把下面那个蓝色的点了」
 * 「就那个确认的」，而不是能力 id；大模型也可能输出一个形近但错误的 id。
 *
 * 于是这里把 RAG 的思路用在「工具选择」上（Tool RAG，2026 年 Agent 领域的
 * 主流做法）：先用语义检索把候选能力缩小到几个，再交给确定性代码精确校验。
 * 检索负责「召回」，能力清单负责「放行」——两者之间没有模糊地带。
 *
 * 为什么不用向量库
 * ──────────────
 * 目标是零成本、零依赖、离线可跑。中文二元组 TF-IDF 对这种十几条的短清单
 * 效果足够，且没有嵌入模型下载与冷启动成本。
 *
 * 安全边界
 * ──────────────
 * 检索结果**不直接执行**。只有当相似度跨过 AUTO_ACCEPT 阈值才允许自动纠正，
 * 且纠正后仍然完整走一遍风险裁决与人工授权门禁。低于阈值一律拦截并告知用户。
 */

/** 相似度达到该值才允许「自动纠正」为一个具体能力 */
export const AUTO_ACCEPT = 0.62;
/** 低于该值认为毫无关联 */
const MIN_RELEVANT = 0.28;

/** 轻量能力描述：只依赖 id 与 label，与具体站点无关 */
export interface CapLike {
  id: string;
  label: string;
}

export interface CapMatch {
  id: string;
  label: string;
  /** 归一化到 0~1 的相似度 */
  score: number;
  /** 是否达到可自动纠正的置信度 */
  confident: boolean;
}

/** 中文按二元组切分，其余按词切分（与 rag/guides.ts 保持一致） */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const w of text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/)) {
    if (w) tokens.push(w);
  }
  const han = text.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < han.length - 1; i += 1) tokens.push(han.slice(i, i + 2));
  return tokens;
}

function termFreq(text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/**
 * 编辑距离相似度（Levenshtein 归一化）。
 *
 * 用来捕捉「形近错误」：模型输出的 id 常常只是多打一个字母、大小写或下划线
 * 写法不同（click_submitBooking / click_submmitBooking）。这类错误在语义上
 * 和正确 id 几乎不共享 token，余弦相似度会判成「毫无关系」，而编辑距离能稳稳抓住。
 */
function editSimilarity(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
}

/**
 * 多信号融合的相似度，取「语义」与「字面」两条路的较强者。
 *
 * 语义路（余弦 + 包含加成）：负责「老人说的是人话」——
 *   中文二元组能抓住「确认并提交」与「确认预约并提交」的共享片段，
 *   再叠加 label 核心字加成，让「帮我点确认」稳定命中「确认并提交」而不是「上一步」。
 *
 * 字面路（编辑距离）：负责「模型把 id 拼错了」——
 *   形近错误在语义上几乎不共享 token，只有编辑距离抓得住。
 *
 * 两路取最大值，保证任意一条路足够强就能召回；无关查询两条路都低，自然被阈值挡掉。
 */
function similarity(query: string, queryTf: Map<string, number>, cap: CapLike): number {
  const docText = `${cap.label} ${cap.id}`;
  const docTf = termFreq(docText);

  let dot = 0;
  let qNorm = 0;
  let dNorm = 0;
  for (const [, v] of queryTf) qNorm += v * v;
  for (const [, v] of docTf) dNorm += v * v;
  for (const [t, qv] of queryTf) {
    const dv = docTf.get(t);
    if (dv) dot += qv * dv;
  }
  const cosine = qNorm && dNorm ? dot / Math.sqrt(qNorm * dNorm) : 0;

  let bonus = 0;
  if (query.includes(cap.label)) bonus += 0.35;
  for (const ch of cap.label) {
    if (/[\u4e00-\u9fa5]/.test(ch) && query.includes(ch)) bonus += 0.05;
  }

  const semantic = Math.min(1, cosine + bonus);
  const literal = editSimilarity(query, cap.id);
  return Math.min(1, Math.max(semantic, literal));
}

/**
 * 给定一个说法（可能是老人原话，也可能是模型输出的错 id），
 * 在能力清单里找出最像的那一个。
 */
export function matchCapability(query: string, caps: CapLike[]): CapMatch | null {
  const q = String(query ?? '').trim();
  if (!q || !caps.length) return null;

  const queryTf = termFreq(q);
  let best: CapMatch | null = null;
  for (const cap of caps) {
    const score = similarity(q, queryTf, cap);
    if (!best || score > best.score) {
      best = { id: cap.id, label: cap.label, score, confident: score >= AUTO_ACCEPT };
    }
  }
  if (!best) return null;
  // 毫无关联时返回 null，避免「随便挑一个」导致的误操作
  return best.score < MIN_RELEVANT ? null : best;
}

/** 供界面与审计展示：把检索结论说成人话 */
export function describeMatch(m: CapMatch): string {
  const pct = Math.round(m.score * 100);
  return m.confident
    ? `按语义匹配到能力「${m.label}」（置信度 ${pct}%），已自动纠正后执行`
    : `最接近的能力是「${m.label}」，但置信度只有 ${pct}%，未达自动执行阈值，已拦截`;
}
