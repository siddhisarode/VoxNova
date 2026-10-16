import unittest
import httpx
from app.main import app
from app.db.database import init_db

class TestVoxAIPublicAPIs(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        await init_db()
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_health_check(self):
        resp = await self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "healthy")

    async def test_assistants_crud(self):
        # 1. Create Assistant
        payload = {
            "name": "Test Loan Advisor",
            "description": "Evaluates personal loan options",
            "stt_provider": "deepgram",
            "llm_provider": "groq",
            "llm_model": "llama-3.1-8b-instant",
            "tts_provider": "elevenlabs",
            "tts_voice_id": "JBFqnCBsd6RMkjVDRZzb",
            "system_prompt": "You are a friendly bank loan assistant.",
            "first_message": "Hello, how can I help you with a loan today?"
        }
        res = await self.client.post("/api/assistants", json=payload)
        self.assertEqual(res.status_code, 201)
        created = res.json()
        assistant_id = created["id"]
        self.assertEqual(created["name"], "Test Loan Advisor")

        # 2. Get Assistant
        res = await self.client.get(f"/api/assistants/{assistant_id}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["id"], assistant_id)

        # 3. List Assistants
        res = await self.client.get("/api/assistants")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)
        self.assertTrue(any(a["id"] == assistant_id for a in res.json()))

        # 4. Update Assistant
        update_payload = {"name": "Updated Loan Advisor"}
        res = await self.client.patch(f"/api/assistants/{assistant_id}", json=update_payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["name"], "Updated Loan Advisor")

        # 5. Delete Assistant
        res = await self.client.delete(f"/api/assistants/{assistant_id}")
        self.assertEqual(res.status_code, 204)

        # Verify 404
        res = await self.client.get(f"/api/assistants/{assistant_id}")
        self.assertEqual(res.status_code, 404)

    async def test_calls_logging_crud(self):
        session_id = "test_call_session_456"

        # 1. Create Call Log
        call_payload = {
            "session_id": session_id,
            "status": "ended",
            "duration_seconds": 18.5,
            "end_reason": "user_hangup",
            "transcript": [
                {"role": "assistant", "text": "Hello!"},
                {"role": "user", "text": "What are your loan rates?"},
                {"role": "assistant", "text": "Our rates start at 8.5%."}
            ],
            "latency_metrics": {
                "stt_latency_ms": 115.0,
                "llm_ttft_ms": 190.0,
                "tts_ttfa_ms": 210.0,
                "total_e2e_ms": 515.0
            },
            "cost_usd": 0.002
        }
        res = await self.client.post("/api/calls", json=call_payload)
        self.assertEqual(res.status_code, 201)
        created = res.json()
        call_id = created["id"]
        self.assertEqual(created["session_id"], session_id)

        # 2. Get Call Log by session_id / id
        res = await self.client.get(f"/api/calls/{session_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["duration_seconds"], 18.5)
        self.assertEqual(len(data["transcript"]), 3)

        # 3. List Call Logs
        res = await self.client.get("/api/calls")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(any(c["session_id"] == session_id for c in res.json()))

        # 3b. Export Call Logs (JSON and CSV)
        res_json = await self.client.get("/api/calls/export?format=json")
        self.assertEqual(res_json.status_code, 200)
        self.assertIsInstance(res_json.json(), list)

        res_csv = await self.client.get("/api/calls/export?format=csv")
        self.assertEqual(res_csv.status_code, 200)
        self.assertIn("text/csv", res_csv.headers.get("content-type", ""))
        self.assertIn("Session ID", res_csv.text)

        # 4. Delete Call Log
        res = await self.client.delete(f"/api/calls/{call_id}")
        self.assertEqual(res.status_code, 204)

        # Verify 404
        res = await self.client.get(f"/api/calls/{call_id}")
        self.assertEqual(res.status_code, 404)

if __name__ == "__main__":
    unittest.main()
