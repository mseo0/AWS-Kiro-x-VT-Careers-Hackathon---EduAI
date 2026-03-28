import os

_cache: dict[str, str] = {}
PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "prompts")


def load_prompt(agent_name: str) -> str:
    """Read and cache the system prompt for the given agent."""
    if agent_name in _cache:
        return _cache[agent_name]
    path = os.path.join(PROMPTS_DIR, f"{agent_name}.txt")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    _cache[agent_name] = content
    return content


def clear_cache() -> None:
    """Clear the prompt cache (useful for testing)."""
    _cache.clear()
