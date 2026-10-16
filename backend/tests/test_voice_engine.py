import asyncio
import unittest
from app.voice.barge_in import CancellationToken
from app.voice.sentence_streamer import SentenceStreamer
from app.voice.metrics import LatencyTracker
from app.voice.pipeline import VoicePipeline

class TestVoiceEngineComponents(unittest.IsolatedAsyncioTestCase):
    
    async def test_cancellation_token(self):
        token = CancellationToken()
        self.assertFalse(token.is_cancelled())
        
        token.cancel()
        self.assertTrue(token.is_cancelled())
        
        token.reset()
        self.assertFalse(token.is_cancelled())

    async def test_sentence_streamer_basic(self):
        streamer = SentenceStreamer()
        
        async def mock_token_stream():
            tokens = ["Hello", " world!", " How", " are", " you", " doing", " today?"]
            for t in tokens:
                yield t
                await asyncio.sleep(0.001)

        sentences = []
        async for s in streamer.extract_sentences(mock_token_stream()):
            sentences.append(s)

        self.assertEqual(len(sentences), 2)
        self.assertEqual(sentences[0], "Hello world!")
        self.assertEqual(sentences[1], "How are you doing today?")

    async def test_sentence_streamer_preserves_abbreviations_and_decimals(self):
        streamer = SentenceStreamer()

        async def mock_token_stream():
            tokens = ["Dr.", " Smith", " offers", " loans", " at", " 8.5%", " interest.", " Contact", " Mr.", " Jones."]
            for t in tokens:
                yield t
                await asyncio.sleep(0.001)

        sentences = []
        async for s in streamer.extract_sentences(mock_token_stream()):
            sentences.append(s)

        self.assertEqual(len(sentences), 2)
        self.assertIn("Dr. Smith", sentences[0])
        self.assertIn("8.5%", sentences[0])
        self.assertEqual(sentences[1], "Contact Mr. Jones.")

    async def test_sentence_streamer_cancellation(self):
        streamer = SentenceStreamer()
        token = CancellationToken()

        async def infinite_tokens():
            yield "First sentence."
            token.cancel() # Trigger cancellation mid-stream
            yield " Second sentence that should be skipped."

        sentences = []
        async for s in streamer.extract_sentences(infinite_tokens(), cancellation_token=token):
            sentences.append(s)

        self.assertEqual(len(sentences), 1)
        self.assertEqual(sentences[0], "First sentence.")

    def test_latency_tracker(self):
        tracker = LatencyTracker()
        tracker.mark_user_eos()
        tracker.mark_stt_final()
        tracker.mark_llm_first_token()
        tracker.mark_tts_first_audio()

        breakdown = tracker.get_breakdown()
        self.assertIn("stt_latency_ms", breakdown)
        self.assertIn("llm_ttft_ms", breakdown)
        self.assertIn("tts_ttfa_ms", breakdown)
        self.assertIn("total_e2e_ms", breakdown)
        self.assertGreaterEqual(breakdown["total_e2e_ms"], 0)

    async def test_voice_pipeline_turn_execution(self):
        sent_messages = []
        async def mock_send_ws(msg: dict):
            sent_messages.append(msg)

        pipeline = VoicePipeline(
            session_id="test_session_123",
            system_prompt="You are a test voice bot.",
            llm_provider_name="groq",
            tts_provider_name="fallback",
            send_ws_message=mock_send_ws
        )

        # Process user message
        await pipeline.process_user_text("Hello there")

        # Wait for turn execution to complete
        await pipeline.current_processing_task

        # Verify messages sent over mock websocket
        msg_types = [m.get("type") for m in sent_messages]
        self.assertIn("user_transcript", msg_types)
        self.assertIn("status", msg_types)
        self.assertIn("turn_completed", msg_types)

        # Verify summary
        summary = pipeline.get_call_summary(end_reason="test_completed")
        self.assertEqual(summary["session_id"], "test_session_123")
        self.assertGreaterEqual(len(summary["transcript"]), 2) # 1 user, 1 assistant

    async def test_voice_pipeline_barge_in(self):
        sent_messages = []
        async def mock_send_ws(msg: dict):
            sent_messages.append(msg)

        pipeline = VoicePipeline(
            session_id="test_barge_in_session",
            send_ws_message=mock_send_ws
        )

        await pipeline.process_user_text("Start talking")
        
        # Immediate barge-in
        pipeline.trigger_barge_in()
        self.assertFalse(pipeline.is_speaking)

        summary = pipeline.get_call_summary()
        self.assertEqual(summary["session_id"], "test_barge_in_session")

    def test_speech_normalizer_human_transform(self):
        from app.voice.speech_normalizer import normalize_speech_text
        
        sample = "For Grades 6–8, the fee is ₹72,000 per year. Office hours: 8 AM to 4 PM. Contact e.g. admission dept. Save 10%!"
        normalized = normalize_speech_text(sample)
        
        self.assertIn("6 to 8", normalized)
        self.assertIn("72,000 rupees", normalized)
        self.assertIn("8 A M to 4 P M", normalized)
        self.assertIn("for example", normalized)
        self.assertIn("10 percent", normalized)
        self.assertNotIn("₹", normalized)
        self.assertNotIn("–", normalized)

if __name__ == "__main__":
    unittest.main()
