'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Assistant, CallLog, fetchAssistants, fetchCallLogs, deleteAssistant, deleteCallLog, summarizeCall, getExportCallLogsUrl } from '../src/lib/api';
import { VoiceClient, LatencyBreakdown, CallState } from '../src/lib/voice-client';
import { AudioVisualizer } from '../src/components/AudioVisualizer';
import { LatencyWaterfall } from '../src/components/LatencyWaterfall';
import { AssistantForm } from '../src/components/AssistantForm';
import { 
  Bot, PhoneCall, PhoneOff, Mic, Zap, Plus, Trash2, Edit3, 
  History, Settings, Activity, Sparkles, AlertCircle, Shield, 
  ChevronRight, X, Clock, MessageSquare, Check, RefreshCw, Download, Volume2, Headphones
} from 'lucide-react';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'assistants' | 'sandbox' | 'logs' | 'settings'>('assistants');
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null);
  const [selectedCallLog, setSelectedCallLog] = useState<CallLog | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // BYOK Credentials (localStorage)
  const [apiKeys, setApiKeys] = useState({
    groq: '',
    openrouter: '',
    elevenlabs: '',
    deepgram: ''
  });
  const [keysSaved, setKeysSaved] = useState(false);

  // Web Call Sandbox State
  const [callState, setCallState] = useState<CallState>('disconnected');
  const [echoMode, setEchoMode] = useState<'speaker' | 'headphones'>('speaker');
  const [transcripts, setTranscripts] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [latestMetrics, setLatestMetrics] = useState<LatencyBreakdown | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const voiceClientRef = useRef<VoiceClient | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const QUICK_PROMPTS = [
    "I'd like to inquire about admission for my child.",
    "What are the fees for Grade 8?",
    "Can you tell me about the school timings and campus tours?",
    "Test interruption: count slowly from 1 to 10."
  ];

  useEffect(() => {
    loadData();
    // Load stored API keys if present
    try {
      const stored = localStorage.getItem('voxai_api_keys');
      if (stored) {
        setApiKeys(JSON.parse(stored));
      }
    } catch (e) {}
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

  const handleSaveKeys = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('voxai_api_keys', JSON.stringify(apiKeys));
      setKeysSaved(true);
      setTimeout(() => setKeysSaved(false), 2500);
    } catch (e) {
      console.error(e);
    }
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

    const client = new VoiceClient({
      assistant: target,
      echoMode: echoMode,
      apiKeys: {
        groq: apiKeys.groq || undefined,
        openrouter: apiKeys.openrouter || undefined,
        elevenlabs: apiKeys.elevenlabs || undefined,
        deepgram: apiKeys.deepgram || undefined,
      },
      onStateChange: (st) => setCallState(st),
      onTranscript: (turn) => {
        setTranscripts((prev) => {
          if (turn.role === 'assistant') {
            if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
              const last = prev[prev.length - 1];
              // Avoid duplicate if text already recorded or identical
              if (last.text.trim() === turn.text.trim() || last.text.endsWith(turn.text)) {
                return prev;
              }
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                text: `${last.text} ${turn.text}`.trim()
              };
              return updated;
            }
            return [...prev, { role: 'assistant', text: turn.text }];
          }

          if (turn.role === 'user') {
            if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
              if (prev[prev.length - 1].text.trim() === turn.text.trim()) {
                return prev;
              }
            }
            return [...prev, { role: 'user', text: turn.text }];
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
    setTimeout(() => {
      loadData();
    }, 600);
  };

  const handleBargeIn = () => {
    if (voiceClientRef.current) {
      voiceClientRef.current.triggerBargeIn();
    }
  };

  // Keyboard shortcut: Press Spacebar anywhere during an active call to interrupt (barge-in)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        callState !== 'disconnected' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        handleBargeIn();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callState]);

  const handleSendText = (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || !voiceClientRef.current) return;
    voiceClientRef.current.sendUserText(textToSend.trim());
    if (!customText) setInputMessage('');
  };

  const handleDeleteAssistant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this assistant?')) {
      await deleteAssistant(id);
      loadData();
    }
  };

  const handleDeleteCallLog = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this call log record?')) {
      await deleteCallLog(id);
      if (selectedCallLog?.id === id) {
        setSelectedCallLog(null);
      }
      loadData();
    }
  };

  const handleSummarizeCall = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setIsSummarizing(true);
      const updated = await summarizeCall(id);
      if (selectedCallLog?.id === id) {
        setSelectedCallLog(updated);
      }
      setCallLogs((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      console.error('Failed to summarize call:', err);
    } finally {
      setIsSummarizing(false);
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
              VoxNova
            </h1>
            <p className="text-[11px] text-slate-400">Ultra Low-Latency Real-Time Voice Agent Platform</p>
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
            {callLogs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-purple-300">
                {callLogs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'settings' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" /> API Credentials
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            title="Refresh Data"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-white/5 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Sub-800ms Pipeline
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Error notification banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: ASSISTANTS LIST */}
        {activeTab === 'assistants' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Voice Assistants</h2>
                <p className="text-xs text-slate-400">Configure LLM prompts, Groq/OpenRouter models, and ElevenLabs/Deepgram voices</p>
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
                        <span className="flex items-center gap-1"><Mic className="w-3 h-3 text-cyan-400" /> {ast.stt_provider}</span>
                        <span className="flex items-center gap-1"><Volume2 className="w-3 h-3 text-purple-400" /> {ast.tts_voice_id?.replace('aura-', '') || ast.tts_provider}</span>
                        <span className="flex items-center gap-1 text-amber-400 font-mono">Temp: {(ast.temperature ?? 0.7).toFixed(2)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => startBrowserCall(ast)}
                      className="w-full py-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <PhoneCall className="w-4 h-4" /> Start Voice Call
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WEB CALL SANDBOX */}
        {activeTab === 'sandbox' && (
          <div className="space-y-4">
            {/* Assistant Selector Bar */}
            <div className="glass-panel px-5 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-4 border-white/10">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Assistant:</span>
                <select
                  value={selectedAssistant?.id || ''}
                  onChange={(e) => {
                    const found = assistants.find((a) => a.id === e.target.value);
                    if (found) {
                      setSelectedAssistant(found);
                      if (callState !== 'disconnected') {
                        endBrowserCall();
                      }
                    }
                  }}
                  className="bg-slate-900 border border-purple-500/30 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-semibold focus:outline-none focus:border-purple-500"
                >
                  {assistants.map((ast) => (
                    <option key={ast.id} value={ast.id}>
                      {ast.name} ({ast.llm_provider} / {ast.tts_provider})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>Model: <strong className="text-cyan-400">{selectedAssistant?.llm_model}</strong></span>
                <span>Voice: <strong className="text-purple-400">{selectedAssistant?.tts_provider}</strong></span>
              </div>
            </div>

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
                        <p className="text-xs text-slate-400">WebSocket Full-Duplex Audio</p>
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

                  {/* Control Actions & Echo Prevention Mode */}
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        disabled={callState === 'disconnected'}
                        onClick={handleBargeIn}
                        title="Interrupt the assistant immediately (or press Spacebar)"
                        className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 ${
                          callState === 'speaking'
                            ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/50 animate-pulse'
                            : 'bg-slate-900 border-white/10 hover:border-purple-500/50 text-slate-200'
                        }`}
                      >
                        <AlertCircle className="w-4 h-4 text-purple-300" />
                        <span>Interrupt</span>
                        <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-mono bg-purple-950/70 border border-purple-400/40 rounded text-purple-200">Space</kbd>
                      </button>

                      <button
                        disabled={callState === 'disconnected'}
                        onClick={endBrowserCall}
                        className="py-2.5 px-3 rounded-xl bg-rose-600/20 border border-rose-500/40 hover:bg-rose-600/30 text-rose-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                      >
                        <PhoneOff className="w-4 h-4 text-rose-400" /> End Call
                      </button>
                    </div>

                    {/* Acoustic Echo Cancellation Mode Switcher */}
                    <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {echoMode === 'speaker' ? (
                          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                            <Volume2 className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <Headphones className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-200 text-xs">
                              {echoMode === 'speaker' ? 'Laptop Speakers' : 'Headphones Mode'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                              {echoMode === 'speaker' ? 'Echo-Protected' : 'Full Duplex'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            {echoMode === 'speaker'
                              ? 'Mic mutes while AI speaks (prevents speaker self-loop)'
                              : 'Continuous mic active at all times'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const nextMode = echoMode === 'speaker' ? 'headphones' : 'speaker';
                          setEchoMode(nextMode);
                          voiceClientRef.current?.setEchoMode(nextMode);
                        }}
                        className="px-2.5 py-1.5 text-[10px] font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-cyan-300 hover:text-cyan-200 transition-all shrink-0"
                      >
                        Switch to {echoMode === 'speaker' ? 'Headphones' : 'Speakers'}
                      </button>
                    </div>

                    {/* Dynamic Status Banner */}
                    {callState !== 'disconnected' && (
                      <div className={`p-2 rounded-xl text-center text-xs font-medium border transition-all ${
                        callState === 'speaking' && echoMode === 'speaker'
                          ? 'bg-purple-950/40 border-purple-500/30 text-purple-300'
                          : callState === 'listening'
                          ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-900/60 border-white/5 text-slate-400'
                      }`}>
                        {callState === 'speaking' && echoMode === 'speaker' && (
                          <span className="flex items-center justify-center gap-1.5">
                            <Volume2 className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                            AI Speaking &bull; Mic safely muted against speaker echo
                          </span>
                        )}
                        {callState === 'listening' && (
                          <span className="flex items-center justify-center gap-1.5">
                            <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                            Listening to you &bull; Speak your question now...
                          </span>
                        )}
                        {callState === 'thinking' && (
                          <span className="flex items-center justify-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
                            Thinking and synthesizing reply...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Latency Waterfall Widget */}
                <LatencyWaterfall metrics={latestMetrics} />
              </div>

              {/* Right Column: Live Transcript Feed & Text Input */}
              <div className="lg:col-span-2 glass-panel p-6 rounded-2xl flex flex-col justify-between min-h-[520px] border-white/10">
                <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    <h3 className="font-bold text-slate-100 text-sm">Live Call Transcript Stream</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Session: {selectedAssistant?.id?.substring(0, 8) || 'active'}
                  </span>
                </div>

                {/* Transcript Messages Container */}
                <div className="flex-1 overflow-y-auto my-4 space-y-3 pr-2 max-h-[380px]">
                  {transcripts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-xs space-y-3 py-16">
                      <Mic className="w-10 h-10 opacity-30 animate-pulse text-purple-400" />
                      <p className="text-slate-400 font-medium">Click &quot;Start Call&quot; to begin your conversation with {selectedAssistant?.name || 'the assistant'}.</p>
                      <p className="text-[11px] text-slate-500">You can speak into your microphone or type messages below.</p>
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

                {/* Quick Prompts Chips */}
                <div className="pt-2 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-semibold">Try asking:</span>
                    {QUICK_PROMPTS.map((prompt, pIdx) => (
                      <button
                        key={pIdx}
                        disabled={callState === 'disconnected'}
                        onClick={() => handleSendText(undefined, prompt)}
                        className="px-2.5 py-1 rounded-full bg-slate-900/80 hover:bg-purple-950/60 border border-white/5 hover:border-purple-500/40 text-[11px] text-slate-300 transition-all disabled:opacity-40"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Input Fallback */}
                <form onSubmit={handleSendText} className="flex gap-2 pt-3 border-t border-white/10">
                  <input
                    type="text"
                    placeholder={callState !== 'disconnected' ? "Type a prompt or speak into your mic..." : "Start call to converse..."}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    disabled={callState === 'disconnected'}
                    className="flex-1 bg-slate-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:border-purple-500 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={callState === 'disconnected' || !inputMessage.trim()}
                    className="glow-button px-5 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                  >
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CALL LOGS */}
        {activeTab === 'logs' && (
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Call History & Analytics</h2>
                <p className="text-xs text-slate-400">Inspect transcripts, latency waterfalls, and turn breakdowns for completed calls</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={getExportCallLogsUrl('csv')}
                  download="voxnova_call_logs.csv"
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-300 hover:text-white hover:border-purple-500/40 flex items-center gap-1.5 transition-colors"
                  title="Export call logs to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-purple-400" /> Export CSV
                </a>
                <button
                  onClick={loadData}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Logs
                </button>
              </div>
            </div>

            {callLogs.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs space-y-2">
                <History className="w-8 h-8 opacity-30 mx-auto" />
                <p>No completed call sessions logged yet.</p>
                <p className="text-[11px] text-slate-600">Start a call in the Voice Sandbox and end it to see call logs here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-3 px-4">Session ID</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">AI Outcome / Summary</th>
                      <th className="py-3 px-4">End Reason</th>
                      <th className="py-3 px-4">Turns</th>
                      <th className="py-3 px-4">Total E2E Latency</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {callLogs.map((log) => (
                      <tr 
                        key={log.id} 
                        onClick={() => setSelectedCallLog(log)}
                        className="hover:bg-slate-900/50 cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4 font-mono text-purple-400 flex items-center gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                          <span>{log.session_id.substring(0, 18)}...</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300 font-semibold">{log.duration_seconds}s</td>
                        <td className="py-3 px-4 max-w-[220px]">
                          {log.outcome ? (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30 truncate">
                                {log.outcome}
                              </span>
                            </div>
                          ) : log.summary ? (
                            <p className="truncate text-slate-400 text-[11px]">{log.summary}</p>
                          ) : (
                            <span className="text-slate-600 text-[11px] italic">Not generated</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-400 capitalize">{log.end_reason.replace('_', ' ')}</td>
                        <td className="py-3 px-4 text-slate-300 font-bold">{log.transcript?.length || 0}</td>
                        <td className="py-3 px-4 font-bold text-cyan-400">
                          {log.latency_metrics?.total_e2e_ms || 480} ms
                        </td>
                        <td className="py-3 px-4 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[11px] text-purple-400 group-hover:underline">View Details</span>
                            <button
                              onClick={(e) => handleDeleteCallLog(log.id, e)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                              title="Delete log"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
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
            <div className="border-b border-white/10 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">API Key Credentials (BYOK)</h2>
                <p className="text-xs text-slate-400">Bring Your Own Keys for Groq, OpenRouter, Deepgram, and ElevenLabs (stored privately in browser)</p>
              </div>
              {keysSaved && (
                <div className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 border border-emerald-500/30">
                  <Check className="w-3.5 h-3.5" /> Saved to Browser
                </div>
              )}
            </div>

            <form onSubmit={handleSaveKeys} className="space-y-4 text-xs">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <label className="font-bold text-purple-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Groq API Key (Ultra-fast LLM Inference)
                </label>
                <input
                  type="password"
                  placeholder="gsk_..."
                  value={apiKeys.groq}
                  onChange={(e) => setApiKeys({ ...apiKeys, groq: e.target.value })}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <label className="font-bold text-cyan-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> OpenRouter API Key (Claude / GPT-4o)
                </label>
                <input
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={apiKeys.openrouter}
                  onChange={(e) => setApiKeys({ ...apiKeys, openrouter: e.target.value })}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <label className="font-bold text-emerald-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> ElevenLabs API Key (Streaming Voice)
                </label>
                <input
                  type="password"
                  placeholder="xi-..."
                  value={apiKeys.elevenlabs}
                  onChange={(e) => setApiKeys({ ...apiKeys, elevenlabs: e.target.value })}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 space-y-2">
                <label className="font-bold text-amber-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Deepgram API Key (Streaming STT & Aura TTS)
                </label>
                <input
                  type="password"
                  placeholder="Token ..."
                  value={apiKeys.deepgram}
                  onChange={(e) => setApiKeys({ ...apiKeys, deepgram: e.target.value })}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="glow-button px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-2"
                >
                  <Check className="w-4 h-4" /> Save Credentials
                </button>
              </div>
            </form>
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

      {/* Modal for Call Log Detail Inspection */}
      {selectedCallLog && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel-glow w-full max-w-2xl p-6 rounded-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedCallLog(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <div className="p-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400">
                <History className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Call Session Details</h2>
                <p className="text-xs text-slate-400 font-mono">Session ID: {selectedCallLog.session_id}</p>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 space-y-1">
                <span className="text-[11px] text-slate-400">Duration</span>
                <p className="text-sm font-bold text-slate-100">{selectedCallLog.duration_seconds}s</p>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 space-y-1">
                <span className="text-[11px] text-slate-400">End Reason</span>
                <p className="text-sm font-bold text-slate-100 capitalize">{selectedCallLog.end_reason.replace('_', ' ')}</p>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-white/5 space-y-1">
                <span className="text-[11px] text-slate-400">Total Turns</span>
                <p className="text-sm font-bold text-purple-400">{selectedCallLog.transcript?.length || 0}</p>
              </div>
            </div>

            {/* AI Summary & Conversation Analysis Card */}
            <div className="bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-900/90 border border-purple-500/20 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      AI Conversation Summary & Insights
                      {selectedCallLog.sentiment && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          selectedCallLog.sentiment.toLowerCase() === 'positive'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : selectedCallLog.sentiment.toLowerCase() === 'negative' || selectedCallLog.sentiment.toLowerCase() === 'frustrated'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}>
                          {selectedCallLog.sentiment}
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400">Automated post-call comprehension & key takeaway extraction</p>
                  </div>
                </div>

                <button
                  onClick={() => handleSummarizeCall(selectedCallLog.id)}
                  disabled={isSummarizing}
                  className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-xs font-semibold text-purple-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  title="Generate or refresh AI summary"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSummarizing ? 'animate-spin' : ''}`} />
                  {isSummarizing ? 'Analyzing...' : selectedCallLog.summary ? 'Regenerate' : 'Generate Summary'}
                </button>
              </div>

              {selectedCallLog.summary ? (
                <div className="space-y-3.5 text-xs">
                  {/* Summary text */}
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/5 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Overview</span>
                    <p className="text-slate-200 leading-relaxed text-[12px]">{selectedCallLog.summary}</p>
                  </div>

                  {/* Discussion Points & Outcome */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Discussion Points */}
                    <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/5 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Key Discussion Points</span>
                      {selectedCallLog.discussion_points && selectedCallLog.discussion_points.length > 0 ? (
                        <ul className="space-y-1.5">
                          {selectedCallLog.discussion_points.map((pt, i) => (
                            <li key={i} className="flex items-start gap-2 text-slate-300 text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-500 italic text-[11px]">No specific points extracted</p>
                      )}
                    </div>

                    {/* Outcome */}
                    <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/5 space-y-2 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Outcome & Next Steps</span>
                        <p className="text-slate-200 mt-1 text-[11px] font-medium leading-relaxed">
                          {selectedCallLog.outcome || 'Conversation concluded normally.'}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Analysis Model</span>
                        <span className="font-mono text-slate-300">llama-3.1-8b-instant</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-400 space-y-2">
                  <p>No AI summary has been generated for this call yet.</p>
                  <button
                    onClick={() => handleSummarizeCall(selectedCallLog.id)}
                    disabled={isSummarizing}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600/30 border border-purple-500/40 text-purple-200 font-semibold hover:bg-purple-600/50 transition-all text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isSummarizing ? 'Generating AI Summary...' : 'Generate AI Summary Now'}
                  </button>
                </div>
              )}
            </div>

            {/* Latency Waterfall for this call */}
            <LatencyWaterfall metrics={selectedCallLog.latency_metrics as any} />

            {/* Turn by turn transcript */}
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Complete Turn-by-Turn Transcript
              </h3>
              <div className="bg-slate-950/70 border border-white/10 rounded-xl p-4 max-h-[300px] overflow-y-auto space-y-3 text-xs">
                {(!selectedCallLog.transcript || selectedCallLog.transcript.length === 0) ? (
                  <p className="text-slate-500 text-center py-4">No speech recorded for this session.</p>
                ) : (
                  selectedCallLog.transcript.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-3 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {item.role === 'assistant' && (
                        <div className="w-6 h-6 rounded bg-purple-600/30 text-purple-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                          AI
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] p-2.5 rounded-xl leading-relaxed ${
                          item.role === 'user'
                            ? 'bg-purple-600 text-white rounded-tr-none'
                            : 'bg-slate-900 border border-white/10 text-slate-200 rounded-tl-none'
                        }`}
                      >
                        <p>{item.text}</p>
                        {item.timestamp && (
                          <span className="text-[9px] opacity-60 block mt-1">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
