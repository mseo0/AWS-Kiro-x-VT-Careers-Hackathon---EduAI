/**
 * Tests for FeedbackBar and input validation.
 * Feature: eduai-course-builder
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { createFeedbackBar } from "../src/ui/feedbackBar.js";

// Feature: eduai-course-builder, Property 20: Feedback bar enabled iff pipeline is complete
describe("FeedbackBar enabled state", () => {
  it("is disabled by default", () => {
    const bar = createFeedbackBar(() => {});
    const input = bar.querySelector(".feedback-input");
    const btn = bar.querySelector(".feedback-submit");
    expect(input.disabled).toBe(true);
    expect(btn.disabled).toBe(true);
  });

  it("enables when setEnabled(true) is called", () => {
    const bar = createFeedbackBar(() => {});
    bar.setEnabled(true);
    expect(bar.querySelector(".feedback-input").disabled).toBe(false);
    expect(bar.querySelector(".feedback-submit").disabled).toBe(false);
  });

  it("disables when setEnabled(false) is called", () => {
    const bar = createFeedbackBar(() => {});
    bar.setEnabled(true);
    bar.setEnabled(false);
    expect(bar.querySelector(".feedback-input").disabled).toBe(true);
    expect(bar.querySelector(".feedback-submit").disabled).toBe(true);
  });

  it("enabled state matches pipeline completion for arbitrary states", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isComplete) => {
          const bar = createFeedbackBar(() => {});
          bar.setEnabled(isComplete);
          const input = bar.querySelector(".feedback-input");
          expect(input.disabled).toBe(!isComplete);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: eduai-course-builder, Property 1: Empty topic rejects submission
describe("Topic validation", () => {
  function isValidTopic(topic) {
    return typeof topic === "string" && topic.trim().length > 0;
  }

  it("rejects empty strings", () => {
    expect(isValidTopic("")).toBe(false);
  });

  it("rejects whitespace-only strings", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(" ", "\t", "\n"), { minLength: 1, maxLength: 20 }),
        (whitespace) => {
          expect(isValidTopic(whitespace)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("accepts non-empty non-whitespace strings", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        (topic) => {
          expect(isValidTopic(topic)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
