import { startGeneration, streamStatus, getResult, submitFeedback } from "./api.js";
import { createAgentCard, updateAgentCard } from "./ui/agentCard.js";
import { renderOutputPanel } from "./ui/outputPanel.js";
import { createFeedbackBar } from "./ui/feedbackBar.js";

const AGENTS = ["orchestrator", "research", "content", "assessment", "critic", "formatter"];

let currentJobId = null;
let agentCards = {};
let feedbackBar = null;

function init() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <header class="app-header"><h1>EduAI Course Builder</h1></header>
    <div class="layout">
      <aside class="panel input-panel" id="input-panel"></aside>
      <main class="panel pipeline-panel" id="pipeline-panel"></main>
      <section class="panel output-panel" id="output-panel"></section>
    </div>
  `;

  buildInputPanel(document.getElementById("input-panel"));
  buildPipelinePanel(document.getElementById("pipeline-panel"));
}

function buildInputPanel(container) {
  container.innerHTML = `
    <h2>Course Setup</h2>
    <form id="course-form">
      <label>Topic *
        <input id="topic" type="text" placeholder="e.g. Introduction to Machine Learning" required />
        <span class="validation-msg hidden" id="topic-error">Topic is required.</span>
      </label>
      <label>Audience
        <select id="audience">
          <option value="university">University</option>
          <option value="k12">K-12</option>
          <option value="corporate">Corporate</option>
        </select>
      </label>
      <label>Duration
        <input id="duration" type="text" placeholder="e.g. 8 weeks" value="8 weeks" />
      </label>
      <label>Tone
        <select id="tone">
          <option value="engaging">Engaging</option>
          <option value="formal">Formal</option>
          <option value="socratic">Socratic</option>
          <option value="concise">Concise</option>
        </select>
      </label>
      <label>Learning Objectives (one per line)
        <textarea id="objectives" rows="4" placeholder="Students will be able to..."></textarea>
        <span class="validation-msg hidden" id="objectives-warn">No objectives provided — the Assessment Agent will derive them from the topic.</span>
      </label>
      <label>Output Types
        <div id="output-types">
          <label><input type="checkbox" value="lesson" checked /> Lesson Plan</label>
          <label><input type="checkbox" value="quiz" checked /> Quiz Bank</label>
          <label><input type="checkbox" value="reading" checked /> Reading List</label>
          <label><input type="checkbox" value="slides" checked /> Slide Outlines</label>
        </div>
      </label>
      <button type="submit" id="run-btn" disabled>Run</button>
    </form>
  `;

  const topicInput = container.querySelector("#topic");
  const runBtn = container.querySelector("#run-btn");
  const topicError = container.querySelector("#topic-error");
  const objectivesInput = container.querySelector("#objectives");
  const objectivesWarn = container.querySelector("#objectives-warn");

  topicInput.addEventListener("input", () => {
    const empty = !topicInput.value.trim();
    runBtn.disabled = empty;
    topicError.classList.toggle("hidden", !empty);
  });

  objectivesInput.addEventListener("blur", () => {
    objectivesWarn.classList.toggle("hidden", !!objectivesInput.value.trim());
  });

  container.querySelector("#course-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!topicInput.value.trim()) return;

    const objectives = objectivesInput.value.trim()
      ? objectivesInput.value.trim().split("\n").map((s) => s.trim()).filter(Boolean)
      : [];

    const outputTypes = [...container.querySelectorAll("#output-types input:checked")].map((cb) => cb.value);

    const formData = {
      topic: topicInput.value.trim(),
      audience: container.querySelector("#audience").value,
      duration: container.querySelector("#duration").value,
      tone: container.querySelector("#tone").value,
      learning_objectives: objectives,
      outputs_requested: outputTypes,
    };

    await startPipeline(formData);
  });
}

function buildPipelinePanel(container) {
  container.innerHTML = "<h2>Agent Pipeline</h2>";
  agentCards = {};
  AGENTS.forEach((name) => {
    const card = createAgentCard(name);
    agentCards[name] = card;
    container.appendChild(card);

    // Wire retry button
    card.querySelector(".retry-btn").addEventListener("click", async () => {
      if (!currentJobId) return;
      resetCards();
      await submitFeedback(currentJobId, "", true);
      openStream(currentJobId);
    });
  });

  // Feedback bar
  feedbackBar = createFeedbackBar(async (text) => {
    if (!currentJobId) return;
    resetCards();
    await submitFeedback(currentJobId, text);
    openStream(currentJobId);
  });
  container.appendChild(feedbackBar);
}

function resetCards() {
  AGENTS.forEach((name) => {
    agentCards[name].className = "agent-card waiting";
    agentCards[name].querySelector(".agent-log").innerHTML = "";
    agentCards[name].querySelector(".retry-btn").classList.add("hidden");
  });
}

async function startPipeline(formData) {
  resetCards();
  feedbackBar.setEnabled(false);
  document.getElementById("output-panel").innerHTML = "<p>Generating...</p>";

  try {
    currentJobId = await startGeneration(formData);
    openStream(currentJobId);
  } catch (err) {
    document.getElementById("output-panel").innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function openStream(jobId) {
  const es = streamStatus(jobId, async (event) => {
    const card = agentCards[event.agent];
    if (card) updateAgentCard(card, event.status, event.message);

    if (event.agent === "formatter" && event.status === "done") {
      es.close();
      try {
        const result = await getResult(jobId);
        renderOutputPanel(document.getElementById("output-panel"), result);
        feedbackBar.setEnabled(true);
      } catch (err) {
        document.getElementById("output-panel").innerHTML = `<p class="error">${err.message}</p>`;
      }
    }

    if (event.status === "error") {
      es.close();
      feedbackBar.setEnabled(true);
    }
  });
}

init();
