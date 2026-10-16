import json
import logging
import httpx
from typing import Dict, Any, List, Optional
from app.core.config import settings

logger = logging.getLogger("voxai.voice.call_summary")

SUMMARY_SYSTEM_PROMPT = """You are an expert conversation analyst for VoxNova voice AI assistants.
Analyze the following voice call transcript between a User and an AI Assistant.
Extract key insights and return ONLY a valid JSON object matching the following structure without any markdown formatting or extra text:

{
  "summary": "Concise 2-3 sentence overview of the conversation and caller intent.",
  "discussion_points": [
    "Key discussion point 1",
    "Key discussion point 2"
  ],
  "outcome": "Clear summary of the final outcome, resolution, or next steps agreed upon.",
  "sentiment": "positive" // one of: "positive", "neutral", "inquisitive", "frustrated"
}
"""

async def generate_call_summary(
    transcript: List[Dict[str, Any]], 
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generates an AI summary, main discussion points, outcome, and sentiment
    for a completed voice conversation transcript.
    """
    if not transcript or len(transcript) == 0:
        return {
            "summary": "Call session connected with no speech recorded.",
            "discussion_points": [],
            "outcome": "Call disconnected before conversation started.",
            "sentiment": "neutral"
        }

    # Format transcript into clean dialogue
    dialogue_lines = []
    for turn in transcript:
        role = turn.get("role", "speaker").capitalize()
        text = turn.get("text", "").strip()
        if text:
            dialogue_lines.append(f"{role}: {text}")

    if not dialogue_lines:
        return {
            "summary": "Call session ended without recorded speech.",
            "discussion_points": [],
            "outcome": "No conversation occurred.",
            "sentiment": "neutral"
        }

    conversation_text = "\n".join(dialogue_lines)
    groq_key = api_key if api_key is not None else settings.GROQ_API_KEY

    # If Groq API key is available, use ultra-fast inference (<350ms)
    if groq_key:
        candidate_models = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }

        for model in candidate_models:
            try:
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                        {"role": "user", "content": f"Transcript:\n{conversation_text}"}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 350
                }

                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code == 200:
                        data = response.json()
                        content = data["choices"][0]["message"]["content"].strip()
                        if content.startswith("```json"):
                            content = content[7:]
                        elif content.startswith("```"):
                            content = content[3:]
                        if content.endswith("```"):
                            content = content[:-3]
                        parsed = json.loads(content.strip())
                        logger.info(f"AI call summary generated successfully via Groq ({model}).")
                        return {
                            "summary": parsed.get("summary", ""),
                            "discussion_points": parsed.get("discussion_points", []),
                            "outcome": parsed.get("outcome", ""),
                            "sentiment": str(parsed.get("sentiment", "neutral")).lower()
                        }
                    else:
                        logger.warning(f"Groq summary extraction with model {model} returned HTTP {response.status_code}")
            except Exception as e:
                logger.error(f"Error calling Groq ({model}) for call summary: {e}")

    # Fallback heuristic summary generator
    user_turns = [t.get("text", "") for t in transcript if t.get("role") == "user" and t.get("text")]
    points = [u[:80] + ("..." if len(u) > 80 else "") for u in user_turns[:3]]

    return {
        "summary": f"Voice call session containing {len(transcript)} dialogue turns between the caller and the voice assistant.",
        "discussion_points": points if points else ["General enquiry"],
        "outcome": "Conversation completed and saved to call records.",
        "sentiment": "neutral"
    }
