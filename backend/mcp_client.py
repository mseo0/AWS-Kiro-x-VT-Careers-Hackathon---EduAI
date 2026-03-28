"""
Academic MCP client — wraps tool calls to Google Scholar, PubMed, arXiv, Semantic Scholar.
In production this connects to the real MCP server; the interface is kept thin so it can
be swapped or mocked in tests.
"""
import asyncio
import json
from google import genai
from google.genai import types
from context import Source


async def search_sources(query: str, audience: str) -> list[Source]:
    """
    Search for academic sources relevant to the query and audience.
    Returns 4-8 ranked Source objects.
    """
    client = genai.Client()

    search_prompt = (
        f"Search for 4-8 credible academic sources about: {query}\n"
        f"Target audience: {audience}\n"
        "Prioritise peer-reviewed journals, government agencies, and reputable organisations "
        "published within the last 3 years.\n"
        "Return a JSON array of source objects with fields: url, title, summary.\n"
        "Each summary should be 1-2 sentences describing the source's relevance.\n"
        "Return ONLY the JSON array, no other text."
    )

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=search_prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
        ),
    )

    text = _extract_text(response)
    raw = json.loads(_strip_json_fences(text))

    sources = [Source(**s) for s in raw]
    # Clamp to 4-8
    sources = sources[:8]
    if len(sources) < 4:
        raise ValueError(f"Research agent returned fewer than 4 sources: {len(sources)}")
    return sources


def _extract_text(response) -> str:
    for part in response.candidates[0].content.parts:
        if hasattr(part, "text") and part.text:
            return part.text
    return response.text


def _strip_json_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return text.strip()
