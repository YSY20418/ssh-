/**
 * 办事指南知识库 + 轻量检索器（RAG）
 *
 * 为什么必须要有 RAG：老人不会说「挂骨科」，他只会说「我这膝盖上下楼疼」。
 * 症状到科室的映射、就诊材料、退改规则都不在大模型的常识里稳定覆盖，
 * 用本地知识库检索增强后，生成的预约方案才真正可用。
 *
 * 检索实现：中文二元组 + 英文单词的 TF-IDF 打分，零外部依赖、可在边缘运行。
 */

export interface GuideChunk {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export const GUIDES: GuideChunk[] = [
  {
    id: 'g-symptom-joint',
    title: '症状与科室对应：骨关节',
    content: '膝盖疼、上下楼疼痛、腰腿疼、关节肿胀、扭伤、骨折复查，建议挂骨科。老年人膝关节退行性病变首诊骨科。',
    tags: ['膝盖', '关节', '骨科', '腰腿'],
  },
  {
    id: 'g-symptom-internal',
    title: '症状与科室对应：内科',
    content: '头晕、血压高、血糖高、咳嗽、发烧、腹痛、心慌、胸闷、糖尿病复诊、高血压开药，建议挂内科。',
    tags: ['头晕', '血压', '血糖', '咳嗽', '发烧', '内科'],
  },
  {
    id: 'g-symptom-eye',
    title: '症状与科室对应：眼科',
    content: '视物模糊、眼睛干涩、白内障复查、飞蚊症、眼睛红痛，建议挂眼科。老年人白内障术后复查挂眼科。',
    tags: ['眼睛', '视物', '白内障', '眼科'],
  },
  {
    id: 'g-symptom-child',
    title: '症状与科室对应：儿科',
    content: '14 岁以下儿童发烧、咳嗽、腹泻、疫苗接种、生长发育评估，挂儿科。儿童就医须携带监护人身份证。',
    tags: ['小孩', '儿童', '孩子', '儿科'],
  },
  {
    id: 'g-symptom-dental',
    title: '症状与科室对应：口腔科',
    content: '牙疼、牙龈出血、补牙、拔牙、假牙修复、洗牙，挂口腔科。',
    tags: ['牙', '口腔', '牙疼'],
  },
  {
    id: 'g-material',
    title: '就诊必备材料',
    content: '首次就诊需携带：本人身份证原件、医保卡或电子医保凭证、既往病历与检查报告。代人预约需同时提供就诊人本人身份证号与可接收短信的手机号。',
    tags: ['材料', '身份证', '医保', '病历'],
  },
  {
    id: 'g-time',
    title: '号源与放号时间',
    content: '普通门诊号源每日 08:00 放出未来 3 天号源；专家门诊号源提前 7 天放出，数量有限。上午号建议 07:40 前到院取号，下午号 13:00 前取号。',
    tags: ['号源', '放号', '时间', '取号'],
  },
  {
    id: 'g-cancel',
    title: '退号与改约规则',
    content: '就诊日前一天 17:00 前可在原渠道免费退号或改约；逾期未取号视为爽约，累计 3 次爽约将暂停线上预约 90 天。',
    tags: ['退号', '改约', '爽约', '取消'],
  },
  {
    id: 'g-elder',
    title: '老年人便利服务',
    content: '65 岁以上患者可在门诊一楼「银发服务台」获得志愿者全程陪同，免排队取号；行动不便者可在一楼租借轮椅，需缴纳押金 200 元。',
    tags: ['老年人', '银发', '轮椅', '陪同', '志愿者'],
  },
  {
    id: 'g-payment',
    title: '缴费与医保',
    content: '预约阶段不收取费用，就诊当日到院缴费。职工医保门诊报销比例 70%，居民医保 50%，需持医保卡或电子医保凭证实时结算。',
    tags: ['缴费', '医保', '报销', '费用'],
  },
];

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  for (const w of lower.split(/[^a-z0-9\u4e00-\u9fa5]+/)) {
    if (w) tokens.push(w);
  }
  const han = text.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < han.length - 1; i += 1) {
    tokens.push(han.slice(i, i + 2));
  }
  return tokens;
}

const DOC_TERMS: Map<string, Map<string, number>> = new Map();
let IDF: Map<string, number> | null = null;

function buildIndex(): void {
  if (IDF) return;
  const df = new Map<string, number>();
  for (const g of GUIDES) {
    const text = `${g.title} ${g.content} ${g.tags.join(' ')}`;
    const tf = new Map<string, number>();
    for (const t of tokenize(text)) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    DOC_TERMS.set(g.id, tf);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  IDF = new Map();
  const n = GUIDES.length;
  for (const [term, count] of df) {
    IDF.set(term, Math.log((n + 1) / (count + 1)) + 1);
  }
}

export interface Retrieved {
  chunk: GuideChunk;
  score: number;
}

export function retrieve(query: string, topK = 3): Retrieved[] {
  buildIndex();
  const q = new Map<string, number>();
  for (const t of tokenize(query)) q.set(t, (q.get(t) ?? 0) + 1);

  const scored: Retrieved[] = GUIDES.map((chunk) => {
    const tf = DOC_TERMS.get(chunk.id)!;
    let score = 0;
    for (const [term, qtf] of q) {
      const dtf = tf.get(term);
      if (!dtf) continue;
      score += qtf * (1 + Math.log(dtf)) * (IDF!.get(term) ?? 1);
    }
    for (const tag of chunk.tags) {
      if (query.includes(tag)) score += 3;
    }
    return { chunk, score };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function formatContext(results: Retrieved[]): string {
  if (!results.length) return '（知识库未命中，请依据常识谨慎判断，并在回执中提示用户核实）';
  return results.map((r) => `[${r.chunk.title}] ${r.chunk.content}`).join('\n');
}
