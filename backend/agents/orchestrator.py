import json
import logging
from typing import Optional
from google import genai
from google.genai import types
from context import SharedContext
from prompt_loader import load_prompt
from config import GEMINI_MODEL


from agents.utils import extract_text

logger = logging.getLogger(__name__)


async def run(ctx: SharedContext) -> dict:
    """
    Plan the pipeline based on outputs_requested.
    Derived deterministically — no LLM needed for structured data.
    Returns: { "parallel": ["content", "assessment"], "message": "..." }
    """
    requested = {o.value if hasattr(o, "value") else str(o) for o in ctx.outputs_requested}
    logger.info(f"[orchestrator] outputs_requested raw: {ctx.outputs_requested}")
    logger.info(f"[orchestrator] requested values: {requested}")

    parallel = []
    if "lesson" in requested:
        parallel.append("content")
    if "quiz" in requested:
        parallel.append("assessment")

    logger.info(f"[orchestrator] parallel agents: {parallel}")

    parts = []
    if "content" in parallel:
        parts.append("lesson plan")
    if "assessment" in parallel:
        parts.append("quiz bank")
    if "reading" in requested:
        parts.append("reading list")

    return {
        "parallel": parallel,
        "message": f"Generating {', '.join(parts)} for \"{ctx.topic}\".",
    }


async def route_feedback(ctx: SharedContext, feedback: str) -> str:
    """Route feedback to the correct agent. Returns 'content' or 'assessment'."""
    client = genai.Client()
    prompt = load_prompt("orchestrator")

    user_message = json.dumps({
        "action": "route_feedback",
        "feedback": feedback,
        "topic": ctx.topic,
        "prior_outputs_available": {
            "lesson_plan": ctx.prior_outputs.lesson_plan is not None,
            "quiz_bank": ctx.prior_outputs.quiz_bank is not None,
        },
    })

    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_message,
        config=types.GenerateContentConfig(system_instruction=prompt),
    )

    text = extract_text(response)
    data = json.loads(text)
    agent = data.get("agent", "content")
    if agent not in ("content", "assessment"):
        agent = "content"
    return agent
