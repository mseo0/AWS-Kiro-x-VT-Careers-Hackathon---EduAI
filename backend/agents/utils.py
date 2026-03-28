def extract_text(response) -> str:
    """Extract only text parts from a Gemini response, ignoring thought_signature etc."""
    text_parts = []
    for part in response.candidates[0].content.parts:
        if hasattr(part, "text") and part.text:
            text_parts.append(part.text)
    return "".join(text_parts).strip()
