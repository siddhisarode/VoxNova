'use client';
import React, { useState } from 'react';
import { Assistant, createAssistant, updateAssistant } from '../lib/api';
import { Sparkles, Save, X, Bot, Volume2, Cpu, Mic } from 'lucide-react';

interface AssistantFormProps {
  initialData?: Assistant | null;
  onSave: (assistant: Assistant) => void;
  onClose: () => void;
}

const extractCleanPurpose = (prompt?: string): string => {
  if (!prompt) return '';
  let clean = prompt.trim();
  const markers = [
    '=== AGENT PURPOSE & DOMAIN KNOWLEDGE ===',
    '5. AUDIO: NEVER output markdown formatting, bold (**), asterisks, bullet points, or emojis.',
    '5. AUDIO FORMATTING: NEVER output markdown, asterisks (**), bullet points, headers, or emojis, as they degrade voice synthesis. Spell out symbols and abbreviations in plain words.',
    '5. AUDIO FORMATTING: NEVER output markdown, bold text (**), asterisks, bullet points, or emojis.'
  ];
  for (const m of markers) {
    if (clean.includes(m)) {
      clean = clean.split(m).pop()?.trim() || '';
    }
  }
  if (clean.includes('THE AAA FORMULA') || clean.includes('You are VoxNova, a warm, energetic')) {
    return '';
  }
  return clean;
};

export const AssistantForm: React.FC<AssistantFormProps> = ({ initialData, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || 'Customer Support Assistant',
    description: initialData?.description || 'Fast, friendly conversational voice assistant',
    stt_provider: initialData?.stt_provider || 'deepgram',
    llm_provider: initialData?.llm_provider || 'groq',
    llm_model: initialData?.llm_model || 'qwen/qwen3.8-27b',
    tts_provider: initialData?.tts_provider || 'elevenlabs',
    tts_voice_id: initialData?.tts_voice_id || 'EXAVITQu4vr4xnSDxMaL',
    temperature: initialData?.temperature ?? 0.75,
    system_prompt: extractCleanPurpose(initialData?.system_prompt) || (
      'You are a helpful customer support and bookings assistant for our business. Answer inquiries politely, provide pricing and schedule details, and guide the customer with the next steps.'
    ),
    first_message: initialData?.first_message || 'Hello! Welcome to VoxNova. My name is VoxNova. To get started, who do I have the pleasure of speaking with today?',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySchoolPreset = () => {
    setFormData((prev) => ({
      ...prev,
      name: 'School Admission Counselor',
      description: 'Proactive admissions counselor for Silver Oak International School',
      temperature: 0.75,
      tts_provider: 'elevenlabs',
      tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
      first_message: 'Hello! Welcome to Silver Oak International School admissions in Pune. My name is VoxNova. I would love to help you with admissions, fees, or scheduling a campus tour. To get started, who am I speaking with today?',
      system_prompt: (
        'School Name: Silver Oak International School\n' +
        'Location: Pune, Maharashtra\n' +
        'Board: CBSE (Nursery to Grade 12)\n' +
        'Office Hours: Monday to Friday, 8 AM to 4 PM. Campus tours open weekdays.\n\n' +
        'Annual Fee Structure:\n' +
        '- Nursery to UKG: 45,000 rupees per year\n' +
        '- Grades 1 to 5: 60,000 rupees per year\n' +
        '- Grades 6 to 8: 72,000 rupees per year\n' +
        '- Grades 9 to 10: 85,000 rupees per year\n' +
        '- Grades 11 to 12: 100,000 rupees per year\n' +
        '- One-time admission fee: 5,000 rupees (installments in June and November)\n\n' +
        'Tasks:\n' +
        'Answer parents\' questions about fees, admissions, transport routes, holidays, attendance, school timings, and fee concessions. Guide them to schedule a campus tour or meeting with an admissions counselor. Actively gather parent name, child name, grade of interest, and transportation needs.'
      )
    }));
  };

  const applyHotelPreset = () => {
    setFormData((prev) => ({
      ...prev,
      name: 'Hotel Booking Assistant',
      description: 'Reservation and guest concierge for Grand Vista Residency',
      temperature: 0.75,
      tts_provider: 'elevenlabs',
      tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
      first_message: 'Hello! Welcome to Grand Vista Residency in Pune. My name is VoxNova. I would love to help you with room reservations, rates, and amenities. To get started, who do I have the pleasure of speaking with today?',
      system_prompt: (
        'Hotel Name: Grand Vista Residency\n' +
        'Location: Pune, Maharashtra\n' +
        'Hotel Type: 4-star business and family hotel\n\n' +
        'Room Rates:\n' +
        '- Standard Room: 2,500 rupees per night\n' +
        '- Deluxe Room: 3,500 rupees per night\n' +
        '- Premium Suite: 5,500 rupees per night\n' +
        '- Breakfast: 400 rupees per person, per day\n\n' +
        'Hotel Policies:\n' +
        '- Check-in: 2:00 PM; check-out: 11:00 AM\n' +
        '- Cancellation: Free up to 24 hours before check-in; later cancellations may incur a one-night charge\n' +
        '- Early check-in and late check-out are subject to availability\n' +
        '- Government-issued ID is required at check-in\n\n' +
        'Tasks:\n' +
        'Handle incoming inquiries about room availability, pricing, amenities, restaurant services, and hotel policies. Help guests make, modify, or cancel reservations by collecting their name, contact number, check-in and check-out dates, number of guests, and room preferences.'
      )
    }));
  };

  const applySupportPreset = () => {
    setFormData((prev) => ({
      ...prev,
      name: 'Customer Support Assistant',
      description: 'Helpful product support assistant',
      temperature: 0.75,
      tts_provider: 'elevenlabs',
      tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
      first_message: 'Hello! Welcome to VoxNova customer support. My name is VoxNova. To get started, who am I speaking with today?',
      system_prompt: (
        'You are a customer support specialist for our company.\n' +
        'Help customers answer questions regarding our services, subscription plans, billing, and technical guidance.\n' +
        'Always guide the customer proactively with the next steps and collect any missing contact information.'
      )
    }));
  };

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
            <p className="text-xs text-slate-400">Configure your agent purpose, model selection, temperature, and streaming voice synthesis</p>
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
                <Cpu className="w-3.5 h-3.5" /> LLM Model
              </label>
              <select
                value={formData.llm_model}
                onChange={(e) => {
                  const val = e.target.value;
                  const prov = val.startsWith('openai/') ? 'openrouter' : 'groq';
                  setFormData({ ...formData, llm_model: val, llm_provider: prov });
                }}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="qwen/qwen3.8-27b">Groq: Qwen 3.8-27B (Ultra-fast — Recommended)</option>
                <option value="openai/gpt-oss-20b">Groq: GPT-OSS 20B</option>
                <option value="openai/gpt-4o-mini">OpenRouter: GPT-4o-mini</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1.5">
                <Volume2 className="w-3.5 h-3.5" /> TTS Voice Model
              </label>
              <select
                value={formData.tts_voice_id}
                onChange={(e) => {
                  const voice = e.target.value;
                  const isAura = voice.startsWith('aura-');
                  setFormData({
                    ...formData,
                    tts_voice_id: voice,
                    tts_provider: isAura ? 'aura' : 'elevenlabs'
                  });
                }}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <optgroup label="ElevenLabs Turbo (Studio Human Realism - Recommended)">
                  <option value="EXAVITQu4vr4xnSDxMaL">Sarah (Warm, Conversational Female — Recommended)</option>
                  <option value="JBFqnCBsd6RMkjVDRZzb">George (Warm, Professional Male)</option>
                  <option value="cgSgspJ2msm6clMCkdW9">Jessica (Natural & Engaging Female)</option>
                  <option value="nPczCjzI2devNBz1zQrb">Brian (Deep, Natural Male)</option>
                  <option value="iP95p4xoKVk53GoZ742B">Chris (Casual & Friendly Male)</option>
                </optgroup>
                <optgroup label="Deepgram Aura (Ultra-Fast Synthesis)">
                  <option value="aura-asteria-en">Asteria (Warm Female)</option>
                  <option value="aura-luna-en">Luna (Approachable Female)</option>
                  <option value="aura-orion-en">Orion (Relaxed Male)</option>
                  <option value="aura-helios-en">Helios (Warm & Expressive Male)</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* VAPI-LIKE TEMPERATURE SLIDER FOR HUMAN REALISM */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Human Realism & Conversational Temperature
              </label>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                formData.temperature < 0.4
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : formData.temperature <= 0.8
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              }`}>
                {formData.temperature.toFixed(2)} — {
                  formData.temperature < 0.4 ? 'Strict / Scripted' :
                  formData.temperature <= 0.8 ? 'Natural Conversational (Recommended)' :
                  'Highly Dynamic / Spontaneous'
                }
              </span>
            </div>

            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={formData.temperature}
              onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
              className="w-full accent-amber-400 cursor-pointer h-2 bg-slate-900 rounded-lg"
            />
            
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.1 (Factual & Rigid)</span>
              <span className="text-emerald-400 font-bold">0.70 - 0.75 (Human Sweet Spot)</span>
              <span>1.0 (Creative)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <label className="block text-xs font-semibold text-slate-200">
                  Assistant Purpose & Domain Knowledge
                </label>
                <p className="text-[11px] text-slate-400">
                  Write what your agent does, its knowledge base, pricing, and rules. Human conversational tone, proactive questions (AAA formula), and speech formatting are pre-built and managed automatically under the hood.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={applyHotelPreset}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-400/10 px-2 py-1 rounded-lg border border-cyan-400/20 transition-all hover:bg-cyan-400/20"
                >
                  <Sparkles className="w-3 h-3" /> Hotel Preset
                </button>
                <button
                  type="button"
                  onClick={applySchoolPreset}
                  className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-400/10 px-2 py-1 rounded-lg border border-amber-400/20 transition-all hover:bg-amber-400/20"
                >
                  <Sparkles className="w-3 h-3" /> School Preset
                </button>
                <button
                  type="button"
                  onClick={applySupportPreset}
                  className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 bg-purple-400/10 px-2 py-1 rounded-lg border border-purple-400/20 transition-all hover:bg-purple-400/20"
                >
                  <Sparkles className="w-3 h-3" /> Support Preset
                </button>
              </div>
            </div>
            <textarea
              rows={6}
              required
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              placeholder="Describe what your assistant does, its knowledge base, pricing, FAQs, and what details it should ask the caller for..."
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
