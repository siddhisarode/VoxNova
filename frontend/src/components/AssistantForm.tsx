'use client';
import React, { useState } from 'react';
import { Assistant, createAssistant, updateAssistant } from '../lib/api';
import { Sparkles, Save, X, Bot, Volume2, Cpu, Mic } from 'lucide-react';

interface AssistantFormProps {
  initialData?: Assistant | null;
  onSave: (assistant: Assistant) => void;
  onClose: () => void;
}

export const AssistantForm: React.FC<AssistantFormProps> = ({ initialData, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || 'Customer Support Assistant',
    description: initialData?.description || 'Fast, friendly voice assistant powered by Groq',
    stt_provider: initialData?.stt_provider || 'deepgram',
    llm_provider: initialData?.llm_provider || 'groq',
    llm_model: initialData?.llm_model || 'llama-3.1-8b-instant',
    tts_provider: initialData?.tts_provider || 'elevenlabs',
    tts_voice_id: initialData?.tts_voice_id || 'JBFqnCBsd6RMkjVDRZzb',
    system_prompt: initialData?.system_prompt || 'You are VoxAI, a helpful real-time voice assistant. Keep your responses concise, direct, and conversational.',
    first_message: initialData?.first_message || 'Hello! Welcome to VoxAI. How can I assist you today?',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let saved: Assistant;
      if (initialData?.id) {
        saved = await updateAssistant(initialData.id, formData);
      } else {
        saved = await createAssistant(formData);
      }
      onSave(saved);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save assistant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel-glow w-full max-w-2xl p-6 rounded-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="p-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">
              {initialData ? 'Edit Voice Assistant' : 'Create New Voice Assistant'}
            </h2>
            <p className="text-xs text-slate-400">Configure real-time voice models, prompts, and streaming voice synthesis</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Assistant Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Model & Providers */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-950/50 rounded-xl border border-white/5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 mb-1.5">
                <Mic className="w-3.5 h-3.5" /> STT Engine
              </label>
              <select
                value={formData.stt_provider}
                onChange={(e) => setFormData({ ...formData, stt_provider: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="deepgram">Deepgram Nova-2</option>
                <option value="fallback">Browser WebSpeech</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-purple-400 mb-1.5">
                <Cpu className="w-3.5 h-3.5" /> LLM Provider
              </label>
              <select
                value={formData.llm_provider}
                onChange={(e) => {
                  const prov = e.target.value;
                  const defaultModel = prov === 'groq' ? 'llama-3.1-8b-instant' : 'openai/gpt-4o-mini';
                  setFormData({ ...formData, llm_provider: prov, llm_model: defaultModel });
                }}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="groq">Groq (Fastest TTFT)</option>
                <option value="openrouter">OpenRouter (Multi-model)</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1.5">
                <Volume2 className="w-3.5 h-3.5" /> TTS Voice
              </label>
              <select
                value={formData.tts_provider}
                onChange={(e) => setFormData({ ...formData, tts_provider: e.target.value })}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="elevenlabs">ElevenLabs Turbo</option>
                <option value="aura">Deepgram Aura</option>
                <option value="fallback">gTTS / Browser Synth</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">System Prompt</label>
            <textarea
              rows={4}
              required
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              className="w-full bg-slate-900/80 border border-white/10 rounded-lg p-3 text-xs text-slate-100 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">First Greeting Message</label>
            <input
              type="text"
              value={formData.first_message}
              onChange={(e) => setFormData({ ...formData, first_message: e.target.value })}
              className="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="glow-button px-5 py-2 rounded-lg text-xs font-semibold text-white flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Save Assistant'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
