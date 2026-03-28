/**
 * Tests for AgentCard component.
 * Feature: eduai-course-builder
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createAgentCard, updateAgentCard } from "../src/ui/agentCard.js";

const STATUSES = ["waiting", "running", "done", "error"];

// Feature: eduai-course-builder, Property 23: Agent card reflects SSE event state
describe("AgentCard state", () => {
  it("reflects any valid status from SSE events", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUSES),
        fc.string({ minLength: 0, maxLength: 100 }),
        (status, message) => {
          const card = createAgentCard("research");
          updateAgentCard(card, status, message);
          expect(card.className).toContain(status);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: eduai-course-builder, Property 24: Error event shows error state and retry button
describe("AgentCard error state", () => {
  it("shows retry button on error status", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (message) => {
          const card = createAgentCard("content");
          updateAgentCard(card, "error", message);
          const retryBtn = card.querySelector(".retry-btn");
          expect(retryBtn).not.toBeNull();
          expect(retryBtn.classList.contains("hidden")).toBe(false);
          expect(card.className).toContain("error");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("hides retry button on non-error status", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("waiting", "running", "done"),
        (status) => {
          const card = createAgentCard("critic");
          updateAgentCard(card, status);
          const retryBtn = card.querySelector(".retry-btn");
          expect(retryBtn.classList.contains("hidden")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
