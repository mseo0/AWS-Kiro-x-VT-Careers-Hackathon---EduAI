import json
from typing import Optional
from google import genai
from google.genai import types
from context import SharedContext
from prompt_loader import load_prompt


async def run(ctx: SharedContext, revision: Optional[str] = None) -> str:
    """Generate the week-by-week lesson plan in structured markdown."""
    client = genai.Client()
    prompt = load_prompt("content")

    payload: dict = {
        "topic": ctx.topic,
        "audience": ctx.audience,
        "duration": ctx.duration,
        "tone": ctx.tone,
        "learning_objectives": ctx.learning_objectives,
        "sources": [s.model_dump() for s in ctx.sources],
    }
    if revision:
        payload["revision_instructions"] = revision
    if ctx.prior_outputs.lesson_plan:
        payload["previous_lesson_plan"] = ctx.prior_outputs.lesson_plan

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=json.dumps(payload),
        config=types.GenerateContentConfig(system_instruction=prompt),
    )

    lesson_plan = response.text.strip()
    ctx.prior_outputs.lesson_plan = lesson_plan
    return lesson_plan
