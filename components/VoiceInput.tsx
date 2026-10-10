'use client';

import { useEffect, useState } from 'react';

interface Props {
  onResult: (text: string) => void;
  disabled?: boolean;
}

/**
 * 语音输入：老人不打字也能发起代驾。
 * 浏览器不支持时自动降级为「仅文字输入」，不影响主流程。
 */
export default function VoiceInput({ onResult, disabled }: Props) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const w = window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown };
    setSupported(Boolean(w.webkitSpeechRecognition || w.SpeechRecognition));
  }, []);

  function start() {
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const text = event.results?.[0]?.[0]?.transcript ?? '';
      if (text) onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  if (!supported) {
    return (
      <span className="text-[13px] text-[#9aa3af]">当前浏览器不支持语音输入，可直接打字</span>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || listening}
      className={`rounded-lg border px-4 py-3 text-[15px] transition ${
        listening ? 'border-[#1668dc] bg-[#e6f1fb] text-[#1668dc]' : 'border-[#c8d0da] bg-white text-[#4b5563]'
      }`}
    >
      {listening ? '正在听…' : '按住说话'}
    </button>
  );
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
