# VoxAI — Real-Time Voice Engine Specification

This specification documents the inner workings of the **VoxAI Voice Engine**, detailing STT audio processing, LLM token streaming, sentence segmentation, TTS synthesis, and WebSocket communication payloads.

---

## 1. Core Voice Pipeline Orchestration

The `VoicePipeline` orchestrates the complete conversational loop:

$$\text{User Mic Audio} \xrightarrow{\text{STT}} \text{User Text} \xrightarrow{\text{LLM Stream}} \text{Tokens} \xrightarrow{\text{Segmenter}} \text{Sentences} \xrightarrow{\text{TTS}} \text{Audio Stream} \xrightarrow{\text{WS}} \text{Speaker}$$

### 1.1 Step-by-Step Pipeline Stages

1. **User Audio / Text Capture**:
   - Browser captures microphone input via Web Audio API / MediaRecorder or WebSpeech API.
   - Transcripts/audio frames are streamed over WebSocket to FastAPI backend.

2. **STT Processing**:
   - **Primary**: Deepgram Nova-2 websocket stream (`wss://api.deepgram.com/v1/listen`).
   - **Fallback**: Browser WebSpeech API or local fallback STT provider.

3. **LLM Response Generation**:
   - Prompt sent with system instructions and full conversation history.
   - Provider streams tokens incrementally (e.g. Groq `llama-3.3-70b-versatile` or `qwen3.8-27b`).

4. **Sentence Streamer**:
   - Buffers incoming LLM tokens into complete semantic sentences using delimiter regex (`[.!?\n]`).
   - Dispatches each completed sentence immediately to TTS without waiting for the full LLM completion.

5. **TTS Audio Synthesis**:
   - Sentences are passed to TTS provider (e.g., ElevenLabs Turbo v2.5 / Deepgram Aura).
   - TTS returns base64 encoded audio byte chunks (mp3 or pcm).
   - Audio chunks are pushed directly to client via WebSocket for immediate playback.

---

## 2. Sentence Segmentation Algorithm

To achieve sub-800ms response start latency, TTS synthesis cannot wait for full LLM response completion. The `SentenceStreamer` parses tokens as they arrive:

```python
# Delimiters trigger sentence emission
DELIMITERS = re.compile(r'(?<=[.!?\n])\s+')
```

### Flow Logic:
1. Accumulate tokens in `buffer`.
2. Split `buffer` using sentence-ending punctuation.
3. Emit completed sentences immediately to TTS worker queue.
4. Keep partial remaining sentence text in `buffer` for subsequent tokens.
5. On LLM stream end (`EOF`), flush any remaining text in `buffer`.

---

## 3. WebSocket Message Schemas

### 3.1 Client -> Server Messages

#### 1. Configuration Init / Update
```json
{
  "type": "config",
  "assistant_id": "optional-uuid",
  "system_prompt": "You are a customer support agent...",
  "llm_provider": "groq",
  "llm_model": "llama-3.3-70b-versatile",
  "tts_provider": "elevenlabs",
  "tts_voice_id": "JBFqnCBsd6RMkjVDRZzb"
}
```

#### 2. User Text Transcript
```json
{
  "type": "user_text",
  "text": "What are your interest rates for a personal loan?",
  "is_final": true
}
```

#### 3. Barge-In Interruption Event
```json
{
  "type": "barge_in",
  "timestamp": 1696500000.123
}
```

---

### 3.2 Server -> Client Messages

#### 1. System Status Update
```json
{
  "type": "status",
  "state": "thinking" // "listening" | "thinking" | "speaking" | "idle"
}
```

#### 2. Assistant Streaming Text Chunk
```json
{
  "type": "assistant_text_chunk",
  "text": "We offer personal loans starting at 8.5% interest."
}
```

#### 3. Assistant Audio Chunk
```json
{
  "type": "audio_chunk",
  "audio_b64": "//uQxAAAAAAAAAAAAAAAAAAAAAA...",
  "format": "mp3"
}
```

#### 4. Barge-In Flush Command
```json
{
  "type": "barge_in",
  "message": "Playback buffer cleared by barge-in"
}
```

#### 5. Turn Completion & Performance Metrics
```json
{
  "type": "turn_completed",
  "full_text": "We offer personal loans starting at 8.5% interest.",
  "latency_metrics": {
    "total_e2e_ms": 640.5,
    "stt_latency_ms": 120.0,
    "llm_ttft_ms": 180.2,
    "tts_first_audio_ms": 340.3
  }
}
```
