# VoxAI — Dashboard & Voice Call Sandbox Specification

This document details the frontend design system, Next.js components, real-time Web Audio API integrations, latency visualizers, and interactive sandbox features for **VoxAI**.

---

## 1. Dashboard Architecture Overview

Built with Next.js (App Router), Tailwind CSS, Lucide icons, and Web Audio API, the VoxAI Dashboard provides an intuitive control panel and call simulator.

```text
frontend/src/
├── app/
│   ├── globals.css         # Dark theme design system & animations
│   ├── layout.tsx          # Master dashboard sidebar & navigation
│   ├── page.tsx            # Main multi-tab dashboard layout
├── components/
│   ├── AssistantForm.tsx   # Assistant creation & editing modal/form
│   ├── AudioVisualizer.tsx # Canvas-based dynamic audio waveform visualizer
│   ├── LatencyWaterfall.tsx# Microsecond latency breakdown chart
│   ├── TranscriptView.tsx  # Dynamic real-time transcript viewer
│   ├── CallHistory.tsx     # Historical calls table & details modal
├── lib/
│   ├── api.ts              # REST API Client (Assistants, Calls)
│   ├── voice-client.ts     # WebSocket connection manager & Audio player
```

---

## 2. Voice Call Sandbox Component

The **Voice Call Sandbox** is the core interactive testing arena where users converse with AI assistants in real time.

```text
+-----------------------------------------------------------------------+
|  [ Assistant Selector ]  Bank Loan Assistant  (Active: Groq / 11Labs) |
+-----------------------------------------------------------------------+
|                                                                       |
|                     [ CALL STATUS: SPEAKING ]                         |
|                                                                       |
|              ~~~~~ LIVE AUDIO WAVEFORM VISUALIZER ~~~~~               |
|                                                                       |
|   [ START CALL ]  |  [ INTERRUPT / BARGE-IN ]  |  [ END CALL ]       |
|                                                                       |
+-----------------------------------------------------------------------+
| Real-time Transcript:                                                 |
| YOU: What personal loans do you offer?                                |
| AI : We offer three personal loan options starting at 8.5% interest...|
+-----------------------------------------------------------------------+
| Response Latency Breakdown:                                           |
| STT: 120ms | LLM TTFT: 180ms | TTS First Byte: 320ms | Total: 620ms  |
+-----------------------------------------------------------------------+
```

### Key Sandbox Capabilities:
1. **One-Click Call Control**: Seamless connection state transition (`Idle` → `Connecting` → `Active`).
2. **Microphone Capture**: Automatic audio gain node creation & Web Audio API analyzer binding.
3. **Live Waveform Rendering**: Visual indicator displaying distinct animations during user speech vs assistant speech.
4. **Instant Barge-In Button & Speech Detection**: Click or speak to halt current AI playback.
5. **Real-time Waterfall Latency Breakdown**: Visual breakdown chart highlighting response delay components for every turn.

---

## 3. Real-Time Audio Visualizer Specification

The `AudioVisualizer` component utilizes HTML5 `Canvas` and `AudioContext` `AnalyserNode`:
- Frequency bin count: 64 or 128 bins.
- Renders smooth sine waveform or dynamic bar visualizer.
- Color shifts based on call state:
  - **Cyan/Indigo pulse**: User is speaking.
  - **Emerald/Green wave**: Assistant is speaking.
  - **Amber pulse**: LLM is thinking.
  - **Subtle slate wave**: Idle/Listening.

---

## 4. Latency Waterfall Chart Specification

The `LatencyWaterfall` component renders a micro-waterfall bar chart breaking down turn timings:

```text
STT Final     [==== 120ms ====]
LLM TTFT                     [====== 180ms ======]
TTS Audio                                        [======== 320ms ========]
Total E2E     [======================= 620ms ===========================]
```

- Highlights performance bottlenecks in red if total latency exceeds 800ms.
- Displays millisecond metrics for continuous optimization.
