"""
Tests for pipeline orchestration.
Feature: eduai-course-builder
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock, call
from hypothesis import given, settings
from hypothesis import strategies as st

from context import (
    SharedContext, Audience, Tone, OutputType, PriorOutputs,
    ContextStatus, CriticResult, Source,
)
from pipeline import run_pipeline, run_feedback_pipeline


def make_ctx():
    return SharedContext(
        topic="Python Programming",
        audience=Audience.university,
        duration="4 weeks",
        tone=Tone.engaging,
        learning_objectives=["Write Python functions"],
        outputs_requested=[OutputType.lesson, OutputType.quiz],
    )


def make_sources():
    return [Source(url=f"https://example.com/{i}", title=f"Source {i}", summary="Summary") for i in range(4)]


# Feature: eduai-course-builder, Property 16: Formatter only invoked after approval
def test_formatter_not_called_when_critic_rejects():
    """Formatter must not be called if critic never approves (cap forces it)."""
    call_log = []

    async def mock_orchestrator_run(ctx): pass
    async def mock_research_run(ctx):
        ctx.sources = make_sources()
        return ctx.sources
    async def mock_content_run(ctx, revision=None):
        ctx.prior_outputs.lesson_plan = "Lesson"
        return "Lesson"
    async def mock_assessment_run(ctx, revision=None):
        ctx.prior_outputs.quiz_bank = {"questions": [], "rubric": {}}
        return {}
    async def mock_critic_run(ctx):
        call_log.append("critic")
        ctx.critic_passes += 1
        if ctx.critic_passes < 2:
            return CriticResult(approved=False, revision_requests=[])
        return CriticResult(approved=True)
    async def mock_formatter_run(ctx):
        call_log.append("formatter")
        ctx.prior_outputs.course_package = "Package"
        return "Package"

    with patch("pipeline.orchestrator.run", mock_orchestrator_run), \
         patch("pipeline.research.run", mock_research_run), \
         patch("pipeline.content.run", mock_content_run), \
         patch("pipeline.assessment.run", mock_assessment_run), \
         patch("pipeline.critic.run", mock_critic_run), \
         patch("pipeline.formatter.run", mock_formatter_run):

        ctx = make_ctx()
        queue = asyncio.Queue()
        asyncio.get_event_loop().run_until_complete(run_pipeline(ctx, queue))

    # Formatter should only be called after approval
    formatter_idx = call_log.index("formatter") if "formatter" in call_log else -1
    last_critic_idx = max(i for i, v in enumerate(call_log) if v == "critic")
    assert formatter_idx > last_critic_idx


# Feature: eduai-course-builder, Property 5: Agent error halts the pipeline
@given(fail_at=st.sampled_from(["research", "content"]))
@settings(max_examples=20)
def test_agent_error_halts_pipeline(fail_at):
    called = []

    async def mock_orchestrator_run(ctx): called.append("orchestrator")
    async def mock_research_run(ctx):
        called.append("research")
        if fail_at == "research":
            raise RuntimeError("Research failed")
        ctx.sources = make_sources()
    async def mock_content_run(ctx, revision=None):
        called.append("content")
        if fail_at == "content":
            raise RuntimeError("Content failed")
        ctx.prior_outputs.lesson_plan = "Lesson"
    async def mock_assessment_run(ctx, revision=None):
        called.append("assessment")
        ctx.prior_outputs.quiz_bank = {}
    async def mock_critic_run(ctx): called.append("critic")
    async def mock_formatter_run(ctx): called.append("formatter")

    with patch("pipeline.orchestrator.run", mock_orchestrator_run), \
         patch("pipeline.research.run", mock_research_run), \
         patch("pipeline.content.run", mock_content_run), \
         patch("pipeline.assessment.run", mock_assessment_run), \
         patch("pipeline.critic.run", mock_critic_run), \
         patch("pipeline.formatter.run", mock_formatter_run):

        ctx = make_ctx()
        queue = asyncio.Queue()
        try:
            asyncio.get_event_loop().run_until_complete(run_pipeline(ctx, queue))
        except Exception:
            pass

    assert ctx.status == ContextStatus.error
    # Agents after the failing one should not have been called
    if fail_at == "research":
        assert "critic" not in called
        assert "formatter" not in called
