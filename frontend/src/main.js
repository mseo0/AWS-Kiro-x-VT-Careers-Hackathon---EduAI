import { startGeneration, streamStatus, getResult, submitFeedback, cancelGeneration } from "./api.js";
import { createAgentCard, resetAgentCard, updateAgentCard } from "./ui/agentCard.js";
import { renderEmptyOutputPanel, renderOutputPanel, setActiveOutputTab } from "./ui/outputPanel.js";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

const AGENTS = ["orchestrator", "research", "content", "assessment", "critic", "formatter"];
const OUTPUT_ORDER = ["lesson", "quiz", "reading", "slides"];
const TONES = ["formal", "engaging", "socratic", "concise"];

let currentJobId = null;
let agentCards = {};
let activeTone = "engaging";
let extractedDocText = null;
let activeStream = null;

function init() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="logo">
          <span class="logo-dot"></span>
          <span>EduAI</span>
        </div>
        <div class="header-right">
          <span class="status-pill" id="global-status">IDLE</span>
        </div>
      </header>
      <div class="main-layout layout">
        <aside class="panel panel-left input-panel" id="input-panel"></aside>
        <main class="panel panel-center pipeline-panel" id="pipeline-panel"></main>
        <section class="panel panel-right output-panel" id="output-panel"></section>
      </div>
    </div>
  `;

  buildInputPanel(document.getElementById("input-panel"));
  buildPipelinePanel(document.getElementById("pipeline-panel"));
  renderEmptyOutputPanel(document.getElementById("output-panel"));
}

function buildInputPanel(container) {
  container.innerHTML = `
    <form id="course-form" class="course-form">
      <section>
        <div class="panel-label">Course Input</div>

        <label class="input-group">Topic
          <input id="topic" type="text" placeholder="e.g. Climate change & ecosystems" required />
          <span class="validation-msg hidden" id="topic-error">Topic is required.</span>
        </label>

        <label class="input-group">Audience
          <select id="audience">
            <option value="k12">K-12 students</option>
            <option value="university" selected>University students</option>
            <option value="corporate">Corporate learners</option>
          </select>
        </label>

        <label class="input-group">Duration
          <select id="duration">
            <option>1 week</option>
            <option selected>3 weeks</option>
            <option>6 weeks</option>
            <option>Full semester</option>
            <option value="custom">Custom...</option>
          </select>
          <input id="duration-custom" type="text" placeholder="e.g. 10 days" class="hidden" />
        </label>

        <label class="input-group">Learning objectives
          <textarea id="objectives" rows="4" placeholder="e.g. Understand carbon cycles, analyse policy responses, evaluate real-world case studies"></textarea>
          <span class="validation-msg subtle hidden" id="objectives-warn">No objectives provided, so EduAI will infer them from the topic.</span>
        </label>

        <div class="input-group">
          <span class="input-label">Upload document <span class="input-hint">(PDF — requirements, syllabus, notes)</span></span>
          <label class="upload-zone" id="upload-zone" for="pdf-upload">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v10M6 7l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span id="upload-label">Click or drag a PDF here</span>
            <input type="file" id="pdf-upload" accept=".pdf" class="visually-hidden" />
          </label>
          <div id="pdf-status" class="pdf-status hidden"></div>
        </div>
      </section>

      <section>
        <div class="panel-label">Outputs To Generate</div>
        <div class="tag-group" id="output-tags">
          ${OUTPUT_ORDER.map((value) => {
            const labels = {
              lesson: "Lesson plan",
              quiz: "Quiz + rubric",
              reading: "Reading list",
              slides: "Slide outline",
            };
            return `<button type="button" class="tag active" data-output="${value}">${labels[value]}</button>`;
          }).join("")}
        </div>
      </section>

      <section>
        <div class="panel-label">Tone</div>
        <div class="tag-group" id="tone-tags">
          ${TONES.map((tone) => `
            <button type="button" class="tag ${tone === activeTone ? "active" : ""}" data-tone="${tone}">
              ${tone.charAt(0).toUpperCase() + tone.slice(1)}
            </button>
          `).join("")}
          <button type="button" class="tag" data-tone="custom">Custom</button>
        </div>
        <label id="tone-custom-group" class="input-group hidden tone-custom-group">
          Custom tone
          <input id="tone-custom" type="text" placeholder="e.g. Humorous, Narrative..." />
        </label>
      </section>

      <div class="divider"></div>

      <div class="run-row">
        <button type="submit" id="run-btn" class="run-btn">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 2.5L13 8L3 13.5V2.5Z" fill="currentColor"></path>
          </svg>
          <span class="run-btn-label">Generate course package</span>
        </button>
        <button type="button" id="stop-btn" class="stop-btn hidden">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/>
          </svg>
          Stop
        </button>
      </div>
    </form>
  `;

  const topicInput = container.querySelector("#topic");
  const runBtn = container.querySelector("#run-btn");
  const topicError = container.querySelector("#topic-error");
  const objectivesInput = container.querySelector("#objectives");
  const objectivesWarn = container.querySelector("#objectives-warn");

  syncRunButton(runBtn, "");

  const stopBtn = container.querySelector("#stop-btn");
  stopBtn.addEventListener("click", async () => {
    if (!currentJobId) return;
    if (activeStream) { activeStream.close(); activeStream = null; }
    await cancelGeneration(currentJobId);
    setRunning(container, false);
    setGlobalStatus("IDLE");
  });

  topicInput.addEventListener("input", () => {
    const topic = topicInput.value.trim();
    syncRunButton(runBtn, topic);
    topicError.classList.toggle("hidden", !!topic);
  });

  const durationSelect = container.querySelector("#duration");
  const durationCustom = container.querySelector("#duration-custom");

  durationSelect.addEventListener("change", () => {
    const isCustom = durationSelect.value === "custom";
    durationCustom.classList.toggle("hidden", !isCustom);
    if (isCustom) durationCustom.focus();
  });

  objectivesInput.addEventListener("blur", () => {
    objectivesWarn.classList.toggle("hidden", !!objectivesInput.value.trim());
  });

  // PDF upload
  const pdfUpload = container.querySelector("#pdf-upload");
  const uploadZone = container.querySelector("#upload-zone");
  const uploadLabel = container.querySelector("#upload-label");
  const pdfStatus = container.querySelector("#pdf-status");

  async function handlePdfFile(file) {
    if (!file || file.type !== "application/pdf") return;
    uploadLabel.textContent = `Extracting "${file.name}"...`;
    pdfStatus.className = "pdf-status";
    pdfStatus.textContent = "";
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item) => item.str).join(" ") + "\n";
      }
      extractedDocText = text.trim();
      uploadLabel.textContent = `✓ ${file.name} (${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""})`;
      uploadZone.classList.add("upload-done");
      pdfStatus.className = "pdf-status pdf-status--ok";
      pdfStatus.textContent = `${extractedDocText.length.toLocaleString()} characters extracted`;
    } catch (err) {
      extractedDocText = null;
      uploadLabel.textContent = "Click or drag a PDF here";
      uploadZone.classList.remove("upload-done");
      pdfStatus.className = "pdf-status pdf-status--error";
      pdfStatus.textContent = `Failed to read PDF: ${err.message}`;
    }
  }

  pdfUpload.addEventListener("change", (e) => handlePdfFile(e.target.files[0]));

  uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("drag-over"); });
  uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
    handlePdfFile(e.dataTransfer.files[0]);
  });

  container.querySelectorAll("#output-tags .tag").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("active");
    });
  });

  container.querySelectorAll("#tone-tags .tag").forEach((button) => {
    button.addEventListener("click", () => {
      activeTone = button.dataset.tone;
      container.querySelectorAll("#tone-tags .tag").forEach((tag) => {
        tag.classList.toggle("active", tag === button);
      });
      const toneCustomGroup = container.querySelector("#tone-custom-group");
      const toneCustom = container.querySelector("#tone-custom");
      toneCustomGroup.classList.toggle("hidden", activeTone !== "custom");
      if (activeTone === "custom") toneCustom.focus();
    });
  });

  container.querySelector("#course-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const topic = topicInput.value.trim();
    if (!topic) {
      topicError.classList.remove("hidden");
      return;
    }

    const objectives = objectivesInput.value.trim()
      ? objectivesInput.value.trim().split("\n").flatMap((line) =>
          line.split(",").map((item) => item.trim()).filter(Boolean)
        )
      : [];

    const outputTypes = [...container.querySelectorAll("#output-tags .tag.active")]
      .map((button) => button.dataset.output);

    const durationVal = durationSelect.value === "custom"
      ? (durationCustom.value.trim() || "custom")
      : durationSelect.value;

    const toneCustomInput = container.querySelector("#tone-custom");
    const toneVal = activeTone === "custom"
      ? (toneCustomInput.value.trim() || "engaging")
      : activeTone;

    const formData = {
      topic,
      audience: container.querySelector("#audience").value,
      duration: durationVal,
      tone: toneVal,
      learning_objectives: objectives,
      outputs_requested: outputTypes.length ? outputTypes : OUTPUT_ORDER,
      document_context: extractedDocText || null,
    };

    await startPipeline(formData);
  });
}

function buildPipelinePanel(container) {
  container.innerHTML = `
    <div class="panel-label">Agent Pipeline</div>
    <div class="agents-grid" id="agents-grid"></div>
  `;

  const agentsGrid = container.querySelector("#agents-grid");
  agentCards = {};

  AGENTS.forEach((name) => {
    const card = createAgentCard(name);
    agentCards[name] = card;
    agentsGrid.appendChild(card);

    card.querySelector(".agent-header").addEventListener("click", () => {
      card.classList.toggle("expanded");
    });

    card.querySelector(".retry-btn").addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!currentJobId) return;
      preparePipelineRun("RUNNING");
      await submitFeedback(currentJobId, "", true);
      openStream(currentJobId);
    });
  });

}

function syncRunButton(button, topic) {
  button.disabled = !topic.trim();
}

function setRunning(inputContainer, running) {
  const runBtn = inputContainer.querySelector("#run-btn");
  const stopBtn = inputContainer.querySelector("#stop-btn");
  if (runBtn) runBtn.classList.toggle("hidden", running);
  if (stopBtn) stopBtn.classList.toggle("hidden", !running);
}

function preparePipelineRun(globalState) {
  AGENTS.forEach((name) => resetAgentCard(agentCards[name]));
  setGlobalStatus(globalState);
  renderEmptyOutputPanel(document.getElementById("output-panel"), { loading: true });
}

async function startPipeline(formData) {
  preparePipelineRun("RUNNING");
  setRunning(document.getElementById("input-panel"), true);

  try {
    currentJobId = await startGeneration(formData);
    openStream(currentJobId);
  } catch (error) {
    setRunning(document.getElementById("input-panel"), false);
    setGlobalStatus("ERROR");
    renderEmptyOutputPanel(document.getElementById("output-panel"), { error: error.message });
  }
}

function openStream(jobId) {
  activeStream = streamStatus(jobId, async (event) => {
    const card = agentCards[event.agent];
    if (card) {
      updateAgentCard(card, event.status, event.message);
    }

    if (event.agent === "formatter" && event.status === "done") {
      activeStream.close(); activeStream = null;
      setRunning(document.getElementById("input-panel"), false);
      try {
        const result = await getResult(jobId);
        renderOutputPanel(document.getElementById("output-panel"), result);
        setActiveOutputTab(document.getElementById("output-panel"), "lesson");
        setGlobalStatus("DONE");
      } catch (error) {
        setGlobalStatus("ERROR");
        renderEmptyOutputPanel(document.getElementById("output-panel"), { error: error.message });
      }
    }

    if (event.status === "error") {
      activeStream.close(); activeStream = null;
      setRunning(document.getElementById("input-panel"), false);
      setGlobalStatus("ERROR");
      renderEmptyOutputPanel(document.getElementById("output-panel"), { error: event.message || "Pipeline failed." });
    }
  });
}

function setGlobalStatus(label) {
  const status = document.getElementById("global-status");
  status.textContent = label;
  status.dataset.state = label.toLowerCase();
}

function showIntro() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="intro-page">
      <div class="intro-logo">
        <div class="intro-dot"></div>
        <div class="intro-logo-wordmark">EduAI</div>
        <p class="intro-tagline">AI-powered course builder — from topic to full curriculum in seconds.</p>
      </div>
      <button class="get-started-btn" id="get-started-btn">Get Started</button>
    </div>
  `;
  document.getElementById("get-started-btn").addEventListener("click", init);
}

showIntro();
