import logging
import httpx
from typing import Dict, Any, List, Optional

logger = logging.getLogger("voxai.tools.engine")

class ToolEngine:
    """
    Executes function calling & webhooks triggered by the LLM mid-conversation.
    Supports: custom HTTP webhooks, end-call signals, and call transfer.
    """
    @staticmethod
    async def execute_tool(tool_name: str, args: Dict[str, Any], webhook_url: Optional[str] = None) -> Dict[str, Any]:
        logger.info(f"Executing tool '{tool_name}' with args: {args}")

        if tool_name == "end_call":
            return {"status": "success", "action": "end_call", "message": "Call ended by assistant"}
        
        elif tool_name == "transfer_call":
            target_number = args.get("phone_number", "")
            return {"status": "success", "action": "transfer", "target": target_number}

        elif webhook_url:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(webhook_url, json={"tool": tool_name, "args": args})
                    if resp.status_code == 200:
                        return resp.json()
                    return {"status": "error", "code": resp.status_code, "text": resp.text}
            except Exception as e:
                logger.error(f"Webhook tool error: {e}")
                return {"status": "error", "message": str(e)}

        return {"status": "success", "result": f"Executed {tool_name} successfully"}
