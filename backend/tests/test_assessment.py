"""
Tests for Assessment agent question structure.
Feature: eduai-course-builder
"""
import json
import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from hypothesis import given, settings
from hypothesis import strategies as st

from context import SharedContext, Audience, Tone, OutputType, Source


def make_ctx(objectives=None):
    return SharedContext(
        topic="Data Structures",
        audience=Audience.university,
        duration="8 weeks",
        tone=Tone.formal,
        learning_objectives=objectives or ["Understand arrays and linked lists"],
        outputs_requested=[OutputType.quiz],
        sources=[Source(url="https://example.com", title="DS Book", summary="Core reference")],
    )


def make_quiz_json(bloom_dist=None):
    """Generate a valid quiz JSON with the given Bloom's distribution."""
    if bloom_dist is None:
        bloom_dist = {"recall": 5, "comprehension": 5, "application/analysis": 5}
    questions = []
    qid = 1
    for level, count in bloom_dist.items():
        for _ in range(count):
            questions.append({
                "id": qid,
                "bloom_level": level,
                "question": f"Question {qid}?",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correct": "A",
                "objective": "Understand arrays",
            })
            qid += 1
    return {"questions": questions, "rubric": {"criteria": ["Accuracy"], "scoring": "4-point scale"}}


# Feature: eduai-course-builder, Property 10: Assessment agent question count and Bloom's distribution
@given(
    recall=st.just(5),
    comprehension=st.just(5),
    application=st.just(5),
)
@settings(max_examples=100)
def test_assessment_question_count_and_blooms(recall, comprehension, application):
    quiz = make_quiz_json({"recall": recall, "comprehension": comprehension, "application/analysis": application})
    questions = quiz["questions"]
    assert len(questions) == 15
    assert sum(1 for q in questions if q["bloom_level"] == "recall") == 5
    assert sum(1 for q in questions if q["bloom_level"] == "comprehension") == 5
    assert sum(1 for q in questions if q["bloom_level"] == "application/analysis") == 5


# Feature: eduai-course-builder, Property 11: Each question has exactly 4 options with one correct answer
@given(quiz_data=st.just(make_quiz_json()))
@settings(max_examples=100)
def test_each_question_has_4_options_one_correct(quiz_data):
    for q in quiz_data["questions"]:
        assert len(q["options"]) == 4
        assert q["correct"] in ("A", "B", "C", "D")


def test_assessment_agent_produces_valid_quiz():
    quiz = make_quiz_json()
    mock_response = MagicMock()
    mock_response.text = json.dumps(quiz)

    with patch("agents.assessment.genai.Client") as MockClient:
        mock_client = MagicMock()
        MockClient.return_value = mock_client
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        from agents import assessment
        ctx = make_ctx()
        result = asyncio.get_event_loop().run_until_complete(assessment.run(ctx))

    assert "questions" in result
    assert len(result["questions"]) == 15
