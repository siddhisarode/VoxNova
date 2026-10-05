# VoxAI — Master Documentation & Project Index

Welcome to the official technical documentation for **VoxAI**, an ultra low-latency, real-time AI voice conversation platform.

---

## 📌 Executive Summary

VoxAI enables natural, continuous, human-like voice conversations between users and custom AI voice assistants. Built with a modular pipeline separating Speech-to-Text (STT), Large Language Models (LLM), and Text-to-Speech (TTS), VoxAI guarantees response latency under **800ms** and provides instant **barge-in interruption handling**.

---

## 🗂️ Documentation Navigation

This documentation suite is organized into targeted, modular specifications:

| Document | Title | Description |
| :--- | :--- | :--- |
| [`01_SYSTEM_ARCHITECTURE.md`](file:///d:/visual%20studio/final-yr-project/vox2/docs/01_SYSTEM_ARCHITECTURE.md) | **System Architecture & Data Flow** | High-level system architecture, WebSocket protocols, state machines, and end-to-end component interaction. |
| [`02_VOICE_ENGINE_SPEC.md`](file:///d:/visual%20studio/final-yr-project/vox2/docs/02_VOICE_ENGINE_SPEC.md) | **Real-Time Voice Engine Specification** | STT audio streaming, LLM token-to-sentence segmenter, TTS chunking, and WebSocket payload schemas. |
| [`03_INTERRUPTION_AND_LATENCY.md`](file:///d:/visual%20studio/final-yr-project/vox2/docs/03_INTERRUPTION_AND_LATENCY.md) | **Barge-in Interruption & Latency Optimization** | Low-latency atomic cancellation, Client Audio Buffer flushing, Voice Activity Detection (VAD), and latency tracking metrics. |
| [`04_API_AND_DATABASE_SCHEMA.md`](file:///d:/visual%20studio/final-yr-project/vox2/docs/04_API_AND_DATABASE_SCHEMA.md) | **API & Database Specifications** | FastAPI REST routes, database tables (Assistants, Call Logs, Provider Keys), and provider factory interfaces. |
| [`05_DASHBOARD_AND_SANDBOX_SPEC.md`](file:///d:/visual%20studio/final-yr-project/vox2/docs/05_DASHBOARD_AND_SANDBOX_SPEC.md) | **Dashboard & Voice Sandbox Spec** | Next.js frontend UI, interactive call testing sandbox, real-time audio waveform visualizers, and call history analytics. |
| [`06_PHASE_WISE_ROADMAP.md`](file:///d:/visual%20studio/final-yr-project/vox2/docs/06_PHASE_WISE_ROADMAP.md) | **Phase-by-Phase Execution Plan** | Step-by-step roadmap for building, testing, verifying, and deploying VoxAI from current state to full production launch. |

---

## ⚡ Core Principles of VoxAI

1. **Natural Conversational Flow**: Full-duplex interaction loop (`LISTEN` → `UNDERSTAND` → `THINK` → `SPEAK` → `LISTEN`).
2. **Instant Interruption (Barge-in)**: When a user interrupts while the assistant is speaking, generation stops immediately, audio playback flushes, and the assistant listens.
3. **Sub-800ms Target Latency**: Token streaming, sentence-level TTS synthesis, and parallelized network I/O ensure instant voice feedback.
4. **Provider Agnostic & Resilient**: Modular factory pattern supporting Groq, OpenRouter, Deepgram, ElevenLabs, and fallback speech engines.
5. **Enterprise Platform**: Dynamic multi-assistant creation, custom system prompts, customizable voices, and granular call analytics.
