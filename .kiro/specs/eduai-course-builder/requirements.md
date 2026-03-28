# Requirements Document

## Introduction

EduAI is a multi-agent AI application that takes a teacher's input (topic, audience, duration, learning objectives, and tone) and produces a complete, research-grounded course package. The package includes a lesson plan, quiz bank, reading list, and slide outlines. A coordinated pipeline of specialised Gemini agents — connected via the Gemini API and an academic MCP server — handles research, content generation, assessment creation, critic validation, and final formatting. Teachers can submit feedback after generation to selectively revise specific outputs without re-running the full pipeline.

## Glossary

- **System**: The EduAI multi-agent course builder application
- **Orchestrator**: The entry-point agent that seeds the SharedContext, decides agent invocation order, and routes teacher feedback to the correct downstream agent
- **Research_Agent**: The agent responsible for finding credible, current sources via the academic MCP server
- **Content_Agent**: The agent that writes the lesson plan narrative, per-week breakdown, in-class activities, and slide outlines
- **Assessment_Agent**: The agent that generates the quiz bank and rubric aligned to learning objectives
- **Critic_Agent**: The agent that validates all outputs for accuracy, source alignment, age-appropriateness, and objective alignment
- **Formatter**: The agent that assembles all approved outputs into the final course package
- **SharedContext**: The structured JSON object passed between all agents as the shared memory architecture
- **Pipeline**: The ordered sequence of agent invocations that produces the final course package
- **Critic_Pass**: A single review cycle performed by the Critic_Agent; the system allows a maximum of 2 passes
- **Teacher**: The end user who provides course input and optionally submits feedback after generation
- **MCP_Tool**: The academic search MCP server used by the Research_Agent to query sources from Google Scholar, PubMed, arXiv, and Semantic Scholar
- **Course_Package**: The final assembled output containing lesson plan, quiz bank, reading list, and slide outlines

---

## Requirements

### Requirement 1: Teacher Input Collection

**User Story:** As a teacher, I want to provide my course topic, target audience, duration, tone, learning objectives, and desired output types, so that the system can generate a tailored course package.

#### Acceptance Criteria

1. THE System SHALL provide input fields for topic, audience (`k12`, `university`, `corporate`), duration, tone (`formal`, `engaging`, `socratic`, `concise`), learning objectives, and output types (`lesson`, `quiz`, `reading`, `slides`).
2. WHEN the topic field is empty, THE System SHALL disable the Run button and display an inline validation message.
3. WHEN learning objectives are not provided, THE System SHALL warn the teacher and configure the Assessment_Agent to derive objectives from the topic.
4. WHEN the teacher submits input, THE System SHALL seed the SharedContext with all provided values before invoking the Orchestrator.

---

### Requirement 2: SharedContext Schema

**User Story:** As a developer, I want a well-defined shared context object, so that all agents can read and write state consistently throughout the pipeline.

#### Acceptance Criteria

1. THE SharedContext SHALL contain the fields: `topic` (string), `audience` (enum), `duration` (string), `tone` (enum), `learning_objectives` (string array), `outputs_requested` (enum array), `sources` (object array), `prior_outputs` (object), `feedback_history` (object array), `critic_passes` (integer), and `status` (enum).
2. THE SharedContext `status` field SHALL be one of `pending`, `in_progress`, `approved`, or `error`.
3. WHEN an agent completes its task, THE System SHALL update the relevant SharedContext fields before invoking the next agent.
4. WHEN an agent encounters an error, THE System SHALL set `status` to `error` in the SharedContext and halt further agent invocations.

---

### Requirement 3: Orchestrator Agent

**User Story:** As a teacher, I want the system to automatically coordinate all agents in the correct order, so that I don't need to manage the pipeline manually.

#### Acceptance Criteria

1. WHEN the teacher submits input, THE Orchestrator SHALL read the teacher input, seed the SharedContext, and determine the agent invocation sequence.
2. THE Orchestrator SHALL respond with valid JSON only.
3. WHEN teacher feedback is submitted after pipeline completion, THE Orchestrator SHALL read `feedback_history` and invoke only the agent relevant to the feedback.
4. WHEN the Orchestrator receives a response from a downstream agent, THE Orchestrator SHALL pass the updated SharedContext to the next agent in the sequence.

---

### Requirement 4: Research Agent

**User Story:** As a teacher, I want my course content grounded in real, current sources, so that the material is credible and up to date.

#### Acceptance Criteria

1. WHEN invoked, THE Research_Agent SHALL use the MCP_Tool to search for academic sources relevant to the topic and audience across Google Scholar, PubMed, arXiv, and Semantic Scholar.
2. THE Research_Agent SHALL return between 4 and 8 source objects, each containing `url`, `title`, and `summary` fields.
3. THE Research_Agent SHALL prioritise peer-reviewed journals, government agencies, and reputable organisations published within the last 3 years.
4. THE Research_Agent SHALL respond with a JSON array of source objects only.
5. WHEN the Research_Agent completes, THE System SHALL populate `SharedContext.sources` with the returned source objects.

---

### Requirement 5: Content Agent

**User Story:** As a teacher, I want a structured, week-by-week lesson plan with slide outlines, so that I have a ready-to-use teaching framework.

#### Acceptance Criteria

1. WHEN invoked, THE Content_Agent SHALL read `SharedContext.sources` and `SharedContext.learning_objectives` to ground its output.
2. THE Content_Agent SHALL produce one section per week containing: an overview paragraph, 2 lecture titles with brief descriptions, 1 in-class activity, and a slide outline of 5–7 bullet points.
3. THE Content_Agent SHALL respond with structured markdown.
4. WHEN the Critic_Agent returns a revision request, THE Content_Agent SHALL revise its output according to the revision instructions and return an updated response.

---

### Requirement 6: Assessment Agent

**User Story:** As a teacher, I want a quiz bank aligned to my learning objectives, so that I can assess student understanding at multiple cognitive levels.

#### Acceptance Criteria

1. WHEN invoked, THE Assessment_Agent SHALL read `SharedContext.learning_objectives` to align all questions to stated objectives.
2. THE Assessment_Agent SHALL generate exactly 15 multiple-choice questions: 5 recall, 5 comprehension, and 5 application/analysis, each labelled with its Bloom's taxonomy level.
3. THE Assessment_Agent SHALL provide exactly 4 answer options per question with exactly one correct answer identified.
4. THE Assessment_Agent SHALL include a short-answer rubric.
5. THE Assessment_Agent SHALL respond with structured JSON.
6. WHEN learning objectives are absent, THE Assessment_Agent SHALL derive objectives from `SharedContext.topic` and proceed with generation.
7. WHEN the Critic_Agent returns a revision request, THE Assessment_Agent SHALL revise its output according to the revision instructions and return an updated response.

---

### Requirement 7: Parallel Agent Execution

**User Story:** As a teacher, I want the course generation to complete as quickly as possible, so that I can review results without unnecessary waiting.

#### Acceptance Criteria

1. WHEN the Research_Agent has completed and populated `SharedContext.sources`, THE System SHALL invoke the Content_Agent and Assessment_Agent concurrently.
2. THE System SHALL wait for both the Content_Agent and Assessment_Agent to complete before invoking the Critic_Agent.

---

### Requirement 8: Critic/Validator Agent

**User Story:** As a teacher, I want the system to self-check its outputs for accuracy and alignment, so that I receive a higher-quality course package without manual review of every detail.

#### Acceptance Criteria

1. WHEN invoked, THE Critic_Agent SHALL review Content_Agent and Assessment_Agent outputs for factual accuracy, alignment with `SharedContext.sources`, age-appropriateness for the specified audience, and alignment with `SharedContext.learning_objectives`.
2. WHEN the Critic_Agent identifies issues, THE Critic_Agent SHALL return structured revision requests to the relevant agent.
3. WHEN the Critic_Agent approves all outputs, THE Critic_Agent SHALL return `approved: true`.
4. THE System SHALL increment `SharedContext.critic_passes` by 1 after each Critic_Agent review cycle.
5. WHEN `SharedContext.critic_passes` reaches 2, THE Critic_Agent SHALL approve all outputs regardless of remaining issues and SHALL note any unresolved issues in its response.
6. THE System SHALL invoke the Formatter only after the Critic_Agent returns `approved: true`.

---

### Requirement 9: Formatter Agent

**User Story:** As a teacher, I want a clean, well-structured final document, so that I can read and share the course package easily.

#### Acceptance Criteria

1. WHEN invoked, THE Formatter SHALL assemble the lesson plan, quiz bank, reading list, and slide outlines from `SharedContext.prior_outputs` into a single course package.
2. THE Formatter SHALL output clean markdown with clear section headers.
3. THE Formatter SHALL only be invoked after the Critic_Agent has returned `approved: true`.

---

### Requirement 10: API Integration

**User Story:** As a developer, I want a consistent, error-handled API wrapper, so that all agents communicate with the Gemini API reliably.

#### Acceptance Criteria

1. THE System SHALL call the Gemini API endpoint `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` for all agent invocations.
2. THE System SHALL use model `gemini-2.5-pro` for all agent calls.
3. THE Research_Agent SHALL be configured with the academic MCP server tool to query Google Scholar, PubMed, arXiv, and Semantic Scholar.
4. THE System SHALL pass the SharedContext as JSON-stringified content in the user message for each agent call.
5. THE System SHALL handle multi-part API responses containing both text parts and function call parts.
6. WHEN an API call fails, THE System SHALL catch the error, mark the corresponding agent as `error` state in the UI, and halt the pipeline without invoking subsequent agents.

---

### Requirement 11: Teacher Feedback and Selective Re-invocation

**User Story:** As a teacher, I want to submit feedback on generated outputs and have only the relevant parts regenerated, so that I can refine the course without waiting for a full pipeline re-run.

#### Acceptance Criteria

1. WHEN the pipeline has completed, THE System SHALL enable the feedback input bar.
2. WHEN the teacher submits feedback, THE System SHALL append a feedback entry to `SharedContext.feedback_history` with `message`, `timestamp`, and `agent_invoked` fields.
3. WHEN feedback is submitted, THE Orchestrator SHALL route the feedback to either the Content_Agent or Assessment_Agent based on the feedback content.
4. WHEN a targeted agent completes its revision, THE System SHALL re-invoke the Critic_Agent followed by the Formatter.
5. WHILE the pipeline is running, THE System SHALL disable the feedback input bar.

---

### Requirement 12: Frontend Layout

**User Story:** As a teacher, I want a clear three-column interface, so that I can see my inputs, the agent pipeline status, and the generated outputs simultaneously.

#### Acceptance Criteria

1. THE System SHALL render a three-column layout: an input panel on the left, an agent pipeline panel in the centre, and an output panel on the right.
2. THE System SHALL display each agent as a card with a status indicator: gray dot for waiting, blinking green dot with animated progress bar for running, solid green dot with log lines for done, and red dot with error message for error.
3. THE System SHALL display output in tabs: Lesson (week-by-week), Sources (numbered reading list with URLs), Quiz (interactive MCQs with click-to-reveal answers), and Context (raw SharedContext JSON).
4. WHEN an agent transitions to a new state, THE System SHALL update the corresponding agent card immediately.

---

### Requirement 13: Error Handling and UI States

**User Story:** As a teacher, I want clear error feedback and recovery options, so that I can understand what went wrong and retry without losing my inputs.

#### Acceptance Criteria

1. WHEN an API call fails mid-pipeline, THE System SHALL mark the failing agent card as error state, stop the pipeline, and display a retry button.
2. WHEN the teacher clicks the retry button, THE System SHALL re-invoke the pipeline from the failed agent without requiring the teacher to re-enter inputs.
3. WHEN feedback is submitted while the pipeline is running, THE System SHALL reject the submission and keep the feedback input disabled until the pipeline completes.

---

### Requirement 14: Prompt Management

**User Story:** As a developer, I want agent prompts stored as separate files, so that prompts can be reviewed and updated independently of application logic.

#### Acceptance Criteria

1. THE System SHALL load each agent's system prompt from a dedicated file in the `prompts/` directory: `orchestrator.txt`, `research.txt`, `content.txt`, `assessment.txt`, `critic.txt`, and `formatter.txt`.
2. WHEN an agent is invoked, THE System SHALL read the corresponding prompt file and include it as the system message in the API call.
