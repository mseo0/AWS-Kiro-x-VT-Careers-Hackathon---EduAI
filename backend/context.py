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
    timestamp: str  # ISO 8601
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


class RevisionRequest(BaseModel):
    agent: str  # "content" | "assessment"
    instructions: str


class CriticResult(BaseModel):
    approved: bool
    revision_requests: list[RevisionRequest] = []
    unresolved_issues: list[str] = []  # populated when passes == 2


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
    retry: bool = False


class ResultResponse(BaseModel):
    course_package: str
    shared_context: SharedContext


def seed_context(req: GenerateRequest) -> SharedContext:
    """Seed a SharedContext from a GenerateRequest."""
    return SharedContext(
        topic=req.topic,
        audience=req.audience,
        duration=req.duration,
        tone=req.tone,
        learning_objectives=req.learning_objectives,
        outputs_requested=req.outputs_requested,
        status=ContextStatus.in_progress,
    )
