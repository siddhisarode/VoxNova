import re
import logging
from typing import AsyncGenerator, Optional
from app.voice.barge_in import CancellationToken

logger = logging.getLogger("voxai.voice.sentence_streamer")

class SentenceStreamer:
    """
    Buffers streaming LLM tokens into sentence chunks.
    Delimiters: '.', '!', '?', ';', '\n', or token threshold.
    Sends complete sentences to TTS engine to optimize voice naturalness & speed.
    """
    def __init__(self, min_length: int = 15):
        self.min_length = min_length
        self.delimiters_pattern = re.compile(r'([.!?;\n])')

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

            # Split on punctuation delimiters
            parts = self.delimiters_pattern.split(buffer)
            
            # If we have delimiters
            if len(parts) > 1:
                # Reconstruct completed sentences
                # parts looks like: ["Hello world", ".", " How are you", "?", " I am fine"]
                completed_parts = []
                for i in range(0, len(parts) - 1, 2):
                    sentence = parts[i] + parts[i+1]
                    completed_parts.append(sentence)
                
                # Update buffer with remaining tail
                buffer = parts[-1]

                for sentence in completed_parts:
                    clean_stmt = sentence.strip()
                    if clean_stmt:
                        yield clean_stmt

        # Yield any remaining text in buffer at end of stream
        if buffer and buffer.strip():
            if not cancellation_token or not cancellation_token.is_cancelled():
                yield buffer.strip()
