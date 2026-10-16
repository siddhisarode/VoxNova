from typing import Optional

BASE_HUMAN_VOICE_PERSONA = """You are VoxNova, a warm, energetic, and highly conversational voice assistant on a live phone/web call.
Your responses are spoken aloud to the caller in real-time. Follow these critical conversational rules:
1. THE AAA TURN FORMULA: In every single turn, follow this 3-part sequence:
   a) Acknowledge: Warm, empathetic human opening (e.g. 'Oh, wonderful!', 'Sure thing!', 'I would love to help with that!', 'Got it,').
   b) Answer: 1 to 2 concise spoken sentences directly answering the user.
   c) Ask: An eager, proactive follow-up question to collect user information, qualify their needs, or guide them forward. Never leave a turn dead-ended!
2. BE EAGER TO GATHER INFORMATION: Proactively ask for caller details (like their name, contact info, specific preferences, or schedule) one friendly question at a time.
3. SOUND LIKE A REAL HUMAN: Use natural conversational phrasing, friendly interjections, and natural contractions ('I am' -> 'I am', 'it is' -> 'it is', 'we have' -> 'we have'). Never sound like a formal robot, FAQ document, or automated phone menu.
4. BANNED PHRASES: Never say passive, robotic lines like 'Is there anything else I can help you with?', 'How may I assist you further?', or 'Please clarify your query'. Take the initiative!
5. AUDIO FORMATTING: NEVER output markdown, asterisks (**), bullet points, headers, or emojis, as they degrade voice synthesis. Spell out symbols and abbreviations in plain words."""

def build_effective_system_prompt(custom_purpose: Optional[str] = None) -> str:
    """
    Combines the predesigned core human behavioral persona with the user's custom agent purpose.
    The predesigned prompt is kept hidden in the engine code, while the user provides only their
    business purpose and domain knowledge.
    """
    if not custom_purpose or not custom_purpose.strip():
        return BASE_HUMAN_VOICE_PERSONA

    clean = custom_purpose.strip()

    # If the user's text contains old boilerplate from before this update, strip it out cleanly
    markers = [
        "5. AUDIO: NEVER output markdown formatting, bold (**), asterisks, bullet points, or emojis.",
        "5. AUDIO FORMATTING: NEVER output markdown, asterisks (**), bullet points, headers, or emojis, as they degrade voice synthesis. Spell out symbols and abbreviations in plain words.",
        "5. AUDIO FORMATTING: NEVER output markdown, bold text (**), asterisks, bullet points, or emojis."
    ]
    for m in markers:
        if m in clean:
            clean = clean.split(m)[-1].strip()

    if not clean:
        return BASE_HUMAN_VOICE_PERSONA

    return f"{BASE_HUMAN_VOICE_PERSONA}\n\n=== AGENT PURPOSE & DOMAIN KNOWLEDGE ===\n{clean}"


def strip_internal_boilerplate(prompt: Optional[str]) -> str:
    """
    Strips internal engine rules from stored prompts so the user UI only shows
    the user-facing purpose/domain knowledge.
    """
    if not prompt:
        return ""
    clean = prompt.strip()
    markers = [
        "=== AGENT PURPOSE & DOMAIN KNOWLEDGE ===",
        "5. AUDIO: NEVER output markdown formatting, bold (**), asterisks, bullet points, or emojis.",
        "5. AUDIO FORMATTING: NEVER output markdown, asterisks (**), bullet points, headers, or emojis, as they degrade voice synthesis. Spell out symbols and abbreviations in plain words.",
        "5. AUDIO FORMATTING: NEVER output markdown, bold text (**), asterisks, bullet points, or emojis."
    ]
    for m in markers:
        if m in clean:
            clean = clean.split(m)[-1].strip()
    
    # If the prompt only contained the internal boilerplate, return empty or default description
    if "You are VoxNova, a warm, energetic" in clean or "THE AAA TURN FORMULA" in clean:
        return ""
    return clean
