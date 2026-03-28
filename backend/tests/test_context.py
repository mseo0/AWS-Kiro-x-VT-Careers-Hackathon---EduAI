"""
Tests for SharedContext schema and seeding.
Feature: eduai-course-builder
"""
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from context import (
    GenerateRequest, SharedContext, Audience, Tone, OutputType,
    ContextStatus, seed_context,
)

# Strategies
audience_st = st.sampled_from(list(Audience))
tone_st = st.sampled_from(list(Tone))
output_type_st = st.lists(st.sampled_from(list(OutputType)), min_size=1)
objectives_st = st.lists(st.text(min_size=1, max_size=80), max_size=5)


# Feature: eduai-course-builder, Property 2: Form input → SharedContext seeding round-trip
@given(
    topic=st.text(min_size=1, max_size=100),
    audience=audience_st,
    duration=st.text(min_size=1, max_size=30),
    tone=tone_st,
    objectives=objectives_st,
    outputs=output_type_st,
)
@settings(max_examples=100)
def test_seed_context_round_trip(topic, audience, duration, tone, objectives, outputs):
    req = GenerateRequest(
        topic=topic,
        audience=audience,
        duration=duration,
        tone=tone,
        learning_objectives=objectives,
        outputs_requested=outputs,
    )
    ctx = seed_context(req)
    assert ctx.topic == topic
    assert ctx.audience == audience
    assert ctx.duration == duration
    assert ctx.tone == tone
    assert ctx.learning_objectives == objectives
    assert ctx.outputs_requested == outputs


# Feature: eduai-course-builder, Property 3: SharedContext schema invariant
@given(
    topic=st.text(min_size=1, max_size=100),
    audience=audience_st,
    duration=st.text(min_size=1, max_size=30),
    tone=tone_st,
    objectives=objectives_st,
    outputs=output_type_st,
)
@settings(max_examples=100)
def test_shared_context_valid_schema(topic, audience, duration, tone, objectives, outputs):
    ctx = SharedContext(
        topic=topic,
        audience=audience,
        duration=duration,
        tone=tone,
        learning_objectives=objectives,
        outputs_requested=outputs,
    )
    assert ctx.status in list(ContextStatus)
    assert isinstance(ctx.critic_passes, int)
    assert isinstance(ctx.sources, list)
    assert isinstance(ctx.feedback_history, list)


def test_shared_context_rejects_invalid_audience():
    with pytest.raises(ValidationError):
        SharedContext(
            topic="Test",
            audience="invalid_audience",
            duration="4 weeks",
            tone="formal",
            learning_objectives=[],
            outputs_requested=["lesson"],
        )


def test_shared_context_rejects_invalid_status():
    with pytest.raises(ValidationError):
        SharedContext(
            topic="Test",
            audience="university",
            duration="4 weeks",
            tone="formal",
            learning_objectives=[],
            outputs_requested=["lesson"],
            status="unknown_status",
        )
