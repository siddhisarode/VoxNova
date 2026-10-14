import { Assistant } from './api';

export type CallState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'speaking';

export interface LatencyBreakdown {
  total_e2e_ms: number;
  stt_latency_ms?: number;
  llm_ttft_ms?: number;
  tts_ttfa_ms?: number;
  [key: string]: number | undefined;
}

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface VoiceClientOptions {
  assistant: Assistant;
  onStateChange?: (state: CallState) => void;
  onTranscript?: (turn: TranscriptTurn) => void;
  onLatencyUpdate?: (metrics: LatencyBreakdown) => void;
  onError?: (error: string) => void;
}

interface QueuedAudio {
  url: string;
}

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

function getWebSocketUrl(sessionId: string): string {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
  let wsBase = apiBase;
  if (wsBase.startsWith('https://')) {
    wsBase = 'wss://' + wsBase.slice(8);
  } else if (wsBase.startsWith('http://')) {
    wsBase = 'ws://' + wsBase.slice(7);
  } else if (!wsBase.startsWith('ws://') && !wsBase.startsWith('wss://')) {
    wsBase = 'ws://' + wsBase;
  }
  return `${wsBase}/ws/call/${encodeURIComponent(sessionId)}`;
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(len);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class VoiceClient {
  private options: VoiceClientOptions;
  private ws: WebSocket | null = null;
  private state: CallState = 'disconnected';
  private sessionId: string | null = null;
  private isDisconnected = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  // Audio queue and playback state
  private audioQueue: QueuedAudio[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private isPlayingAudio = false;

  constructor(options: VoiceClientOptions) {
    this.options = options;
  }

  public connect(): void {
    if (this.ws || this.state === 'connecting' || this.state === 'connected') {
      return;
    }

    if (typeof window === 'undefined') {
      this.options.onError?.('VoiceClient can only be connected in browser environments');
      return;
    }

    this.isDisconnected = false;
    this.sessionId = generateSessionId();
    const wsUrl = getWebSocketUrl(this.sessionId);

    this.setState('connecting');

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err: any) {
      this.isDisconnected = true;
      this.setState('disconnected');
      this.options.onError?.(`Failed to open voice WebSocket: ${err.message || String(err)}`);
      return;
    }

    this.ws.onopen = () => {
      if (this.isDisconnected) return;
      this.setState('connected');

      // Periodic ping heartbeat to prevent gateway timeouts
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.sendMessage({ type: 'ping' });
        }
      }, 25000);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (this.isDisconnected) return;
      this.handleServerMessage(event.data);
    };

    this.ws.onerror = () => {
      if (this.isDisconnected) return;
      this.options.onError?.('Voice WebSocket connection encountered an error');
    };

    this.ws.onclose = () => {
      if (this.isDisconnected) return;
      this.disconnect();
    };
  }

  public disconnect(): void {
    if (this.isDisconnected) {
      return;
    }
    this.isDisconnected = true;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    this.stopAndClearAudio();

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.setState('disconnected');
  }

  public triggerBargeIn(): void {
    if (this.isDisconnected) return;
    this.stopAndClearAudio();
    this.setState('listening');
    this.sendMessage({ type: 'barge_in' });
  }

  public sendUserText(text: string): void {
    if (this.isDisconnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onError?.('Cannot send message: call is not connected');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    // Locally interrupt any active assistant speech before submitting new user text
    this.stopAndClearAudio();
    this.setState('thinking');

    this.sendMessage({
      type: 'user_text',
      text: trimmed,
    });
  }

  private sendMessage(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err: any) {
        this.options.onError?.(`Failed to send WebSocket payload: ${err.message || String(err)}`);
      }
    }
  }

  private setState(nextState: CallState): void {
    if (this.isDisconnected && nextState !== 'disconnected') {
      return;
    }
    if (this.state !== nextState) {
      this.state = nextState;
      this.options.onStateChange?.(nextState);
    }
  }

  private handleServerMessage(rawData: any): void {
    let msg: any;
    try {
      msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    } catch {
      // Ignore unparseable frames
      return;
    }

    if (!msg || typeof msg !== 'object') {
      return;
    }

    switch (msg.type) {
      case 'connection_established':
        // Initialize pipeline with assistant configuration
        this.sendMessage({
          type: 'config',
          system_prompt: this.options.assistant.system_prompt,
          llm_provider: this.options.assistant.llm_provider,
          llm_model: this.options.assistant.llm_model,
          tts_provider: this.options.assistant.tts_provider,
          tts_voice_id: this.options.assistant.tts_voice_id,
        });
        this.setState('listening');
        break;

      case 'config_updated':
        if (this.state === 'connected') {
          this.setState('listening');
        }
        break;

      case 'pong':
        // Heartbeat acknowledged
        break;

      case 'status':
        if (msg.state === 'thinking' || msg.state === 'listening') {
          // Do not overwrite speaking state if audio is actively playing
          if (!this.isPlayingAudio) {
            this.setState(msg.state);
          }
        }
        break;

      case 'user_transcript':
        if (msg.text && typeof msg.text === 'string') {
          this.options.onTranscript?.({
            role: 'user',
            text: msg.text,
          });
        }
        break;

      case 'assistant_text_chunk':
        // Emit sentence-by-sentence text chunks as they stream from the LLM/SentenceStreamer
        if (msg.text && typeof msg.text === 'string') {
          this.options.onTranscript?.({
            role: 'assistant',
            text: msg.text.trim(),
          });
        }
        break;

      case 'audio_chunk':
        if (msg.audio_b64 && typeof msg.audio_b64 === 'string') {
          this.handleAudioChunk(msg.audio_b64);
        }
        break;

      case 'barge_in':
        this.stopAndClearAudio();
        this.setState('listening');
        break;

      case 'turn_completed':
        // Update latency metrics without re-emitting transcript text (prevents duplicate assistant text)
        if (msg.latency_metrics && typeof msg.latency_metrics === 'object') {
          this.options.onLatencyUpdate?.(msg.latency_metrics as LatencyBreakdown);
        }
        break;

      case 'error':
        this.options.onError?.(msg.message || 'Voice pipeline reported an error');
        break;

      default:
        // Ignore unhandled message types
        break;
    }
  }

  private handleAudioChunk(b64Audio: string): void {
    if (this.isDisconnected) return;

    try {
      const bytes = base64ToUint8Array(b64Audio);
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      this.audioQueue.push({ url });

      if (!this.isPlayingAudio) {
        this.playNextAudio();
      }
    } catch (err: any) {
      this.options.onError?.(`Failed to decode audio chunk: ${err.message || String(err)}`);
    }
  }

  private playNextAudio(): void {
    if (this.isDisconnected) {
      this.stopAndClearAudio();
      return;
    }

    if (this.audioQueue.length === 0) {
      this.isPlayingAudio = false;
      this.currentAudio = null;
      if (this.state === 'speaking') {
        this.setState('listening');
      }
      return;
    }

    const item = this.audioQueue.shift();
    if (!item) return;

    this.isPlayingAudio = true;
    this.setState('speaking');

    if (typeof Audio === 'undefined') {
      URL.revokeObjectURL(item.url);
      this.isPlayingAudio = false;
      this.options.onError?.('HTML5 Audio is not supported in this browser');
      return;
    }

    const audio = new Audio(item.url);
    this.currentAudio = audio;

    const cleanup = () => {
      URL.revokeObjectURL(item.url);
      if (this.currentAudio === audio) {
        this.currentAudio = null;
      }
    };

    audio.onended = () => {
      cleanup();
      if (!this.isDisconnected) {
        this.playNextAudio();
      }
    };

    audio.onerror = () => {
      cleanup();
      if (!this.isDisconnected) {
        this.options.onError?.('Audio chunk playback failed');
        this.playNextAudio();
      }
    };

    audio.play().catch((err: any) => {
      cleanup();
      if (!this.isDisconnected) {
        this.options.onError?.(`Audio playback error: ${err.message || String(err)}`);
        this.playNextAudio();
      }
    });
  }

  private stopAndClearAudio(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
      } catch {
        // Ignore pause/reset errors
      }
      this.currentAudio = null;
    }
    this.clearAudioQueue();
    this.isPlayingAudio = false;
  }

  private clearAudioQueue(): void {
    for (const item of this.audioQueue) {
      try {
        URL.revokeObjectURL(item.url);
      } catch {
        // Ignore revoke errors
      }
    }
    this.audioQueue = [];
  }
}
