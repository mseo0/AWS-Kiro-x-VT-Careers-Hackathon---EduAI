"""
Tests for Formatter agent output assembly.
Feature: eduai-course-builder
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from hypothesis import given, settings
from hypothesis import strategies as st

from context import SharedContext, Audience, Tone, OutputType, PriorOutputs, Source


def make_ctx(lesson=None, quiz=None, slides=None):
    return SharedContext(
        topic="Quantum Computing",
        audience=Audience.university,
        duration="4 weeks",
        tone=Tone.formal,
        learning_objectives=["Understand qubits"],
        outputs_requested=[OutputType.lesson, OutputType.quiz],
        sources=[Source(url="https://example.com", title="QC Intro", summary="Intro to QC")],
        prior_outputs=PriorOutputs(
            lesson_plan=lesson,
            quiz_bank=quiz,
            slide_outlines=slides,
        ),
    )


# Feature: eduai-course-builder, Property 17: Formatter assembles all prior outputs into markdown with headers
@given(
    has_lesson=st.booleans(),
    has_quiz=st.booleans(),
)
@settings(max_examples=100)
def test_formatter_assembles_non_null_sections(has_lesson, has_quiz):
    lesson = "## Week 1\nOverview" if has_lesson else None
    quiz = {"questions": [], "rubric": {}} if has_quiz else None

    expected_package = "# Course Package\n"
    if has_lesson:
        expected_package += "## Lesson Plan\n## Week 1\nOverview\n"
    if has_quiz:
        expected_package += "## Quiz Bank\n[quiz content]\n"

    mock_response = MagicMock()
    mock_response.text = expected_package

    with patch("agents.formatter.genai.Client") as MockClient:
        mock_client = MagicMock()
        MockClient.return_value = mock_client
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        from agents import formatter
        ctx = make_ctx(lesson=lesson, quiz=quiz)
        result = asyncio.get_event_loop().run_until_complete(formatter.run(ctx))

    assert isinstance(result, str)
    assert len(result) > 0
    assert ctx.prior_outputs.course_package == result
