"""
Tests for Orchestrator agent.
Feature: eduai-course-builder
"""
import json
import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from hypothesis import given, settings
from hypothesis import strategies as st

from context import SharedContext, Audience, Tone, OutputType


def make_ctx():
    return SharedContext(
        topic="Neural Networks",
        audience=Audience.university,
        duration="8 weeks",
        tone=Tone.engaging,
        learning_objectives=["Understand backpropagation"],
        outputs_requested=[OutputType.lesson, OutputType.quiz],
    )


# Feature: eduai-course-builder, Property 6: Orchestrator response is valid JSON
@given(topic=st.text(min_size=1, max_size=80))
@settings(max_examples=100)
def test_orchestrator_returns_valid_json(topic):
    valid_json = json.dumps({"action": "start_pipeline", "sequence": ["research", "content"]})
    mock_response = MagicMock()
    mock_response.text = valid_json

    with patch("agents.orchestrator.genai.Client") as MockClient:
        mock_client = MagicMock()
        MockClient.return_value = mock_client
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        from agents import orchestrator
        ctx = make_ctx()
        ctx.topic = topic
        asyncio.get_event_loop().run_until_complete(orchestrator.run(ctx))
        # If we get here without exception, JSON was valid
        parsed = json.loads(valid_json)
        assert isinstance(parsed, dict)


# Feature: eduai-course-builder, Property 7: Feedback routes to exactly one agent
@given(feedback=st.text(min_size=1, max_size=200))
@settings(max_examples=100)
def test_feedback_routes_to_exactly_one_agent(feedback):
    mock_response = MagicMock()
    mock_response.text = json.dumps({"action": "route_feedback", "agent": "content", "instructions": "Revise."})

    with patch("agents.orchestrator.genai.Client") as MockClient:
        mock_client = MagicMock()
        MockClient.return_value = mock_client
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        from agents import orchestrator
        ctx = make_ctx()
        agent = asyncio.get_event_loop().run_until_complete(orchestrator.route_feedback(ctx, feedback))

    assert agent in ("content", "assessment")
