import unittest
from app.voice.call_summary import generate_call_summary

class TestCallSummary(unittest.IsolatedAsyncioTestCase):
    async def test_empty_transcript_summary(self):
        summary = await generate_call_summary([])
        self.assertIn("no speech recorded", summary["summary"].lower())
        self.assertEqual(summary["discussion_points"], [])
        self.assertEqual(summary["sentiment"], "neutral")

    async def test_fallback_summary(self):
        mock_transcript = [
            {"role": "assistant", "text": "Hello, thank you for calling VoxNova."},
            {"role": "user", "text": "I would like to inquire about loan interest rates."}
        ]
        # Pass empty api_key to test fallback heuristic generator
        summary = await generate_call_summary(mock_transcript, api_key="")
        self.assertIn("Voice call session containing", summary["summary"])
        self.assertTrue(len(summary["discussion_points"]) > 0)
        self.assertIn("inquire about loan interest rates", summary["discussion_points"][0])
        self.assertEqual(summary["sentiment"], "neutral")

    async def test_live_groq_summary_if_key_available(self):
        mock_transcript = [
            {"role": "assistant", "text": "Hello, how can I help you today?"},
            {"role": "user", "text": "I want to schedule a product demo for next Tuesday at 3 PM."},
            {"role": "assistant", "text": "I have reserved Tuesday at 3 PM for your product demo."}
        ]
        summary = await generate_call_summary(mock_transcript)
        self.assertIsInstance(summary["summary"], str)
        self.assertTrue(len(summary["summary"]) > 0)
        self.assertIsInstance(summary["discussion_points"], list)
        self.assertIn(summary["sentiment"], ["positive", "neutral", "inquisitive", "frustrated"])

if __name__ == '__main__':
    unittest.main()
