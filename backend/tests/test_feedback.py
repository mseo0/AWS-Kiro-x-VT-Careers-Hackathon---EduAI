"""
Tests for feedback history appending.
Feature: eduai-course-builder
"""
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock
from hypothesis import given, settings
from hypothesis import strategies as st

from context import SharedContext, Audience, Tone, OutputType, PriorOutputs, Source, ContextStatus


def make_ctx():
    return SharedContext(
        topic="Algorithms",
        audience=Audience.university,
        duration="6 weeks",
        tone=Tone.engaging,
        learning_objectives=["Analyse time complexity"],
        outputs_requested=[OutputType.lesson, OutputType.quiz],
        sources=[Source(url="https://example.com", title="Algo Book", summary="Reference")],
        prior_outputs=PriorOutputs(
            lesson_plan="## Week 1\nOverview",
            quiz_bank={"questions": [], "rubric": {}},
            course_package="# Course",
        ),
        status=ContextStatus.approved,
    )


# Feature: eduai-course-builder, Property 21: Feedback submission appends to feedback_history
@given(feedback_msg=st.text(min_size=1, max_size=200))
@settings(max_examples=100)
def test_feedback_appends_to_history(feedback_msg):
    async def mock_route(ctx, feedback): return "content"
    async def mock_content_run(ctx, revision=None):
        ctx.prior_outputs.lesson_plan = "Revised lesson"
    async def mock_assessment_run(ctx, revision=None): pass
    async def mock_critic_run(ctx):
        from context import CriticResult
        ctx.critic_passes += 1
        return CriticResult(approved=True)
    async def mock_formatter_run(ctx):
        ctx.prior_outputs.course_package = "Updated package"

    with patch("pipeline.orchestrator.route_feedback", mock_route), \
         patch("pipeline.content.run", mock_content_run), \
         patch("pipeline.assessment.run", mock_assessment_run), \
         patch("pipeline.critic.run", mock_critic_run), \
         patch("pipeline.formatter.run", mock_formatter_run):

        ctx = make_ctx()
        initial_len = len(ctx.feedback_history)
        queue = asyncio.Queue()
        asyncio.get_event_loop().run_until_complete(
            __import__("pipeline").run_feedback_pipeline(ctx, feedback_msg, queue)
        )

    assert len(ctx.feedback_history) == initial_len + 1
    entry = ctx.feedback_history[-1]
    assert entry.message == feedback_msg
    assert entry.agent_invoked in ("content", "assessment")
    # Validate ISO 8601 timestamp
    datetime.fromisoformat(entry.timestamp)
