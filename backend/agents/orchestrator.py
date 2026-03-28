import json
from google import genai
from google.genai import types
from context import SharedContext
from prompt_loader import load_prompt


async def run(ctx: SharedContext) -> SharedContext:
    """Seed the pipeline — sequence is deterministic, no API call needed."""
    return ctx


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
        model="gemini-2.5-flash",
        contents=user_message,
        config=types.GenerateContentConfig(system_instruction=prompt),
    )

    text = response.text.strip()
    data = json.loads(text)
    agent = data.get("agent", "content")
    if agent not in ("content", "assessment"):
        agent = "content"
    return agent
