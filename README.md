# EduAI

A multi-agent AI application that generates complete, research-grounded course packages from teacher-provided inputs. Powered by Gemini and built with FastAPI + Vite.

---

![EduAI Screenshot 2](images/2.png)

---

## Features

- Multi-agent pipeline: Research → Content → Assessment → Critic → Formatter
- Parallel content and quiz generation
- Real-time agent status via Server-Sent Events
- PDF document upload to ground course content
- Teacher feedback loop with selective agent re-invocation
- Download full course package as a ZIP

## Setup

### Requirements

- Python 3.9+
- Node.js 18+
- A [Google AI Studio](https://aistudio.google.com/apikey) API key

### Install

```bash
# Backend
pip3 install -r backend/requirements.txt

# Frontend
cd frontend && npm install
```

### Configure

Copy `.env.example` to `.env` and add your key:

```
GOOGLE_API_KEY=your_key_here
```

### Run

```bash
./start.sh
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs

## Inspiration

Teachers spend hours assembling course materials from scratch - hunting for sources, writing lesson plans, drafting quizzes, and formatting everything into something usable. We wanted to see how far a coordinated pipeline of AI agents could go in compressing that work from hours to minutes, while keeping the teacher in control of the output.

## What it does

EduAI takes a teacher's input - topic, audience, duration, tone, learning objectives, and an optional PDF upload - and runs it through a multi-agent pipeline that produces a complete course package. That includes a week-by-week lesson plan, a 15-question quiz bank aligned to Bloom's taxonomy, a reading list of real academic sources, and slide outlines. The teacher can then submit feedback to refine specific outputs without re-running the full pipeline, and download everything as a ZIP.

## How we built it

The backend is a FastAPI app that orchestrates six specialised Gemini agents - Orchestrator, Research, Content, Assessment, Critic, and Formatter - connected through a shared context object passed between them. The Content and Assessment agents run concurrently via asyncio.gather. A Critic agent validates outputs and can trigger revision cycles, capped at two passes. Real-time status updates stream to the frontend via Server-Sent Events. The frontend is JS with Vite - no framework - rendering a three-column layout with agent status cards, tabbed output, and a feedback bar. We used Kiro's spec and task system to design and implement the entire application.

## Challenges we ran into

Getting the multi-agent pipeline to behave reliably was the main challenge. Gemini's thinking models added significant latency per call, and JSON parsing failures from malformed agent responses caused silent pipeline hangs that were hard to debug. Wiring SSE correctly so the frontend stayed in sync with background async tasks - especially across retries and feedback loops - also took careful handling. Python compatibility meant we couldn't use newer type hint syntax throughout.

## Accomplishments that we're proud of

A fully working multi-agent pipeline that goes from a blank topic field to a downloadable course package in a single run. The parallel Content and Assessment execution, the Critic revision loop, and the selective feedback re-invocation all work end-to-end. The property-based test suite covering 25 design properties across both backend and frontend gives us real confidence in the system's invariants.

## What we learned

Designing for agent coordination is fundamentally different from designing a single LLM call. Shared state management, error propagation across async tasks, and prompt engineering for structured JSON outputs each require deliberate design. We also learned that Kiro's spec-driven workflow - writing requirements, design, and tasks before touching code - made the implementation significantly more coherent than jumping straight in.

## What's next for EduAI

Export to Google Slides and SCORM packages for LMS integration
Support for multi-modal inputs - lecture recordings, images, existing slide decks
A student-facing mode that generates personalised practice quizzes from the same course package
Persistent job storage with a database so course packages survive server restarts
Streaming token output so teachers see content appear word-by-word rather than waiting for each agent to complete
