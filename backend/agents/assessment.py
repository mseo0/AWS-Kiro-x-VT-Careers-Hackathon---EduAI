import json
from typing import Optional
from google import genai
from google.genai import types
from context import SharedContext
from prompt_loader import load_prompt
from mcp_client import _strip_json_fences


async def run(ctx: SharedContext, revision: Optional[str] = None) -> dict:
    """Generate the quiz bank with 15 MCQs and a rubric."""
    client = genai.Client()
    prompt = load_prompt("assessment")

    objectives = ctx.learning_objectives or []
    payload: dict = {
        "topic": ctx.topic,
        "audience": ctx.audience,
        "tone": ctx.tone,
        "learning_objectives": objectives,
        "sources": [s.model_dump() for s in ctx.sources],
    }
    if revision:
        payload["revision_instructions"] = revision
    if ctx.prior_outputs.quiz_bank:
        payload["previous_quiz_bank"] = ctx.prior_outputs.quiz_bank

    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=json.dumps(payload),
        config=types.GenerateContentConfig(system_instruction=prompt),
    )

    text = response.text.strip()
    quiz_bank = json.loads(_strip_json_fences(text))
    ctx.prior_outputs.quiz_bank = quiz_bank
    return quiz_bank
