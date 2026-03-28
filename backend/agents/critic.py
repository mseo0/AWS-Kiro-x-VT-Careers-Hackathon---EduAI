import json
from google import genai
from google.genai import types
from context import SharedContext, CriticResult, RevisionRequest
from prompt_loader import load_prompt
from mcp_client import _strip_json_fences


async def run(ctx: SharedContext) -> CriticResult:
    """Validate outputs. Force approve when critic_passes >= 2."""
    # Force approve if cap reached
    if ctx.critic_passes >= 2:
        ctx.critic_passes += 1
        return CriticResult(
            approved=True,
            revision_requests=[],
            unresolved_issues=["Critic pass cap reached; outputs approved without full review."],
        )

    client = genai.Client()
    prompt = load_prompt("critic")

    payload = {
        "topic": ctx.topic,
        "audience": ctx.audience,
        "learning_objectives": ctx.learning_objectives,
        "sources": [s.model_dump() for s in ctx.sources],
        "critic_passes": ctx.critic_passes,
        "prior_outputs": {
            "lesson_plan": ctx.prior_outputs.lesson_plan,
            "quiz_bank": ctx.prior_outputs.quiz_bank,
        },
    }

    response = await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=json.dumps(payload),
        config=types.GenerateContentConfig(system_instruction=prompt),
    )

    text = response.text.strip()
    data = json.loads(_strip_json_fences(text))

    ctx.critic_passes += 1

    return CriticResult(
        approved=data.get("approved", False),
        revision_requests=[RevisionRequest(**r) for r in data.get("revision_requests", [])],
        unresolved_issues=data.get("unresolved_issues", []),
    )
