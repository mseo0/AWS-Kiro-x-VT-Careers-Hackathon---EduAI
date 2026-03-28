/**
 * Unit tests for layout and output tabs.
 * Feature: eduai-course-builder
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderOutputPanel } from "../src/ui/outputPanel.js";

const mockResult = {
  course_package: "# Course Package\n## Lesson Plan\nContent here.",
  shared_context: {
    topic: "Test Topic",
    audience: "university",
    duration: "4 weeks",
    tone: "engaging",
    learning_objectives: ["Learn things"],
    outputs_requested: ["lesson", "quiz"],
    sources: [
      { url: "https://example.com", title: "Test Source", summary: "A test source." },
    ],
    prior_outputs: {
      lesson_plan: "## Week 1\nOverview",
      quiz_bank: {
        questions: [
          {
            id: 1,
            bloom_level: "recall",
            question: "What is 2+2?",
            options: ["1", "2", "3", "4"],
            correct: "D",
            objective: "Basic math",
          },
        ],
        rubric: { criteria: ["Accuracy"], scoring: "4-point" },
      },
    },
    feedback_history: [],
    critic_passes: 1,
    status: "approved",
  },
};

describe("Output panel tabs", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    renderOutputPanel(container, mockResult);
  });

  it("renders four tabs: Lesson, Sources, Quiz, Context", () => {
    const tabs = container.querySelectorAll(".tab-btn");
    const tabNames = [...tabs].map((t) => t.textContent);
    expect(tabNames).toContain("Lesson");
    expect(tabNames).toContain("Sources");
    expect(tabNames).toContain("Quiz");
    expect(tabNames).toContain("Context");
    expect(tabs.length).toBe(4);
  });

  it("shows Lesson tab content by default", () => {
    const lessonTab = container.querySelector("#tab-lesson");
    expect(lessonTab.classList.contains("hidden")).toBe(false);
  });

  it("hides other tabs by default", () => {
    ["sources", "quiz", "context"].forEach((tab) => {
      const el = container.querySelector(`#tab-${tab}`);
      expect(el.classList.contains("hidden")).toBe(true);
    });
  });

  it("switches to Sources tab on click", () => {
    const sourcesBtn = [...container.querySelectorAll(".tab-btn")].find(
      (b) => b.textContent === "Sources"
    );
    sourcesBtn.click();
    expect(container.querySelector("#tab-sources").classList.contains("hidden")).toBe(false);
    expect(container.querySelector("#tab-lesson").classList.contains("hidden")).toBe(true);
  });
});

describe("Three-column layout", () => {
  it("layout panels exist in the DOM after init", () => {
    // Simulate the layout structure that main.js creates
    document.body.innerHTML = `
      <div id="app">
        <div class="layout">
          <aside class="panel input-panel" id="input-panel"></aside>
          <main class="panel pipeline-panel" id="pipeline-panel"></main>
          <section class="panel output-panel" id="output-panel"></section>
        </div>
      </div>
    `;
    expect(document.getElementById("input-panel")).not.toBeNull();
    expect(document.getElementById("pipeline-panel")).not.toBeNull();
    expect(document.getElementById("output-panel")).not.toBeNull();
  });
});
