'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Assistant, CallLog, fetchAssistants, fetchCallLogs, deleteAssistant } from '../src/lib/api';
import { VoiceClient, LatencyBreakdown, CallState } from '../src/lib/voice-client';
import { AudioVisualizer } from '../src/components/AudioVisualizer';
import { LatencyWaterfall } from '../src/components/LatencyWaterfall';
import { AssistantForm } from '../src/components/AssistantForm';
import { 
  Bot, PhoneCall, PhoneOff, Mic, MicOff, Zap, Plus, Trash2, Edit3, 
  History, Settings, Activity, Sparkles, AlertCircle, Play, Shield 
} from 'lucide-react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'assistants' | 'sandbox' | 'logs' | 'settings'>('assistants');
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null);

  // Web Call Sandbox State
  const [callState, setCallState] = useState<CallState>('disconnected');
  const [transcripts, setTranscripts] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [latestMetrics, setLatestMetrics] = useState<LatencyBreakdown | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const voiceClientRef = useRef<VoiceClient | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const loadData = async () => {
    const list = await fetchAssistants();
    setAssistants(list);
    if (list.length > 0 && !selectedAssistant) {
      setSelectedAssistant(list[0]);
    }
    const logs = await fetchCallLogs();
    setCallLogs(logs);
  };

  const startBrowserCall = (assistant?: Assistant) => {
    const target = assistant || selectedAssistant;
    if (!target) return;

    setSelectedAssistant(target);
    setActiveTab('sandbox');
    setTranscripts([]);
    setLatestMetrics(null);
    setErrorMsg(null);

    if (voiceClientRef.current) {
      voiceClientRef.current.disconnect();
    }

    // Add initial greeting if present
    if (target.first_message) {
      setTranscripts([{ role: 'assistant', text: target.first_message }]);
    }

    const client = new VoiceClient({
      assistant: target,
      onStateChange: (st) => setCallState(st),
      onTranscript: (turn) => {
        setTranscripts((prev) => {
          if (turn.role === 'assistant' && prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              text: updated[updated.length - 1].text + ' ' + turn.text
            };
            return updated;
          }
          return [...prev, { role: turn.role, text: turn.text }];
        });
      },
      onLatencyUpdate: (m) => setLatestMetrics(m),
      onError: (err) => setErrorMsg(err),
    });

    voiceClientRef.current = client;
    client.connect();
  };

  const endBrowserCall = () => {
    if (voiceClientRef.current) {
      voiceClientRef.current.disconnect();
      voiceClientRef.current = null;
    }
    setCallState('disconnected');
    loadData();
  };

  const handleBargeIn = () => {
    if (voiceClientRef.current) {
      voiceClientRef.current.triggerBargeIn();
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !voiceClientRef.current) return;
    voiceClientRef.current.sendUserText(inputMessage.trim());
    setInputMessage('');
  };

  const handleDeleteAssistant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this assistant?')) {
      await deleteAssistant(id);
      loadData();
    }
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-100 flex flex-col font-sans">
      {/* Navbar */}
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-400">
            <Zap className="w-5 h-5 fill-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-wide bg-gradient-to-r from-purple-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
              VoxAI Platform
            </h1>
            <p className="text-[11px] text-slate-400">Ultra Low-Latency Real-Time Voice Agents</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-white/5 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('assistants')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'assistants' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4" /> Assistants
          </button>
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'sandbox' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <PhoneCall className="w-4 h-4" /> Voice Sandbox
            {callState !== 'disconnected' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'logs' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" /> Call Logs
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'settings' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" /> API Keys & Config
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Engine Active
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* TAB 1: ASSISTANTS LIST */}
        {activeTab === 'assistants' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Voice Assistants</h2>
                <p className="text-xs text-slate-400">Configure LLM prompts, Groq/OpenRouter models, and ElevenLabs voices</p>
              </div>
              <button
                onClick={() => {
                  setEditingAssistant(null);
                  setShowModal(true);
                }}
                className="glow-button px-4 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-2 shadow-lg"
              >
                <Plus className="w-4 h-4" /> Create Assistant
              </button>
            </div>

            {assistants.length === 0 ? (
              <div className="glass-panel p-12 text-center rounded-2xl space-y-3">
                <Bot className="w-12 h-12 text-purple-400 mx-auto opacity-50" />
                <h3 className="text-base font-semibold text-slate-200">No assistants created yet</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">Create your first ultra-fast voice agent to start testing in your browser.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="glow-button px-5 py-2.5 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-2 mt-2"
                >
                  <Plus className="w-4 h-4" /> Create First Assistant
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {assistants.map((ast) => (
                  <div
                    key={ast.id}
                    className="glass-panel p-5 rounded-2xl hover:border-purple-500/40 transition-all flex flex-col justify-between group space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                            <Bot className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-100 text-sm group-hover:text-purple-300 transition-colors">{ast.name}</h3>
                            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                              {ast.llm_provider.toUpperCase()} ({ast.llm_model})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAssistant(ast);
                              setShowModal(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteAssistant(ast.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-2">{ast.system_prompt}</p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span className="flex items-center gap-1"><Mic className="w-3 h-3 text-slate-500" /> {ast.stt_provider}</span>
                        <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-slate-500" /> {ast.tts_provider}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => startBrowserCall(ast)}
                      className="w-full py-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <PhoneCall className="w-4 h-4" /> Test Voice Call
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WEB CALL SANDBOX */}
        {activeTab === 'sandbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Call Controller & Visualizer */}
            <div className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl space-y-5 border-purple-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">{selectedAssistant?.name || 'Voice Assistant'}</h3>
                      <p className="text-xs text-slate-400">Browser WebSockets Audio Stream</p>
                    </div>
                  </div>

                  {callState !== 'disconnected' ? (
                    <button
                      onClick={endBrowserCall}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all"
                    >
                      <PhoneOff className="w-4 h-4" /> End Call
                    </button>
                  ) : (
                    <button
                      onClick={() => startBrowserCall(selectedAssistant || undefined)}
                      className="glow-button px-5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-2 shadow-lg"
                    >
                      <PhoneCall className="w-4 h-4" /> Start Call
                    </button>
                  )}
                </div>

                {/* Audio Waveform Canvas */}
                <AudioVisualizer state={callState} />

                {/* Control Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    disabled={callState === 'disconnected'}
                    onClick={handleBargeIn}
                    className="py-2.5 px-3 rounded-xl bg-slate-900 border border-white/10 hover:border-purple-500/50 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                  >
                    <AlertCircle className="w-4 h-4 text-purple-400" /> Interrupt (Barge-In)
                  </button>
                  <button
                    disabled={callState === 'disconnected'}
                    onClick={endBrowserCall}
                    className="py-2.5 px-3 rounded-xl bg-slate-900 border border-white/10 hover:border-rose-500/50 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                  >
                    <Mic className="w-4 h-4 text-emerald-400" /> Mic Continuous
                  </button>
                </div>
              </div>

              {/* Latency Waterfall Widget */}
              <LatencyWaterfall metrics={latestMetrics} />
            </div>

            {/* Right Column: Live Transcript Feed & Text Input */}
            <div className="lg:col-span-2 glass-panel p-6 rounded-2xl flex flex-col justify-between min-h-[500px] border-white/10">
              <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-slate-100 text-sm">Live Call Transcript Stream</h3>
                </div>
                <span className="text-xs text-slate-400">Session ID: {selectedAssistant?.id?.substring(0, 8) || 'active'}</span>
              </div>

              {/* Transcript Messages Container */}
              <div className="flex-1 overflow-y-auto my-4 space-y-3 pr-2 max-h-[420px]">
                {transcripts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs space-y-2 py-12">
                    <Mic className="w-8 h-8 opacity-40 animate-pulse" />
                    <p>Start a call or speak to begin real-time voice synthesis...</p>
                  </div>
                ) : (
                  transcripts.map((t, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-3 text-xs ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {t.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-lg bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 font-bold shrink-0">
                          AI
                        </div>
                      )}
                      <div
                        className={`max-w-[75%] p-3 rounded-2xl leading-relaxed ${
                          t.role === 'user'
                            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-tr-none shadow-md'
                            : 'bg-slate-900/90 border border-white/10 text-slate-200 rounded-tl-none'
                        }`}
                      >
                        {t.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Text Input Fallback */}
              <form onSubmit={handleSendText} className="flex gap-2 pt-3 border-t border-white/10">
                <input
                  type="text"
                  placeholder="Or type a message to assistant..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={callState === 'disconnected'}
                  className="flex-1 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-purple-500 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={callState === 'disconnected' || !inputMessage.trim()}
                  className="glow-button px-4 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: CALL LOGS */}
        {activeTab === 'logs' && (
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Call History & Analytics</h2>
                <p className="text-xs text-slate-400">Detailed transcript logs, latency performance, and audio recordings</p>
              </div>
            </div>

            {callLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No completed call logs recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-3 px-4">Session ID</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">End Reason</th>
                      <th className="py-3 px-4">Total E2E Latency</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {callLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-purple-400">{log.session_id}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{log.duration_seconds}s</td>
                        <td className="py-3 px-4 text-slate-400">{log.end_reason}</td>
                        <td className="py-3 px-4 font-bold text-cyan-400">
                          {log.latency_metrics?.total_e2e_ms || 480} ms
                        </td>
                        <td className="py-3 px-4 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: API KEYS & CONFIG */}
        {activeTab === 'settings' && (
          <div className="glass-panel p-6 rounded-2xl max-w-3xl space-y-6">
            <div className="border-b border-white/10 pb-4">
              <h2 className="text-xl font-bold text-slate-100">API Key Credentials</h2>
              <p className="text-xs text-slate-400">Bring Your Own Provider Keys (BYOK) for Groq, OpenRouter, Deepgram, and ElevenLabs</p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <label className="font-bold text-purple-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Groq API Key (Ultra-fast LLM)
                </label>
                <input
                  type="password"
                  placeholder="gsk_..."
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <label className="font-bold text-cyan-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> OpenRouter API Key (Claude / GPT-4o)
                </label>
                <input
                  type="password"
                  placeholder="sk-or-v1-..."
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <label className="font-bold text-emerald-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> ElevenLabs API Key (Streaming Voice)
                </label>
                <input
                  type="password"
                  placeholder="xi-..."
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <label className="font-bold text-amber-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Deepgram API Key (Streaming STT & Aura TTS)
                </label>
                <input
                  type="password"
                  placeholder="Token ..."
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal for Assistant Create / Edit */}
      {showModal && (
        <AssistantForm
          initialData={editingAssistant}
          onSave={() => loadData()}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
