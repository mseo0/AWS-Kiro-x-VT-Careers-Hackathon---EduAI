"""
Tests for Research agent source structure.
Feature: eduai-course-builder
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from hypothesis import given, settings
from hypothesis import strategies as st

from context import SharedContext, Audience, Tone, OutputType, Source


def make_ctx():
    return SharedContext(
        topic="Climate Change",
        audience=Audience.university,
        duration="6 weeks",
        tone=Tone.formal,
        learning_objectives=["Understand climate systems"],
        outputs_requested=[OutputType.lesson],
    )


def make_source_json(n):
    return [{"url": f"https://example.com/{i}", "title": f"Title {i}", "summary": f"Summary {i}"} for i in range(n)]


# Feature: eduai-course-builder, Property 8: Research agent source structure and context population
@given(n_sources=st.integers(min_value=4, max_value=8))
@settings(max_examples=100)
def test_research_source_structure(n_sources):
    import json
    mock_response = MagicMock()
    mock_response.text = json.dumps(make_source_json(n_sources))
    mock_response.candidates = [MagicMock()]
    mock_response.candidates[0].content.parts = [MagicMock(text=mock_response.text)]

    with patch("agents.research.genai.Client") as MockClient:
        mock_client = MagicMock()
        MockClient.return_value = mock_client
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        from agents import research
        ctx = make_ctx()
        sources = asyncio.get_event_loop().run_until_complete(research.run(ctx))

    assert 4 <= len(sources) <= 8
    assert ctx.sources == sources
    for s in sources:
        assert s.url
        assert s.title
        assert s.summary


def test_research_raises_if_fewer_than_4_sources():
    import json
    mock_response = MagicMock()
    mock_response.text = json.dumps(make_source_json(2))
    mock_response.candidates = [MagicMock()]
    mock_response.candidates[0].content.parts = [MagicMock(text=mock_response.text)]

    with patch("agents.research.genai.Client") as MockClient:
        mock_client = MagicMock()
        MockClient.return_value = mock_client
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        from agents import research
        ctx = make_ctx()
        with pytest.raises(ValueError):
            asyncio.get_event_loop().run_until_complete(research.run(ctx))
