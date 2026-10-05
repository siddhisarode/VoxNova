'use client';
import React from 'react';
import { LatencyBreakdown } from '../lib/voice-client';
import { Zap, Clock, Cpu, Mic, Volume2 } from 'lucide-react';

interface LatencyWaterfallProps {
  metrics: LatencyBreakdown | null;
}

export const LatencyWaterfall: React.FC<LatencyWaterfallProps> = ({ metrics }) => {
  const data = metrics || {
    stt_latency_ms: 110,
    llm_ttft_ms: 240,
    tts_ttfa_ms: 180,
    total_e2e_ms: 530,
  };

  const isBelowTarget = data.total_e2e_ms <= 800;

  return (
    <div className="glass-panel p-5 rounded-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-purple-400" />
          <h3 className="font-semibold text-slate-100 text-sm tracking-wide">Real-time Latency Breakdown</h3>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
          isBelowTarget ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
        }`}>
          <Clock className="w-3.5 h-3.5" />
          <span>{data.total_e2e_ms} ms</span>
          <span className="text-[10px] opacity-75">(Target: &lt;800ms)</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* STT Metric */}
        <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Mic className="w-3.5 h-3.5 text-cyan-400" />
            <span>STT Transcript</span>
          </div>
          <p className="text-base font-bold text-slate-100">{data.stt_latency_ms} <span className="text-xs font-normal text-slate-400">ms</span></p>
        </div>

        {/* LLM TTFT Metric */}
        <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>LLM TTFT (Groq)</span>
          </div>
          <p className="text-base font-bold text-slate-100">{data.llm_ttft_ms} <span className="text-xs font-normal text-slate-400">ms</span></p>
        </div>

        {/* TTS TTFA Metric */}
        <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>TTS TTFA (Synth)</span>
          </div>
          <p className="text-base font-bold text-slate-100">{data.tts_ttfa_ms} <span className="text-xs font-normal text-slate-400">ms</span></p>
        </div>
      </div>

      {/* Progress / Waterfall bar */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>0ms</span>
          <span>Pipeline Stage Progress</span>
          <span>800ms Target</span>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden flex">
          <div style={{ width: `${Math.min(100, (data.stt_latency_ms / 800) * 100)}%` }} className="bg-cyan-500 h-full" title="STT" />
          <div style={{ width: `${Math.min(100, (data.llm_ttft_ms / 800) * 100)}%` }} className="bg-purple-500 h-full" title="LLM TTFT" />
          <div style={{ width: `${Math.min(100, (data.tts_ttfa_ms / 800) * 100)}%` }} className="bg-emerald-500 h-full" title="TTS TTFA" />
        </div>
      </div>
    </div>
  );
};
