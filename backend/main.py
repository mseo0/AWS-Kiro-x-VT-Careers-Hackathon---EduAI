import asyncio
import json
import uuid
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load .env BEFORE any module that checks GOOGLE_API_KEY
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from context import (
    GenerateRequest, GenerateResponse, FeedbackRequest,
    ResultResponse, seed_context, ContextStatus,
)
from pipeline import run_pipeline, run_feedback_pipeline

# In-memory job store: job_id -> {ctx, queue, task}
job_store: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Cancel any running tasks on shutdown
    for job in job_store.values():
        task = job.get("task")
        if task and not task.done():
            task.cancel()


app = FastAPI(title="EduAI Course Builder", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    if not req.topic or not req.topic.strip():
        raise HTTPException(status_code=422, detail="Topic is required.")

    job_id = str(uuid.uuid4())
    ctx = seed_context(req)
    queue: asyncio.Queue = asyncio.Queue()

    task = asyncio.create_task(run_pipeline(ctx, queue))
    job_store[job_id] = {"ctx": ctx, "queue": queue, "task": task}
    return GenerateResponse(job_id=job_id)


@app.get("/stream/{job_id}")
async def stream(job_id: str):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def event_generator():
        queue: asyncio.Queue = job["queue"]
        task: asyncio.Task = job["task"]
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("status") in ("done", "error") and event.get("agent") in ("formatter", "pipeline"):
                    break
            except asyncio.TimeoutError:
                if task.done():
                    break
                yield ": keep-alive\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/result/{job_id}", response_model=ResultResponse)
async def result(job_id: str):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    ctx = job["ctx"]
    if ctx.status not in (ContextStatus.approved, ContextStatus.error):
        raise HTTPException(status_code=202, detail="Pipeline still running.")
    return ResultResponse(
        course_package=ctx.prior_outputs.course_package or "",
        shared_context=ctx,
    )


@app.post("/cancel/{job_id}")
async def cancel(job_id: str):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    task: asyncio.Task = job["task"]
    if not task.done():
        task.cancel()
    job["ctx"].status = ContextStatus.error
    await job["queue"].put({"agent": "pipeline", "status": "error", "message": "Cancelled by user."})
    return {"status": "cancelled"}



async def feedback(job_id: str, req: FeedbackRequest):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    ctx = job["ctx"]

    if ctx.status == ContextStatus.in_progress:
        raise HTTPException(status_code=409, detail="Pipeline is still running.")

    if req.retry:
        # Re-run full pipeline from current context
        queue: asyncio.Queue = asyncio.Queue()
        ctx.status = ContextStatus.in_progress
        task = asyncio.create_task(run_pipeline(ctx, queue))
        job["queue"] = queue
        job["task"] = task
        return {"status": "retrying"}

    queue = asyncio.Queue()
    ctx.status = ContextStatus.in_progress
    task = asyncio.create_task(run_feedback_pipeline(ctx, req.message, queue))
    job["queue"] = queue
    job["task"] = task
    return {"status": "feedback_accepted"}
