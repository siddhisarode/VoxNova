import re
import logging

logger = logging.getLogger("voxai.voice.speech_normalizer")

# Currency regex (Rupee, Dollar, Euro, Pound)
CURRENCY_RE = re.compile(r'(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)', re.IGNORECASE)
DOLLAR_RE = re.compile(r'\$\s*([\d,]+(?:\.\d+)?)')
EURO_RE = re.compile(r'€\s*([\d,]+(?:\.\d+)?)')
POUND_RE = re.compile(r'£\s*([\d,]+(?:\.\d+)?)')

# Number ranges like "1-5", "6–8"
RANGE_RE = re.compile(r'(\b\d+)\s*[\-–—]\s*(\d+\b)')

# Clock times like "8 AM", "4 PM"
TIME_AM_PM_RE = re.compile(r'\b(\d{1,2})\s*(AM|PM)\b', re.IGNORECASE)

# Markdown artifacts
MARKDOWN_CHARS = re.compile(r'[*_~`#>]')
MARKDOWN_LINKS = re.compile(r'\[([^\]]+)\]\([^)]+\)')
BULLETS_RE = re.compile(r'^[ \t\-\•\*]+', re.MULTILINE)

# Abbreviations to phonetic human speech (using negative lookaround instead of \b to handle dots)
ABBREV_MAP = {
    r'(?<!\w)e\.g\.(?!\w)': 'for example',
    r'(?<!\w)i\.e\.(?!\w)': 'that is',
    r'(?<!\w)vs\.(?!\w)': 'versus',
    r'(?<!\w)etc\.(?!\w)': 'and so on',
    r'(?<!\w)dept\.(?!\w)': 'department',
    r'(?<!\w)min\.(?!\w)': 'minutes',
    r'(?<!\w)max\.(?!\w)': 'maximum',
    r'(?<!\w)approx\.(?!\w)': 'approximately',
    r'(?<!\w)govt\.(?!\w)': 'government',
    r'\binfo\b': 'information',
}

def normalize_speech_text(text: str) -> str:
    """
    Transforms raw LLM output into smooth, natural, human-phonetic speech for voice synthesis.
    Eliminates robotic artifacts, fixes currency mispronunciations, formats number ranges,
    and inserts natural conversational pauses.
    """
    if not text:
        return ""

    t = text

    # Strip markdown formatting
    t = MARKDOWN_LINKS.sub(r'\1', t)
    t = MARKDOWN_CHARS.sub('', t)
    t = BULLETS_RE.sub('', t)

    # 1. Normalize Common Abbreviations first (before touching punctuation)
    for pattern, replacement in ABBREV_MAP.items():
        t = re.sub(pattern, replacement, t, flags=re.IGNORECASE)

    # 2. Normalize Currency: ₹45,000 -> 45,000 rupees
    t = CURRENCY_RE.sub(r'\1 rupees', t)
    t = DOLLAR_RE.sub(r'\1 dollars', t)
    t = EURO_RE.sub(r'\1 euros', t)
    t = POUND_RE.sub(r'\1 pounds', t)

    # 3. Normalize Ranges: "Grades 1–5" or "1-5" -> "1 to 5"
    t = RANGE_RE.sub(r'\1 to \2', t)

    # 4. Normalize Time: "8 AM" -> "8 A M", "4 PM" -> "4 P M"
    t = TIME_AM_PM_RE.sub(lambda m: f"{m.group(1)} {m.group(2)[0].upper()} {m.group(2)[1].upper()}", t)

    # 5. Normalize Percentages: "10%" -> "10 percent"
    t = re.sub(r'(\d+)%', r'\1 percent', t)

    # 6. Convert newlines to natural breathing comma pauses
    t = re.sub(r'\n+', ', ', t)

    # 7. Comma spacing: add space only if NOT between digits (preserves "72,000")
    t = re.sub(r'(?<=[^\d]),(?=[^\s])', ', ', t)

    # Clean multiple spaces
    t = re.sub(r'\s+', ' ', t).strip()

    # Clean up double punctuation
    t = re.sub(r',+', ',', t)
    t = re.sub(r'\.+', '.', t)

    return t.strip()
