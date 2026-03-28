import asyncio
import json
import os
import logging
from datetime import datetime, timezone
from context import SharedContext, ContextStatus, FeedbackEntry
from agents import orchestrator, research, content, assessment, critic, formatter

logger = logging.getLogger(__name__)

# Fail fast if API key is missing
if not os.environ.get("GOOGLE_API_KEY"):
    raise RuntimeError("GOOGLE_API_KEY environment variable is not set.")


class PipelineError(Exception):
    pass


async def _emit(queue: asyncio.Queue, agent: str, status: str, message: str = "") -> None:
    logger.info(f"[{agent}] {status}: {message}")
    await queue.put({"agent": agent, "status": status, "message": message})


async def run_pipeline(ctx: SharedContext, queue: asyncio.Queue) -> SharedContext:
    """
    Full pipeline: Orchestrator → Research → (Content ∥ Assessment) → Critic loop → Formatter.
    Emits SSE-ready dicts to queue on each state change.
    """
    try:
        # Orchestrator — plans which agents to run
        await _emit(queue, "orchestrator", "running", "Planning pipeline...")
        plan = await orchestrator.run(ctx)
        parallel_agents = plan["parallel"]
        await _emit(queue, "orchestrator", "done", plan["message"])

        # Research — always runs
        await _emit(queue, "research", "running", "Searching academic sources...")
        await research.run(ctx)
        await _emit(queue, "research", "done", f"Found {len(ctx.sources)} sources.")

        # Run planned agents in parallel
        tasks = []
        for agent_name in parallel_agents:
            if agent_name == "content":
                await _emit(queue, "content", "running", "Generating lesson plan...")
                tasks.append(content.run(ctx))
            elif agent_name == "assessment":
                await _emit(queue, "assessment", "running", "Generating quiz bank...")
                tasks.append(assessment.run(ctx))

        if tasks:
            await asyncio.gather(*tasks)

        for agent_name in parallel_agents:
            if agent_name == "content":
                await _emit(queue, "content", "done", "Lesson plan complete.")
            elif agent_name == "assessment":
                await _emit(queue, "assessment", "done", "Quiz bank complete.")
        # Critic loop (max 2 passes)
        while True:
            await _emit(queue, "critic", "running", f"Reviewing outputs (pass {ctx.critic_passes + 1})...")
            result = await critic.run(ctx)
            if result.approved:
                await _emit(queue, "critic", "done", "Outputs approved.")
                break
            # Revision needed
            await _emit(queue, "critic", "done", f"Revision requested ({len(result.revision_requests)} issues).")
            revision_tasks = []
            for req in result.revision_requests:
                if req.agent == "content" and "content" in parallel_agents:
                    await _emit(queue, "content", "running", "Revising lesson plan...")
                    revision_tasks.append(content.run(ctx, revision=req.instructions))
                elif req.agent == "assessment" and "assessment" in parallel_agents:
                    await _emit(queue, "assessment", "running", "Revising quiz bank...")
                    revision_tasks.append(assessment.run(ctx, revision=req.instructions))
            if revision_tasks:
                await asyncio.gather(*revision_tasks)
            for req in result.revision_requests:
                if req.agent == "content" and "content" in parallel_agents:
                    await _emit(queue, "content", "done", "Lesson plan revised.")
                elif req.agent == "assessment" and "assessment" in parallel_agents:
                    await _emit(queue, "assessment", "done", "Quiz bank revised.")

        # Formatter
        await _emit(queue, "formatter", "running", "Assembling course package...")
        await formatter.run(ctx)
        ctx.status = ContextStatus.approved
        await _emit(queue, "formatter", "done", "Course package ready.")

    except Exception as exc:
        logger.error(f"Pipeline error in run_pipeline: {exc}", exc_info=True)
        ctx.status = ContextStatus.error
        await queue.put({"agent": "pipeline", "status": "error", "message": str(exc)})
        raise PipelineError(str(exc)) from exc

    return ctx


async def run_feedback_pipeline(
    ctx: SharedContext, feedback: str, queue: asyncio.Queue
) -> SharedContext:
    """
    Feedback pipeline: route via Orchestrator → targeted agent → Critic → Formatter.
    """
    try:
        # Append feedback entry
        await _emit(queue, "orchestrator", "running", "Routing feedback...")
        agent_name = await orchestrator.route_feedback(ctx, feedback)
        ctx.feedback_history.append(FeedbackEntry(
            message=feedback,
            timestamp=datetime.now(timezone.utc).isoformat(),
            agent_invoked=agent_name,
        ))
        await _emit(queue, "orchestrator", "done", f"Feedback routed to {agent_name}.")

        # Invoke targeted agent
        if agent_name == "content":
            await _emit(queue, "content", "running", "Revising lesson plan...")
            await content.run(ctx, revision=feedback)
            await _emit(queue, "content", "done", "Lesson plan revised.")
        else:
            await _emit(queue, "assessment", "running", "Revising quiz bank...")
            await assessment.run(ctx, revision=feedback)
            await _emit(queue, "assessment", "done", "Quiz bank revised.")

        # Critic
        await _emit(queue, "critic", "running", "Reviewing revised outputs...")
        result = await critic.run(ctx)
        await _emit(queue, "critic", "done", "Review complete.")

        if not result.approved:
            # One more revision attempt
            for req in result.revision_requests:
                if req.agent == "content":
                    await _emit(queue, "content", "running", "Applying critic revision...")
                    await content.run(ctx, revision=req.instructions)
                    await _emit(queue, "content", "done", "Revised.")
                elif req.agent == "assessment":
                    await _emit(queue, "assessment", "running", "Applying critic revision...")
                    await assessment.run(ctx, revision=req.instructions)
                    await _emit(queue, "assessment", "done", "Revised.")
            # Final critic pass
            await _emit(queue, "critic", "running", "Final review...")
            result = await critic.run(ctx)
            await _emit(queue, "critic", "done", "Final review complete.")

        # Formatter
        await _emit(queue, "formatter", "running", "Reassembling course package...")
        await formatter.run(ctx)
        ctx.status = ContextStatus.approved
        await _emit(queue, "formatter", "done", "Course package updated.")

    except Exception as exc:
        logger.error(f"Pipeline error in run_feedback_pipeline: {exc}", exc_info=True)
        ctx.status = ContextStatus.error
        await queue.put({"agent": "pipeline", "status": "error", "message": str(exc)})
        raise PipelineError(str(exc)) from exc

    return ctx
