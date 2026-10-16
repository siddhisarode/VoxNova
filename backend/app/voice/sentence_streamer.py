import re
import logging
from typing import AsyncGenerator, Optional
from app.voice.barge_in import CancellationToken

logger = logging.getLogger("voxai.voice.sentence_streamer")

# Common abbreviations that should not trigger sentence boundaries
ABBREVIATIONS = {
    "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.",
    "e.g.", "i.e.", "vs.", "etc.", "st.", "inc.", "corp.", "co."
}

class SentenceStreamer:
    """
    Buffers streaming LLM tokens into natural, clean sentence chunks for TTS.
    - Emits immediately on sentence delimiters ('.', '!', '?', ';', newline).
    - Preserves abbreviations (Dr., e.g., Mr.) and decimal numbers (8.5%).
    - Enforces a length threshold to prevent trailing buffer delay.
    - Yields clean sentences with minimal latency.
    """
    def __init__(self, min_char_length: int = 12, max_words_threshold: int = 25):
        self.min_char_length = min_char_length
        self.max_words_threshold = max_words_threshold
        # Punctuation delimiter regex matching sentence boundaries followed by space or end
        self.delimiters_pattern = re.compile(r'([.!?;\n]+(?:\s+|$))')

    def _is_abbreviation_or_number(self, text_before_punct: str, punct: str) -> bool:
        """Check if the matched punctuation belongs to an abbreviation or numeric decimal."""
        combined = (text_before_punct + punct).strip().lower()
        last_word = combined.split()[-1] if combined.split() else ""
        if last_word in ABBREVIATIONS:
            return True
        # Check if it's a number like 3.14 or $19.99
        if re.search(r'\d+\.\d*$', text_before_punct):
            return True
        return False

    async def extract_sentences(
        self,
        token_stream: AsyncGenerator[str, None],
        cancellation_token: Optional[CancellationToken] = None
    ) -> AsyncGenerator[str, None]:
        buffer = ""

        async for token in token_stream:
            if cancellation_token and cancellation_token.is_cancelled():
                logger.info("SentenceStreamer aborted by cancellation token.")
                break

            buffer += token

            # Check if buffer has delimiters
            matches = list(self.delimiters_pattern.finditer(buffer))
            if matches:
                # Find the first valid boundary that is NOT an abbreviation
                split_idx = -1
                for match in matches:
                    text_before = buffer[:match.start()]
                    punct = match.group(0)
                    if not self._is_abbreviation_or_number(text_before, punct):
                        split_idx = match.end()
                        break

                if split_idx != -1:
                    candidate = buffer[:split_idx].strip()
                    if len(candidate) >= self.min_char_length:
                        buffer = buffer[split_idx:]
                        yield candidate

            # Fallback: if buffer gets too long without punctuation (run-on sentence), split on comma or word boundary
            word_count = len(buffer.split())
            if word_count >= self.max_words_threshold:
                comma_idx = buffer.rfind(",")
                if comma_idx > 20:
                    sentence = buffer[:comma_idx + 1].strip()
                    buffer = buffer[comma_idx + 1:]
                    if sentence:
                        yield sentence

        # Yield any remaining text in buffer at end of stream
        if buffer and buffer.strip():
            if not cancellation_token or not cancellation_token.is_cancelled():
                yield buffer.strip()

