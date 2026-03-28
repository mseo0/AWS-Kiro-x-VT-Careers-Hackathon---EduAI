# Design Document: EduAI Course Builder

## Overview

EduAI Course Builder is a multi-agent AI application that generates complete, research-grounded course packages from teacher-provided inputs. A teacher specifies a topic, target audience, duration, tone, and learning objectives; a coordinated pipeline of specialised Gemini agents then produces a lesson plan, quiz bank, reading list, and slide outlines.

The system is split into two tiers:

- **Python backend (FastAPI)** — hosts the agent pipeline, manages SharedContext, calls the Gemini API (`gemini-2.5-pro`) via the `google-genai` SDK (`google.genai`), and integrates with the academic MCP server. The API key never leaves the server.he server.r.
- **Vite frontend (vanilla JS)** — renders a three-column layout (input panel | agent pipeline | output panel), streams real-time agent status via SSE, and sends HTTP requests to the backend.

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend framework | FastAPI | Async-native, SSE support, automatic OpenAPI docs |
| AI model | `gemini-2.5-flash` | Best reasoning quality for multi-step academic content |
| Parallelism | `asyncio.gather` | Content and Assessment agents run concurrently after Research |
| Real-time updates | Server-Sent Events (SSE) | Simpler than WebSockets for unidirectional status streaming |
| Prompt storage | `prompts/*.txt` files | Decouples prompt iteration from code changes |
| Critic loop cap | 2 passes | Prevents infinite loops while allowing one revision cycle |

---

## Architecture

```mermaid
graph TD
    Teacher["Teacher (Browser)"] -->|HTTP POST /generate| Backend["FastAPI Backend"]
    Teacher -->|GET /stream/{job_id}| SSE["SSE Stream"]
    Backend --> Orchestrator
    Orchestrator --> Research["Research Agent"]
    Research -->|MCP calls| MCP["Academic MCP Server\n(Scholar, PubMed, arXiv, Semantic Scholar)"]
    Research -->|sources| Parallel
    subgraph Parallel ["asyncio.gather"]
        Content["Content Agent"]
        Assessment["Assessment Agent"]
    end
    Parallel --> Critic["Critic Agent"]
    Critic -->|revision request| Content
    Critic -->|revision request| Assessment
    Critic -->|approved| Formatter["Formatter Agent"]
    Formatter -->|course package| Backend
    Backend -->|SSE events| Teacher
    Teacher -->|POST /feedback| Backend
    Backend -->|selective re-invoke| Orchestrator
```

### Request Flow

1. Teacher submits form → `POST /generate` → backend seeds SharedContext, starts pipeline as background task, returns `job_id`.
2. Frontend opens `GET /stream/{job_id}` SSE connection to receive agent status events.
3. Pipeline runs: Orchestrator → Research → (Content ∥ Assessment) → Critic loop → Formatter.
4. Each agent status change emits an SSE event `{ agent, status, message }`.
5. On completion, `GET /result/{job_id}` returns the full course package.
6. Teacher may submit feedback via `POST /feedback/{job_id}`; Orchestrator routes to the relevant agent, then re-runs Critic → Formatter.

---

## Components and Interfaces

### Backend Components

#### `main.py` — FastAPI Application

```
POST /generate          → starts pipeline, returns { job_id }
GET  /stream/{job_id}   → SSE stream of agent status events
GET  /result/{job_id}   → returns completed CoursePackage
POST /feedback/{job_id} → appends feedback, triggers selective re-invocation
GET  /health            → liveness check
```

SSE event shape:
```json
{ "agent": "research", "status": "running" | "done" | "error", "message": "..." }
```

#### `context.py` — SharedContext

Dataclass / Pydantic model passed between all agents. See Data Models section.

#### `pipeline.py` — Pipeline Orchestration

Drives the full agent sequence using `asyncio`. Exposes:
- `run_pipeline(ctx: SharedContext) -> SharedContext`
- `run_feedback_pipeline(ctx: SharedContext, feedback: str) -> SharedContext`

Emits status events to an `asyncio.Queue` consumed by the SSE endpoint.

#### `mcp_client.py` — Academic MCP Client

Wraps the MCP server tool calls. Exposes:
- `search_sources(query: str, audience: str) -> list[Source]`

Internally fans out to Google Scholar, PubMed, arXiv, and Semantic Scholar, deduplicates, and returns 4–8 ranked source objects.

#### `agents/` — Individual Agents

Each agent module exposes a single async function:

| Module | Function signature |
|---|---|
| `orchestrator.py` | `run(ctx: SharedContext) -> SharedContext` |
| `research.py` | `run(ctx: SharedContext) -> list[Source]` |
| `content.py` | `run(ctx: SharedContext, revision: str \| None) -> str` |
| `assessment.py` | `run(ctx: SharedContext, revision: str \| None) -> dict` |
| `critic.py` | `run(ctx: SharedContext) -> CriticResult` |
| `formatter.py` | `run(ctx: SharedContext) -> str` |

Each agent:
1. Reads its prompt from `prompts/<name>.txt`.
2. Serialises the relevant SharedContext fields as the user message.
3. Calls `gemini-2.5-pro` via `google.genai`.
4. Parses and validates the response.
5. Updates SharedContext and returns.

#### Gemini API Wrapper (inline in each agent)

All agents use the same pattern:
```python
from google import genai

client = genai.Client()
response = await client.aio.models.generate_content(
    model="gemini-2.5-pro",
    contents=user_message,
    config=genai.types.GenerateContentConfig(
        system_instruction=prompt_text,
        tools=[mcp_tool],   # Research agent only
    ),
)
```

Error handling: any `google.genai.errors.APIError` is caught, sets `ctx.status = "error"`, and raises to halt the pipeline.
```

Error handling: any `google.genai.errors.APIError` is caught, sets `ctx.status = "error"`, and raises to halt the pipeline.

### Frontend Components

#### `src/api.js`

```js
export async function startGeneration(formData)   // POST /generate
export function streamStatus(jobId, onEvent)       // GET /stream/{job_id} via EventSource
export async function getResult(jobId)             // GET /result/{job_id}
export async function submitFeedback(jobId, text)  // POST /feedback/{job_id}
```

#### `src/ui/agentCard.js`

Renders a single agent card. States: `waiting` (gray dot), `running` (blinking green + progress bar), `done` (solid green + log lines), `error` (red dot + message).

#### `src/ui/outputPanel.js`

Renders four tabs: Lesson, Sources, Quiz, Context (raw SharedContext JSON).

#### `src/ui/feedbackBar.js`

Text input + submit button. Disabled while pipeline is running. Enabled on pipeline completion.

#### `src/main.js`

Wires form submission, SSE event handling, and tab rendering. No framework — plain DOM APIs.

---

## Data Models

### SharedContext

```python
from pydantic import BaseModel
from enum import Enum
from typing import Optional

class Audience(str, Enum):
    k12 = "k12"
    university = "university"
    corporate = "corporate"

class Tone(str, Enum):
    formal = "formal"
    engaging = "engaging"
    socratic = "socratic"
    concise = "concise"

class OutputType(str, Enum):
    lesson = "lesson"
    quiz = "quiz"
    reading = "reading"
    slides = "slides"

class ContextStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    approved = "approved"
    error = "error"

class Source(BaseModel):
    url: str
    title: str
    summary: str

class FeedbackEntry(BaseModel):
    message: str
    timestamp: str          # ISO 8601
    agent_invoked: str

class PriorOutputs(BaseModel):
    lesson_plan: Optional[str] = None
    quiz_bank: Optional[dict] = None
    slide_outlines: Optional[str] = None
    course_package: Optional[str] = None

class SharedContext(BaseModel):
    topic: str
    audience: Audience
    duration: str
    tone: Tone
    learning_objectives: list[str]
    outputs_requested: list[OutputType]
    sources: list[Source] = []
    prior_outputs: PriorOutputs = PriorOutputs()
    feedback_history: list[FeedbackEntry] = []
    critic_passes: int = 0
    status: ContextStatus = ContextStatus.pending
```

### CriticResult

```python
class RevisionRequest(BaseModel):
    agent: str          # "content" | "assessment"
    instructions: str

class CriticResult(BaseModel):
    approved: bool
    revision_requests: list[RevisionRequest] = []
    unresolved_issues: list[str] = []   # populated when passes == 2
```

### API Request/Response Models

```python
class GenerateRequest(BaseModel):
    topic: str
    audience: Audience
    duration: str
    tone: Tone
    learning_objectives: list[str] = []
    outputs_requested: list[OutputType] = list(OutputType)

class GenerateResponse(BaseModel):
    job_id: str

class FeedbackRequest(BaseModel):
    message: str

class ResultResponse(BaseModel):
    course_package: str         # final markdown
    shared_context: SharedContext
```

### SSE Event

```typescript
// TypeScript shape for frontend reference
interface AgentEvent {
  agent: "orchestrator" | "research" | "content" | "assessment" | "critic" | "formatter";
  status: "waiting" | "running" | "done" | "error";
  message: string;
}
```

### Prompt File Convention

Each `prompts/<agent>.txt` file contains the system instruction for that agent. Agents read the file at startup (cached in memory). The user message is always the JSON-serialised relevant subset of SharedContext.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Empty topic rejects submission

*For any* form state where the topic field is empty or composed entirely of whitespace, the submit action shall be rejected and the Run button shall remain disabled.

**Validates: Requirements 1.2**

---

### Property 2: Form input → SharedContext seeding round-trip

*For any* valid teacher input (topic, audience, duration, tone, objectives, output types), the SharedContext produced by the seeding step shall contain exactly those values with no fields omitted or mutated.

**Validates: Requirements 1.4**

---

### Property 3: SharedContext schema invariant

*For any* SharedContext instance at any point in the pipeline, all required fields shall be present, correctly typed, and the `status` field shall be one of `pending`, `in_progress`, `approved`, or `error`.

**Validates: Requirements 2.1, 2.2**

---

### Property 4: Agent completion updates context before next invocation

*For any* two consecutive agents A and B in the pipeline, the SharedContext passed to B shall contain the fields written by A, and B shall not be invoked before A has completed.

**Validates: Requirements 2.3, 3.4**

---

### Property 5: Agent error halts the pipeline

*For any* agent that raises an error during execution, no subsequent agents in the pipeline shall be invoked, and `SharedContext.status` shall be set to `error`.

**Validates: Requirements 2.4, 10.6**

---

### Property 6: Orchestrator response is valid JSON

*For any* orchestrator invocation, the raw text response from the Gemini API shall be parseable as valid JSON without raising a parse error.

**Validates: Requirements 3.2**

---

### Property 7: Feedback routes to exactly one agent

*For any* feedback message submitted after pipeline completion, the Orchestrator shall invoke exactly one of `Content_Agent` or `Assessment_Agent` — never both, and never the full pipeline.

**Validates: Requirements 3.3, 11.3**

---

### Property 8: Research agent source structure and context population

*For any* Research_Agent invocation, the returned list shall contain between 4 and 8 source objects, each with non-empty `url`, `title`, and `summary` fields, and `SharedContext.sources` shall equal that list after completion.

**Validates: Requirements 4.2, 4.4, 4.5**

---

### Property 9: Content agent weekly structure

*For any* Content_Agent output, parsing the markdown shall yield exactly one section per week of the course duration, and each section shall contain an overview paragraph, 2 lecture titles with descriptions, 1 in-class activity, and a slide outline of 5–7 bullet points.

**Validates: Requirements 5.2, 5.3**

---

### Property 10: Assessment agent question count and Bloom's distribution

*For any* Assessment_Agent output, the quiz bank shall contain exactly 15 multiple-choice questions: exactly 5 labelled `recall`, exactly 5 labelled `comprehension`, and exactly 5 labelled `application/analysis`.

**Validates: Requirements 6.2, 6.5**

---

### Property 11: Each question has exactly 4 options with one correct answer

*For any* question in the Assessment_Agent output, the `options` array shall have exactly 4 elements and exactly one element shall be marked as the correct answer.

**Validates: Requirements 6.3**

---

### Property 12: Content and Assessment agents execute concurrently and Critic waits for both

*For any* pipeline run, the Content_Agent and Assessment_Agent shall both be started before either completes (concurrent execution), and the Critic_Agent shall not be invoked until both have completed.

**Validates: Requirements 7.1, 7.2**

---

### Property 13: Critic revision requests are structured

*For any* Critic_Agent response that does not approve outputs, the response shall contain a non-empty list of `RevisionRequest` objects, each with a non-empty `agent` and `instructions` field.

**Validates: Requirements 8.2**

---

### Property 14: critic_passes increments by exactly 1 per cycle

*For any* Critic_Agent review cycle, `SharedContext.critic_passes` after the cycle shall equal `SharedContext.critic_passes` before the cycle plus exactly 1.

**Validates: Requirements 8.4**

---

### Property 15: Two critic passes forces approval

*For any* pipeline run where `SharedContext.critic_passes` reaches 2, the Critic_Agent shall return `approved: true` regardless of any remaining issues.

**Validates: Requirements 8.5**

---

### Property 16: Formatter only invoked after approval

*For any* pipeline run, the Formatter shall not be invoked unless the most recent Critic_Agent response contains `approved: true`.

**Validates: Requirements 8.6, 9.3**

---

### Property 17: Formatter assembles all prior outputs into markdown with headers

*For any* Formatter invocation, the output shall be a single markdown string that contains all non-null sections from `SharedContext.prior_outputs` and includes clear section headers for each assembled component.

**Validates: Requirements 9.1, 9.2**

---

### Property 18: All agent calls use gemini-2.5-pro

*For any* agent invocation in the pipeline, the model name passed to the Gemini API shall be `gemini-2.5-flash`.

**Validates: Requirements 10.2**

---

### Property 19: SharedContext serialised as JSON in user message

*For any* agent API call, the user message content shall be a valid JSON string that deserialises to an object containing the relevant SharedContext fields for that agent.

**Validates: Requirements 10.4**

---

### Property 20: Feedback bar enabled iff pipeline is complete

*For any* application state, the feedback input bar shall be enabled if and only if the pipeline has completed (status `approved` or `error`), and disabled in all other states including while the pipeline is running.

**Validates: Requirements 11.1, 11.5, 13.3**

---

### Property 21: Feedback submission appends to feedback_history

*For any* feedback message submitted after pipeline completion, `SharedContext.feedback_history` after submission shall have length equal to its length before submission plus 1, and the last entry shall contain the submitted message, a valid ISO 8601 timestamp, and a non-empty `agent_invoked` field.

**Validates: Requirements 11.2**

---

### Property 22: Post-feedback pipeline ordering

*For any* feedback-triggered revision, after the targeted agent completes, the Critic_Agent shall be invoked before the Formatter, and the Formatter shall not be invoked unless the Critic returns `approved: true`.

**Validates: Requirements 11.4**

---

### Property 23: Agent card reflects SSE event state

*For any* SSE event `{ agent, status, message }` received by the frontend, the corresponding agent card shall immediately display the visual state matching `status` (gray/blinking-green/solid-green/red).

**Validates: Requirements 12.2, 12.4**

---

### Property 24: Error event shows error state and retry button

*For any* SSE error event for an agent, the corresponding agent card shall display the red error indicator with the error message, and a retry button shall become visible in the UI.

**Validates: Requirements 13.1**

---

### Property 25: Prompt file content used as system message

*For any* agent invocation, the system instruction passed to the Gemini API shall equal the exact content of the corresponding `prompts/<agent>.txt` file.

**Validates: Requirements 14.1, 14.2**

All agents wrap Gemini API calls in a try/except block catching `google.genai.errors.APIError` and `json.JSONDecodeError` (for response parsing). On error:

## Error Handling
All agents wrap Gemini API calls in a try/except block catching `google.genai.errors.APIError` and `json.JSONDecodeError` (for response parsing). On error:
### API Errors

All agents wrap Gemini API calls in a try/except block catching `google.api_core.exceptions.GoogleAPIError` and `json.JSONDecodeError` (for response parsing). On error:

1. The agent sets `ctx.status = ContextStatus.error`.
2. The pipeline emits an SSE event `{ agent, status: "error", message: error_detail }`.
3. The pipeline raises `PipelineError` to halt further invocations.
4. The job state is persisted so retry can resume from the failed agent.

### Retry Logic

The backend stores the last known good SharedContext per `job_id` in an in-memory dict (or Redis for production). On `POST /feedback/{job_id}` with a `retry: true` flag, the pipeline resumes from the failed agent using the stored context.

### Validation Errors

- **Empty topic**: Rejected client-side before any API call.
- **Malformed agent response**: If an agent returns non-JSON when JSON is expected, the error is treated the same as an API error (pipeline halts, error state set).
- **MCP server unavailable**: Research agent catches connection errors, sets error state, halts pipeline.

### Critic Loop Guard

The pipeline checks `ctx.critic_passes >= 2` before each Critic invocation. If the cap is reached, the Critic is forced to return `approved: true` with any unresolved issues noted in `unresolved_issues`.

### Frontend Error States

- Agent card transitions to red dot + error message on receiving an error SSE event.
- Retry button appears; clicking it calls `POST /feedback/{job_id}` with `{ retry: true }`.
- Input fields remain populated (no data loss on error).

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:

- **Unit tests** verify specific examples, integration points, and edge cases.
- **Property-based tests** verify universal invariants across randomly generated inputs.

### Property-Based Testing

**Library**: [`hypothesis`](https://hypothesis.readthedocs.io/) (Python) for backend properties; [`fast-check`](https://fast-check.io/) (JS) for frontend properties.

Each property-based test must:
- Run a minimum of **100 iterations** (configured via `@settings(max_examples=100)` in Hypothesis).
- Include a comment tag referencing the design property:
  ```python
  # Feature: eduai-course-builder, Property 3: SharedContext schema invariant
  ```
- Be implemented as a **single** property-based test per design property.

#### Backend Property Tests (Hypothesis)

| Property | Test description |
|---|---|
| P1 | Generate arbitrary strings; assert empty/whitespace strings are rejected by the validation function |
| P2 | Generate arbitrary `GenerateRequest` objects; assert `seed_context(req)` produces a `SharedContext` with identical field values |
| P3 | Generate arbitrary `SharedContext` dicts; assert Pydantic validation accepts valid ones and rejects invalid ones |
| P4 | Mock agent sequence; assert context fields written by agent N are present in the context received by agent N+1 |
| P5 | Mock a failing agent at random positions; assert no subsequent agents are called and status == error |
| P6 | Generate arbitrary orchestrator inputs; assert the raw response string is valid JSON |
| P7 | Generate arbitrary feedback strings; assert routing returns exactly one of "content" or "assessment" |
| P8 | Mock MCP responses with arbitrary source lists; assert result count in [4,8] and each source has url/title/summary |
| P9 | Generate arbitrary week counts; assert content output has correct section count and sub-elements |
| P10 | Generate arbitrary topics/objectives; assert quiz has exactly 15 questions with correct Bloom's distribution |
| P11 | Generate arbitrary quiz outputs; assert each question has exactly 4 options and exactly 1 correct |
| P12 | Use asyncio timing; assert content and assessment start times overlap and critic starts after both finish |
| P13 | Generate arbitrary critic inputs with issues; assert response contains structured RevisionRequest list |
| P14 | Run critic N times; assert critic_passes == N after each run |
| P15 | Set critic_passes = 2 before invocation; assert approved == True always |
| P16 | Mock critic returning approved=False; assert formatter is never called |
| P17 | Generate arbitrary prior_outputs; assert formatter output contains all non-null sections with headers |
| P18 | Intercept all agent calls; assert model_name == "gemini-2.5-flash" for every call |
| P19 | Generate arbitrary SharedContext; assert user message is valid JSON deserialising to expected fields |
| P21 | Generate arbitrary feedback messages; assert feedback_history grows by 1 with correct fields |
| P22 | Mock feedback pipeline; assert critic is called before formatter and formatter only called if approved |
| P25 | Generate arbitrary agent names; assert system instruction == file content of prompts/<agent>.txt |

#### Frontend Property Tests (fast-check)

| Property | Test description |
|---|---|
| P20 | Generate arbitrary pipeline states; assert feedback bar enabled iff status is "approved" or "error" |
| P23 | Generate arbitrary SSE events; assert agent card DOM state matches event status |
| P24 | Generate arbitrary error events; assert error card state and retry button visibility |

### Unit Tests

Unit tests focus on specific examples, integration points, and edge cases not covered by property tests:

- **Example tests**: Verify the three-column layout renders (Req 12.1), four output tabs exist (Req 12.3), MCP tool is registered on Research agent (Req 10.3), Gemini endpoint URL is correct (Req 10.1).
- **Edge cases**: Empty learning objectives → Assessment agent derives from topic (Req 1.3, 6.6); multi-part API response parsing (Req 10.5); retry preserves input fields (Req 13.2); rubric section present in quiz output (Req 6.4).
- **Integration tests**: Full pipeline smoke test with mocked Gemini responses; feedback flow end-to-end with mocked agents.

### Test Configuration

```python
# backend/tests/conftest.py
from hypothesis import settings
settings.register_profile("ci", max_examples=100)
settings.load_profile("ci")
```

```js
// frontend/tests/setup.js
import { configureGlobalThis } from 'fast-check';
configureGlobalThis({ numRuns: 100 });
```

### Test File Structure

```
backend/
└── tests/
    ├── test_context.py          # P2, P3
    ├── test_pipeline.py         # P4, P5, P12, P16, P22
    ├── test_orchestrator.py     # P6, P7
    ├── test_research.py         # P8
    ├── test_content.py          # P9
    ├── test_assessment.py       # P10, P11
    ├── test_critic.py           # P13, P14, P15
    ├── test_formatter.py        # P17
    ├── test_api_wrapper.py      # P18, P19
    ├── test_feedback.py         # P21
    └── test_prompts.py          # P25
frontend/
└── tests/
    ├── agentCard.test.js        # P23, P24
    ├── feedbackBar.test.js      # P20
    └── layout.test.js           # Examples: 3-column layout, 4 tabs
```
