# VoxAI — Ultra Low-Latency Real-Time Voice Agent Platform (VAPI Clone)

VoxAI is a complete, real-time voice call orchestration engine and interactive dashboard built with FastAPI, Next.js 14+, Groq, OpenRouter, Deepgram, and ElevenLabs.

---

## Key Features

- **< 800ms Target Latency**: Streamed STT -> LLM Token Stream -> Sentence Segmenter -> Streamed TTS.
- **Ultra-Low-Latency Barge-In**: Immediate atomic `CancellationToken` cancels active LLM generation and flushes output audio buffers the instant client speech is detected.
- **Multi-Provider Flexibility**:
  - **LLM**: Groq (`llama-3.3-70b-versatile` / `llama-3.1-8b-instant`) for minimum TTFT & OpenRouter (`claude-3.5-sonnet`, `gpt-4o-mini`).
  - **STT**: Deepgram Nova-2 streaming + WebSpeech browser fallback.
  - **TTS**: ElevenLabs Turbo streaming + Deepgram Aura + gTTS fallback.
- **Interactive Web Call Sandbox**: Live browser testing with audio waveform visualizers, real-time streaming transcripts, and precision latency breakdown waterfall charts.
- **Assistants API & DB**: CRUD operations for Voice Assistants with SQLite/PostgreSQL persistence using SQLAlchemy 2.0 async.
- **Telephony & Function Calling**: Twilio G.711 $\mu$-law 8kHz <-> PCM 16kHz audio converter & dynamic webhook tool execution.

---

## Directory Structure

```
vox2/
├── backend/
│   ├── app/
│   │   ├── api/            # REST & WebSocket endpoints (assistants, calls, ws)
│   │   ├── core/           # Configuration & Settings
│   │   ├── db/             # Models, Database session, Schemas
│   │   ├── providers/      # STT, LLM (Groq/OpenRouter), TTS (ElevenLabs/Aura/Fallback)
│   │   ├── voice/          # Real-time Voice Pipeline, Barge-in, Sentence Streamer, Metrics
│   │   ├── tools/          # Tool Engine & Webhooks
│   │   └── main.py         # FastAPI App Entry point
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js App Router Pages & Layout
│   │   ├── components/     # AudioVisualizer, LatencyWaterfall, AssistantForm
│   │   └── lib/            # API Client & VoiceClient WebSocket manager
│   ├── package.json
│   └── next.config.ts
└── README.md
```

---

## Quick Start Guide

### 1. Backend Setup (FastAPI)

```bash
cd backend
python -m venv venv
# On Windows: venv\Scripts\activate | On Linux/macOS: source venv/bin/activate
pip install -r requirements.txt

# Start FastAPI server
python -m uvicorn app.main:app --reload --port 8000
```

FastAPI server runs at `http://localhost:8000`. API docs available at `http://localhost:8000/docs`.

### 2. Frontend Setup (Next.js Dashboard)

```bash
cd frontend
npm install
npm run dev
```

Next.js Dashboard opens at `http://localhost:3000`.

---

## Real-Time Voice Pipeline Architecture

```
User Mic Input -> STT (Deepgram/WebSpeech) -> Sentence Streamer -> LLM (Groq/OpenRouter)
                                                                       |
  Barge-In Interruption Signal <---------------------------------------+
            |
            v
  Cancel Generator & Flush Audio Queue -> TTS (ElevenLabs/Aura) -> Speaker Output
```
