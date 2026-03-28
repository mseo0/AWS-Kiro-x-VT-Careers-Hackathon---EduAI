const TAB_ORDER = ["lesson", "sources", "quiz", "context"];
import { downloadCourseZip } from "../download.js";

export function renderEmptyOutputPanel(container, state = {}) {
  const message = state.error || (state.loading ? "Generating your course package..." : "Run the pipeline to generate your course package.");
  const glyph = state.error ? "!" : state.loading ? "⋯" : "◎";

  // Determine which tabs to show based on selected outputs (or all by default)
  const outputs = state.outputs || ["lesson", "quiz", "reading"];
  const showLesson = outputs.includes("lesson");
  const showSources = outputs.includes("reading");
  const showQuiz = outputs.includes("quiz");
  const defaultTab = showLesson ? "lesson" : showSources ? "sources" : showQuiz ? "quiz" : "context";

  const visibleTabs = [
    showLesson && "lesson",
    showSources && "sources",
    showQuiz && "quiz",
    "context",
  ].filter(Boolean);

  container.innerHTML = `
    <div class="panel-label">Output</div>
    <div class="output-tab-row tabs">
      ${visibleTabs.map((tab) =>
        `<button class="output-tab tab-btn ${tab === defaultTab ? "active" : ""}" data-tab="${tab}">${tabLabel(tab)}</button>`
      ).join("")}
    </div>
    <div id="empty-state" class="empty-state ${state.error ? "error" : ""}">
      <div class="big">${glyph}</div>
      <div>${message}</div>
    </div>
  `;

  wireTabEvents(container);
}

export function renderOutputPanel(container, result) {
  const { course_package, shared_context } = result;
  const requested = new Set(shared_context?.outputs_requested || []);
  const lessonContent = shared_context?.prior_outputs?.lesson_plan || course_package;
  const quizBank = shared_context?.prior_outputs?.quiz_bank;
  const sources = shared_context?.sources || [];

  // Determine which tabs to show
  // "sources" shows if "reading" was requested (research always runs, but only show if requested)
  const showLesson = requested.has("lesson");
  const showSources = requested.has("reading");
  const showQuiz = requested.has("quiz");

  // Pick the first visible tab as default
  const defaultTab = showLesson ? "lesson" : showSources ? "sources" : showQuiz ? "quiz" : "context";

  const visibleTabs = [
    showLesson && "lesson",
    showSources && "sources",
    showQuiz && "quiz",
    "context",
  ].filter(Boolean);

  container.innerHTML = `
    <div class="output-header">
      <div class="panel-label">Output</div>
      <button class="download-btn" id="download-btn" title="Download course package as ZIP">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Download ZIP
      </button>
    </div>
    <div class="output-tab-row tabs">
      ${visibleTabs.map((tab) =>
        `<button class="output-tab tab-btn ${tab === defaultTab ? "active" : ""}" data-tab="${tab}">${tabLabel(tab)}</button>`
      ).join("")}
    </div>
    <div id="empty-state" class="empty-state hidden"></div>
    ${showLesson ? `
    <section class="output-block ${defaultTab === "lesson" ? "visible" : "hidden"} tab-content" id="tab-lesson" data-tab-panel="lesson">
      <div class="output-block-label">Lesson</div>
      <div class="output-content markdown">${renderLesson(lessonContent)}</div>
    </section>` : ""}
    ${showSources ? `
    <section class="output-block ${defaultTab === "sources" ? "visible" : "hidden"} tab-content" id="tab-sources" data-tab-panel="sources">
      <div class="output-block-label">Sources</div>
      <div class="output-content">${renderSources(sources)}</div>
    </section>` : ""}
    ${showQuiz ? `
    <section class="output-block ${defaultTab === "quiz" ? "visible" : "hidden"} tab-content" id="tab-quiz" data-tab-panel="quiz">
      <div class="output-block-label">Quiz</div>
      <div class="output-content">${renderQuiz(quizBank)}</div>
    </section>` : ""}
    <section class="output-block ${defaultTab === "context" ? "visible" : "hidden"} tab-content" id="tab-context" data-tab-panel="context">
      <div class="output-block-label">Context Obj</div>
      <div class="output-content">
        <pre>${escapeHtml(JSON.stringify(shared_context, null, 2))}</pre>
      </div>
    </section>
  `;

  wireTabEvents(container);

  container.querySelector("#download-btn").addEventListener("click", async () => {
    const btn = container.querySelector("#download-btn");
    btn.textContent = "Preparing...";
    btn.disabled = true;
    try {
      await downloadCourseZip(result);
    } finally {
      btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Download ZIP`;
      btn.disabled = false;
    }
  });
}

export function setActiveOutputTab(container, tab) {
  container.querySelectorAll(".tab-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  container.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    const active = panel.dataset.tabPanel === tab;
    panel.classList.toggle("hidden", !active);
    panel.classList.toggle("visible", active);
  });
}

function wireTabEvents(container) {
  container.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => setActiveOutputTab(container, button.dataset.tab));
  });
}

function hideAllPanels(container) {
  container.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.classList.add("hidden");
    panel.classList.remove("visible");
  });
}

function renderTabs(activeTab) {
  return TAB_ORDER.map((tab) =>
    `<button class="output-tab tab-btn ${tab === activeTab ? "active" : ""}" data-tab="${tab}">${tab === "sources" ? "Sources" : tabLabel(tab)}</button>`
  ).join("");
}

function tabLabel(tab) {
  return {
    lesson: "Lesson",
    sources: "Sources",
    quiz: "Quiz",
    context: "Context",
  }[tab];
}

function renderLesson(markdown) {
  if (!markdown) return "<p>No lesson plan generated yet.</p>";
  return markdownToHtml(markdown);
}

function renderSources(sources) {
  if (!sources.length) return "<p>No sources found.</p>";
  return sources.map((source, index) => `
    <div class="source-item">
      <div class="source-num">${index + 1}</div>
      <div>
        <div class="source-text"><a href="${source.url}" target="_blank" rel="noopener">${escapeHtml(source.title)}</a></div>
        <p>${escapeHtml(source.summary)}</p>
      </div>
    </div>
  `).join("");
}

function renderQuiz(quizBank) {
  if (!quizBank?.questions?.length) return "<p>No quiz generated.</p>";

  return quizBank.questions.map((question) => `
    <div class="quiz-question quiz-q">
      <div class="q-text"><strong>Q${question.id}.</strong> ${escapeHtml(question.question)}</div>
      ${question.options.map((option, index) => {
        const letter = ["A", "B", "C", "D"][index];
        const correct = letter === question.correct ? " correct" : "";
        return `<div class="quiz-option option${correct}">${letter}. ${escapeHtml(option)}</div>`;
      }).join("")}
    </div>
  `).join("");
}

function markdownToHtml(markdown) {
  const escaped = escapeHtml(markdown);
  return escaped
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h4>$1</h4>")
    .replace(/^# (.+)$/gm, "<h4>$1</h4>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^(?!<h4>|<ul>|<li>|<\/ul>|<p>|<\/p>)(.+)$/gm, "<p>$1</p>")
    .replace(/<\/ul>\s*<ul>/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
