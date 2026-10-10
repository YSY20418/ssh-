/**
 * 大模型接入层（零成本优先）
 *
 * 使用 OpenAI 兼容协议，因此国内外厂商与本地模型都能一行切换，不锁定单一厂商。
 * 内置若干「有永久免费额度」的 Provider 预设，全程零成本即可跑通在线大模型链路。
 *
 * 未配置密钥时自动降级为规则引擎 —— 保证任何环境（含离线环境）演示都跑得起来。
 */

import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export type Engine = 'llm' | 'rule';

export interface ProviderPreset {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  /** 是否提供永久免费额度 */
  free: boolean;
  note: string;
}

/**
 * 免费额度参考（2026-10）
 * - 智谱 GLM-4.7-Flash / GLM-4.5-Flash：永久免费
 * - 硅基流动：小参数模型永久免费（Qwen3-8B 等）
 * - OpenRouter：名称带 :free 的模型每日免费额度
 * - 魔搭 ModelScope：注册用户每日免费额度
 * - local：Ollama / vLLM 自部署，零调用成本
 */
export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.7-flash',
    free: true,
    note: 'GLM-4.7-Flash 永久免费，中文能力强，国内直连',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseURL: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen3-8B',
    free: true,
    note: '小参数模型永久免费，注册另赠额度',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen3.6-plus:free',
    free: true,
    note: ':free 后缀模型每日免费额度，聚合 300+ 模型',
  },
  {
    id: 'modelscope',
    name: '魔搭 ModelScope',
    baseURL: 'https://api-inference.modelscope.cn/v1',
    model: 'Qwen/Qwen3-8B',
    free: true,
    note: '注册用户每日免费额度',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    free: false,
    note: '定价极低，非免费但成本可控',
  },
  {
    id: 'dashscope',
    name: '阿里云百炼',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    free: false,
    note: '每个模型独立免费额度',
  },
  {
    id: 'local',
    name: '本地模型（Ollama / vLLM）',
    baseURL: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    free: true,
    note: '自部署，零调用成本且数据不出本机',
  },
];

export function resolveProvider(): ProviderPreset {
  const id = process.env.LLM_PROVIDER?.trim();
  if (id) {
    const hit = PROVIDERS.find((p) => p.id === id);
    if (hit) return hit;
  }
  return PROVIDERS[0];
}

export function engineKind(): Engine {
  const key = process.env.LLM_API_KEY?.trim();
  if (!key) return 'rule';
  if (process.env.USE_MOCK_ENGINE === '1') return 'rule';
  return 'llm';
}

function buildModel() {
  const apiKey = process.env.LLM_API_KEY!.trim();
  const preset = resolveProvider();
  const baseURL = process.env.LLM_BASE_URL?.trim() || preset.baseURL;
  const modelId = process.env.LLM_MODEL?.trim() || preset.model;
  const provider = createOpenAI({ apiKey, baseURL });
  return provider(modelId);
}

/** 当前生效的模型信息（界面与日志展示用） */
export function modelInfo(): { provider: string; model: string; engine: Engine } {
  const preset = resolveProvider();
  return {
    provider: preset.name,
    model: process.env.LLM_MODEL?.trim() || preset.model,
    engine: engineKind(),
  };
}

/**
 * 流式文本补全；无密钥时抛错由调用方降级。
 */
export async function* streamCompletion(
  system: string,
  prompt: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const result = streamText({
    model: buildModel(),
    system,
    prompt,
    temperature: 0.2,
    abortSignal: signal,
  });

  for await (const delta of result.textStream) {
    yield delta;
  }
}

/** 从可能被代码块包裹的输出中抢救出第一个 JSON 对象 */
export function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}
