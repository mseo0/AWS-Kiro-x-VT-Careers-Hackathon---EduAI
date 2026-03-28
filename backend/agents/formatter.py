import json
from google import genai
from google.genai import types
from context import SharedContext
from prompt_loader import load_prompt
from config import GEMINI_MODEL
from agents.utils import extract_text


async def run(ctx: SharedContext) -> str:
    """Assemble all approved outputs into the final course package markdown."""
    client = genai.Client()
    prompt = load_prompt("formatter")

    payload = {
        "topic": ctx.topic,
        "audience": ctx.audience,
        "duration": ctx.duration,
        "tone": ctx.tone,
        "learning_objectives": ctx.learning_objectives,
        "sources": [s.model_dump() for s in ctx.sources],
        "prior_outputs": {
            "lesson_plan": ctx.prior_outputs.lesson_plan,
            "quiz_bank": ctx.prior_outputs.quiz_bank,
        },
    }

    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=json.dumps(payload),
        config=types.GenerateContentConfig(system_instruction=prompt),
    )

    course_package = extract_text(response)
    ctx.prior_outputs.course_package = course_package
    return course_package
