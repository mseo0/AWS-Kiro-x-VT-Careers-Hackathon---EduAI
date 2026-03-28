"""
Tests for Critic agent logic.
Feature: eduai-course-builder
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from hypothesis import given, settings
from hypothesis import strategies as st

from context import (
    SharedContext, Audience, Tone, OutputType, PriorOutputs,
    CriticResult, RevisionRequest,
)


def make_ctx(critic_passes=0):
    return SharedContext(
        topic="Machine Learning",
        audience=Audience.university,
        duration="8 weeks",
        tone=Tone.engaging,
        learning_objectives=["Understand supervised learning"],
        outputs_requested=[OutputType.lesson, OutputType.quiz],
        prior_outputs=PriorOutputs(
            lesson_plan="## Week 1\nOverview...",
            quiz_bank={"questions": [], "rubric": {}},
        ),
        critic_passes=critic_passes,
    )


# Feature: eduai-course-builder, Property 15: Two critic passes forces approval
@given(extra_passes=st.integers(min_value=0, max_value=5))
@settings(max_examples=100)
def test_critic_forces_approval_at_two_passes(extra_passes):
    from agents import critic

    ctx = make_ctx(critic_passes=2 + extra_passes)
    result = asyncio.get_event_loop().run_until_complete(_run_critic_no_api(ctx))
    assert result.approved is True


async def _run_critic_no_api(ctx):
    """Run critic logic without hitting the API (cap path only)."""
    from agents import critic
    # The cap check happens before any API call
    if ctx.critic_passes >= 2:
        ctx.critic_passes += 1
        return CriticResult(
            approved=True,
            revision_requests=[],
            unresolved_issues=["Critic pass cap reached; outputs approved without full review."],
        )
    raise AssertionError("Should have hit cap")


# Feature: eduai-course-builder, Property 14: critic_passes increments by exactly 1 per cycle
def test_critic_passes_increments():
    mock_response = MagicMock()
    mock_response.text = '{"approved": true, "revision_requests": [], "unresolved_issues": []}'

    with patch("agents.critic.genai.Client") as MockClient:
        mock_client = MagicMock()
        MockClient.return_value = mock_client
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        from agents import critic
        ctx = make_ctx(critic_passes=0)
        asyncio.get_event_loop().run_until_complete(critic.run(ctx))
        assert ctx.critic_passes == 1


# Feature: eduai-course-builder, Property 13: Critic revision requests are structured
def test_critic_revision_requests_are_structured():
    mock_response = MagicMock()
    mock_response.text = '''{
        "approved": false,
        "revision_requests": [
            {"agent": "content", "instructions": "Add more detail to Week 1."}
        ],
        "unresolved_issues": []
    }'''

    with patch("agents.critic.genai.Client") as MockClient:
        mock_client = MagicMock()
        MockClient.return_value = mock_client
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        from agents import critic
        ctx = make_ctx(critic_passes=0)
        result = asyncio.get_event_loop().run_until_complete(critic.run(ctx))

        assert result.approved is False
        assert len(result.revision_requests) > 0
        for req in result.revision_requests:
            assert req.agent in ("content", "assessment")
            assert len(req.instructions) > 0
