import time
from typing import Dict, Any, Optional

class LatencyTracker:
    """
    Measures precision real-time latency breakdown across pipeline stages:
    - user_eos_time: User stopped speaking timestamp (EOS)
    - stt_final_time: STT completed transcript timestamp
    - llm_first_token_time: LLM emitted first token (TTFT)
    - tts_first_audio_time: TTS produced first audio byte (TTFA)
    """
    def __init__(self):
        self.reset()

    def reset(self):
        self.user_eos_time: Optional[float] = None
        self.stt_final_time: Optional[float] = None
        self.llm_first_token_time: Optional[float] = None
        self.tts_first_audio_time: Optional[float] = None

    def mark_user_eos(self):
        self.user_eos_time = time.perf_counter()

    def mark_stt_final(self):
        self.stt_final_time = time.perf_counter()

    def mark_llm_first_token(self):
        if self.llm_first_token_time is None:
            self.llm_first_token_time = time.perf_counter()

    def mark_tts_first_audio(self):
        if self.tts_first_audio_time is None:
            self.tts_first_audio_time = time.perf_counter()

    def get_breakdown(self) -> Dict[str, Any]:
        eos = self.user_eos_time or time.perf_counter()
        
        stt_latency_ms = ((self.stt_final_time - eos) * 1000) if self.stt_final_time else 0.0
        llm_ttft_ms = ((self.llm_first_token_time - (self.stt_final_time or eos)) * 1000) if self.llm_first_token_time else 0.0
        tts_ttfa_ms = ((self.tts_first_audio_time - (self.llm_first_token_time or eos)) * 1000) if self.tts_first_audio_time else 0.0
        total_e2e_ms = ((self.tts_first_audio_time - eos) * 1000) if self.tts_first_audio_time else 0.0

        return {
            "stt_latency_ms": round(max(0, stt_latency_ms), 1),
            "llm_ttft_ms": round(max(0, llm_ttft_ms), 1),
            "tts_ttfa_ms": round(max(0, tts_ttfa_ms), 1),
            "total_e2e_ms": round(max(0, total_e2e_ms), 1)
        }
