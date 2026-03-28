import json
from google import genai
from google.genai import types
from context import SharedContext, Source
from prompt_loader import load_prompt
from mcp_client import _strip_json_fences


async def run(ctx: SharedContext) -> list[Source]:
    """Search for academic sources and populate ctx.sources."""
    client = genai.Client()
    prompt = load_prompt("research")

    user_message = json.dumps({
        "topic": ctx.topic,
        "audience": ctx.audience,
        "duration": ctx.duration,
        "learning_objectives": ctx.learning_objectives,
    })

    response = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_message,
        config=types.GenerateContentConfig(
            system_instruction=prompt,
            tools=[types.Tool(google_search=types.GoogleSearch())],
        ),
    )

    text = _extract_text(response)
    raw = json.loads(_strip_json_fences(text))

    sources = [Source(**s) for s in raw]
    sources = sources[:8]
    if len(sources) < 4:
        raise ValueError(f"Research agent returned fewer than 4 sources: {len(sources)}")

    ctx.sources = sources
    return sources


def _extract_text(response) -> str:
    for part in response.candidates[0].content.parts:
        if hasattr(part, "text") and part.text:
            return part.text
    return response.text
