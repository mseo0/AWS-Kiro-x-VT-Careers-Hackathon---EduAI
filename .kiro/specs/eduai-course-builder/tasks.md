# Implementation Plan: EduAI Course Builder

## Overview

Incremental build of the Python FastAPI backend and Vite vanilla JS frontend. Each task wires directly into the previous one. Content and Assessment agents are implemented together to enable parallel execution testing early.

## Tasks

- [ ] 1. Project scaffolding and shared data models
  - Create `backend/` directory with `requirements.txt` (fastapi, uvicorn, google-generativeai, pydantic, hypothesis, pytest, pytest-asyncio)
  - Create `frontend/` directory with `package.json` (vite, fast-check, vitest)
  - Create `backend/context.py` with all Pydantic models: `Audience`, `Tone`, `OutputType`, `ContextStatus`, `Source`, `FeedbackEntry`, `PriorOutputs`, `SharedContext`, `CriticResult`, `RevisionRequest`, `GenerateRequest`, `GenerateResponse`, `FeedbackRequest`, `ResultResponse`
  - Create `backend/tests/conftest.py` with Hypothesis profile (`max_examples=100`)
  - Create `frontend/tests/setup.js` with fast-check global config (`numRuns: 100`)
  - _Requirements: 2.1, 2.2_

  - [ ]* 1.1 Write property tests for SharedContext schema (P2, P3)
    - **Property 2: Form input → SharedContext seeding round-trip** — generate arbitrary `GenerateRequest` objects; assert `seed_context(req)` produces a `SharedContext` with identical field values
    - **Property 3: SharedContext schema invariant** — generate arbitrary `SharedContext` dicts; assert Pydantic validation accepts valid ones and rejects invalid ones
    - File: `backend/tests/test_context.py`
    - **Validates: Requirements 1.4, 2.1, 2.2**

- [ ] 2. Prompt files and prompt-loading utility
  - Create `prompts/` directory at repo root
  - Create `prompts/orchestrator.txt`, `prompts/research.txt`, `prompts/content.txt`, `prompts/assessment.txt`, `prompts/critic.txt`, `prompts/formatter.txt` with placeholder system instructions
  - Create `backend/prompt_loader.py` with a `load_prompt(agent_name: str) -> str` function that reads and caches `prompts/<agent>.txt`
  - _Requirements: 14.1, 14.2_

  - [ ]* 2.1 Write property test for prompt loading (P25)
    - **Property 25: Prompt file content used as system message** — generate arbitrary agent names from the known set; assert `load_prompt(name)` returns the exact file content of `prompts/<name>.txt`
    - File: `backend/tests/test_prompts.py`
    - **Validates: Requirements 14.1, 14.2**

- [ ] 3. Academic MCP client
  - Create `backend/mcp_client.py` with `search_sources(query: str, audience: str) -> list[Source]`
  - Fan out to Google Scholar, PubMed, arXiv, Semantic Scholar; deduplicate; return 4–8 ranked `Source` objects
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.1 Write property test for Research agent source structure (P8)
    - **Property 8: Research agent source structure and context population** — mock MCP responses with arbitrary source lists; assert result count in [4, 8] and each source has non-empty `url`, `title`, `summary`; assert `SharedContext.sources` equals the returned list
    - File: `backend/tests/test_research.py`
    - **Validates: Requirements 4.2, 4.4, 4.5**

- [ ] 4. Individual agent implementations
  - Create `backend/agents/__init__.py`
  - Implement each agent using the pattern: load prompt via `load_prompt()`, serialise relevant SharedContext fields as JSON user message, call `client.aio.models.generate_content(model="gemini-2.5-pro", ...)`, parse response, update SharedContext
  - `backend/agents/orchestrator.py` — `run(ctx: SharedContext) -> SharedContext`; respond with valid JSON only; route feedback to one agent
  - `backend/agents/research.py` — `run(ctx: SharedContext) -> list[Source]`; call `mcp_client.search_sources`; populate `ctx.sources`
  - `backend/agents/content.py` — `run(ctx: SharedContext, revision: str | None) -> str`; produce structured markdown with one section per week
  - `backend/agents/assessment.py` — `run(ctx: SharedContext, revision: str | None) -> dict`; produce exactly 15 MCQs with Bloom's labels and rubric
  - `backend/agents/critic.py` — `run(ctx: SharedContext) -> CriticResult`; increment `ctx.critic_passes`; force approve at passes == 2
  - `backend/agents/formatter.py` — `run(ctx: SharedContext) -> str`; assemble all non-null `prior_outputs` sections into markdown with headers
  - _Requirements: 3.1, 3.2, 4.1–4.5, 5.1–5.4, 6.1–6.7, 8.1–8.6, 9.1–9.3, 10.1–10.5, 14.1, 14.2_

  - [ ]* 4.1 Write property tests for Orchestrator (P6, P7)
    - **Property 6: Orchestrator response is valid JSON** — generate arbitrary orchestrator inputs; assert raw response string is parseable JSON
    - **Property 7: Feedback routes to exactly one agent** — generate arbitrary feedback strings; assert routing returns exactly one of "content" or "assessment"
    - File: `backend/tests/test_orchestrator.py`
    - **Validates: Requirements 3.2, 3.3, 11.3**

  - [ ]* 4.2 Write property tests for Content agent (P9)
    - **Property 9: Content agent weekly structure** — generate arbitrary week counts; assert content output has exactly one section per week, each with overview paragraph, 2 lecture titles, 1 activity, and 5–7 slide bullets
    - File: `backend/tests/test_content.py`
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 4.3 Write property tests for Assessment agent (P10, P11)
    - **Property 10: Assessment agent question count and Bloom's distribution** — generate arbitrary topics/objectives; assert quiz has exactly 15 questions: 5 recall, 5 comprehension, 5 application/analysis
    - **Property 11: Each question has exactly 4 options with one correct answer** — generate arbitrary quiz outputs; assert each question has exactly 4 options and exactly 1 correct
    - File: `backend/tests/test_assessment.py`
    - **Validates: Requirements 6.2, 6.3, 6.5**

  - [ ]* 4.4 Write property tests for Critic agent (P13, P14, P15)
    - **Property 13: Critic revision requests are structured** — generate arbitrary critic inputs with issues; assert response contains non-empty list of `RevisionRequest` with non-empty `agent` and `instructions`
    - **Property 14: critic_passes increments by exactly 1 per cycle** — run critic N times; assert `critic_passes == N` after each run
    - **Property 15: Two critic passes forces approval** — set `critic_passes = 2` before invocation; assert `approved == True` always
    - File: `backend/tests/test_critic.py`
    - **Validates: Requirements 8.2, 8.4, 8.5**

  - [ ]* 4.5 Write property tests for Formatter agent (P17)
    - **Property 17: Formatter assembles all prior outputs into markdown with headers** — generate arbitrary `prior_outputs`; assert formatter output contains all non-null sections with clear section headers
    - File: `backend/tests/test_formatter.py`
    - **Validates: Requirements 9.1, 9.2**

  - [ ]* 4.6 Write property tests for API wrapper (P18, P19)
    - **Property 18: All agent calls use gemini-2.5-pro** — intercept all agent calls; assert `model == "gemini-2.5-pro"` for every invocation
    - **Property 19: SharedContext serialised as JSON in user message** — generate arbitrary SharedContext instances; assert user message is valid JSON deserialising to expected fields
    - File: `backend/tests/test_api_wrapper.py`
    - **Validates: Requirements 10.2, 10.4**

- [ ] 5. Pipeline orchestration
  - Create `backend/pipeline.py` with:
    - `run_pipeline(ctx: SharedContext, queue: asyncio.Queue) -> SharedContext` — Orchestrator → Research → `asyncio.gather(Content, Assessment)` → Critic loop (max 2 passes) → Formatter
    - `run_feedback_pipeline(ctx: SharedContext, feedback: str, queue: asyncio.Queue) -> SharedContext` — route via Orchestrator → targeted agent → Critic → Formatter
  - Emit `{ agent, status, message }` dicts to `queue` on each agent state change
  - Catch `GoogleAPIError` and `json.JSONDecodeError`; set `ctx.status = error`; emit error event; raise `PipelineError`
  - _Requirements: 2.3, 2.4, 3.4, 7.1, 7.2, 8.4, 8.5, 8.6, 10.6_

  - [ ]* 5.1 Write property tests for pipeline ordering and error handling (P4, P5, P12, P16, P22)
    - **Property 4: Agent completion updates context before next invocation** — mock agent sequence; assert context fields written by agent N are present in context received by agent N+1
    - **Property 5: Agent error halts the pipeline** — mock a failing agent at random positions; assert no subsequent agents are called and `status == error`
    - **Property 12: Content and Assessment execute concurrently, Critic waits for both** — use asyncio timing; assert content and assessment start times overlap and critic starts after both finish
    - **Property 16: Formatter only invoked after approval** — mock critic returning `approved=False`; assert formatter is never called
    - **Property 22: Post-feedback pipeline ordering** — mock feedback pipeline; assert critic is called before formatter and formatter only called if approved
    - File: `backend/tests/test_pipeline.py`
    - **Validates: Requirements 2.3, 3.4, 7.1, 7.2, 8.6, 11.4**

- [ ] 6. FastAPI application
  - Create `backend/main.py` with endpoints:
    - `POST /generate` — validate `GenerateRequest`, seed `SharedContext`, start `run_pipeline` as background task, store context and queue in `job_store: dict`, return `{ job_id }`
    - `GET /stream/{job_id}` — SSE endpoint consuming the job's `asyncio.Queue`; emit `text/event-stream` events
    - `GET /result/{job_id}` — return `ResultResponse` with `course_package` and `shared_context`
    - `POST /feedback/{job_id}` — append `FeedbackEntry` to `ctx.feedback_history`, start `run_feedback_pipeline` as background task
    - `GET /health` — liveness check
  - _Requirements: 1.4, 3.1, 11.1–11.4, 12.2, 12.4, 13.1_

- [ ] 7. Checkpoint — backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Frontend API module and SSE wiring
  - Create `frontend/src/api.js` with:
    - `startGeneration(formData)` — `POST /generate`, returns `job_id`
    - `streamStatus(jobId, onEvent)` — opens `EventSource` on `GET /stream/{job_id}`, calls `onEvent` per message
    - `getResult(jobId)` — `GET /result/{job_id}`
    - `submitFeedback(jobId, text)` — `POST /feedback/{job_id}`
  - _Requirements: 12.2, 12.4, 13.1_

- [ ] 9. Frontend UI components
  - Create `frontend/src/ui/agentCard.js` — renders agent card with four states: `waiting` (gray dot), `running` (blinking green + progress bar), `done` (solid green + log lines), `error` (red dot + message + retry button)
  - Create `frontend/src/ui/outputPanel.js` — renders four tabs: Lesson, Sources, Quiz (click-to-reveal answers), Context (raw JSON)
  - Create `frontend/src/ui/feedbackBar.js` — text input + submit button; disabled while pipeline running, enabled on completion
  - _Requirements: 11.1, 11.5, 12.1, 12.2, 12.3, 13.1, 13.2, 13.3_

  - [ ]* 9.1 Write property tests for agent card state (P23, P24)
    - **Property 23: Agent card reflects SSE event state** — generate arbitrary SSE events `{ agent, status, message }`; assert agent card DOM state matches `status`
    - **Property 24: Error event shows error state and retry button** — generate arbitrary error events; assert error card state and retry button visibility
    - File: `frontend/tests/agentCard.test.js`
    - **Validates: Requirements 12.2, 12.4, 13.1**

  - [ ]* 9.2 Write property test for feedback bar enabled state (P20)
    - **Property 20: Feedback bar enabled iff pipeline is complete** — generate arbitrary pipeline states; assert feedback bar is enabled iff status is "approved" or "error"
    - File: `frontend/tests/feedbackBar.test.js`
    - **Validates: Requirements 11.1, 11.5, 13.3**

  - [ ]* 9.3 Write unit tests for layout and output tabs
    - Assert three-column layout renders with input, pipeline, and output panels
    - Assert four output tabs exist: Lesson, Sources, Quiz, Context
    - File: `frontend/tests/layout.test.js`
    - **Validates: Requirements 12.1, 12.3**

- [ ] 10. Frontend main entry point and form validation
  - Create `frontend/src/main.js` — wire form submission to `startGeneration`, open SSE via `streamStatus`, update agent cards on each event, call `getResult` on pipeline completion, render output tabs, enable feedback bar
  - Implement client-side topic validation: disable Run button and show inline message when topic is empty or whitespace-only
  - Show warning when learning objectives are empty
  - _Requirements: 1.1, 1.2, 1.3, 12.1–12.4, 13.2_

  - [ ]* 10.1 Write property test for empty topic validation (P1)
    - **Property 1: Empty topic rejects submission** — generate arbitrary strings; assert empty or whitespace-only strings are rejected by the validation function and the Run button remains disabled
    - File: `frontend/tests/feedbackBar.test.js` (add to existing) or a dedicated `inputValidation.test.js`
    - **Validates: Requirements 1.2**

- [ ] 11. Write property test for feedback history (P21)
  - **Property 21: Feedback submission appends to feedback_history** — generate arbitrary feedback messages; assert `feedback_history` grows by exactly 1 with correct `message`, valid ISO 8601 `timestamp`, and non-empty `agent_invoked`
  - File: `backend/tests/test_feedback.py`
  - _Requirements: 11.2_

- [ ] 12. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use Hypothesis (`@settings(max_examples=100)`) for backend and fast-check (`numRuns: 100`) for frontend
- Each property test includes a comment tag: `# Feature: eduai-course-builder, Property N: <title>`
- The Gemini client is instantiated as `from google import genai; client = genai.Client()` and called via `client.aio.models.generate_content(model="gemini-2.5-pro", ...)`
