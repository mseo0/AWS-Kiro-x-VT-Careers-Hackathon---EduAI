import json
from typing import Optional
from google import genai
from google.genai import types
from context import SharedContext
from prompt_loader import load_prompt
from config import GEMINI_MODEL
from mcp_client import _strip_json_fences
from agents.utils import extract_text


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
    if ctx.document_context:
        payload["document_context"] = ctx.document_context
    if revision:
        payload["revision_instructions"] = revision
    if ctx.prior_outputs.quiz_bank:
        payload["previous_quiz_bank"] = ctx.prior_outputs.quiz_bank

    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=json.dumps(payload),
        config=types.GenerateContentConfig(system_instruction=prompt),
    )

    text = extract_text(response)
    quiz_bank = json.loads(_strip_json_fences(text))
    ctx.prior_outputs.quiz_bank = quiz_bank
    return quiz_bank
