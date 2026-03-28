"""
Tests for prompt loading utility.
Feature: eduai-course-builder
"""
import os
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from prompt_loader import load_prompt, clear_cache

AGENT_NAMES = ["orchestrator", "research", "content", "assessment", "critic", "formatter"]
PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "prompts")


# Feature: eduai-course-builder, Property 25: Prompt file content used as system message
@given(agent_name=st.sampled_from(AGENT_NAMES))
@settings(max_examples=100)
def test_load_prompt_returns_file_content(agent_name):
    clear_cache()
    result = load_prompt(agent_name)
    expected_path = os.path.join(PROMPTS_DIR, f"{agent_name}.txt")
    with open(expected_path, "r", encoding="utf-8") as f:
        expected = f.read()
    assert result == expected


def test_load_prompt_caches_result():
    clear_cache()
    first = load_prompt("orchestrator")
    second = load_prompt("orchestrator")
    assert first is second  # same object from cache


def test_load_prompt_missing_file_raises():
    with pytest.raises(FileNotFoundError):
        load_prompt("nonexistent_agent_xyz")
