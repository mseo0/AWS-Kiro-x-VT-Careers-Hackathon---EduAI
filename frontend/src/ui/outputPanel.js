/**
 * Renders the four output tabs: Lesson, Sources, Quiz, Context.
 */
export function renderOutputPanel(container, result) {
  const { course_package, shared_context } = result;

  container.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="lesson">Lesson</button>
      <button class="tab-btn" data-tab="sources">Sources</button>
      <button class="tab-btn" data-tab="quiz">Quiz</button>
      <button class="tab-btn" data-tab="context">Context</button>
    </div>
    <div class="tab-content" id="tab-lesson">${renderLesson(course_package)}</div>
    <div class="tab-content hidden" id="tab-sources">${renderSources(shared_context.sources)}</div>
    <div class="tab-content hidden" id="tab-quiz">${renderQuiz(shared_context.prior_outputs?.quiz_bank)}</div>
    <div class="tab-content hidden" id="tab-context"><pre>${JSON.stringify(shared_context, null, 2)}</pre></div>
  `;

  container.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      container.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
      btn.classList.add("active");
      container.querySelector(`#tab-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });
}

function renderLesson(markdown) {
  // Simple markdown-to-HTML: headings and paragraphs
  if (!markdown) return "<p>No lesson plan generated.</p>";
  return `<div class="markdown">${markdownToHtml(markdown)}</div>`;
}

function renderSources(sources) {
  if (!sources?.length) return "<p>No sources found.</p>";
  return `<ol>${sources.map((s, i) =>
    `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a><p>${s.summary}</p></li>`
  ).join("")}</ol>`;
}

function renderQuiz(quizBank) {
  if (!quizBank?.questions?.length) return "<p>No quiz generated.</p>";
  return quizBank.questions.map((q) => `
    <div class="quiz-question">
      <p><strong>Q${q.id}.</strong> [${q.bloom_level}] ${q.question}</p>
      <ul>${q.options.map((opt, i) => {
        const letter = ["A","B","C","D"][i];
        return `<li class="option" data-correct="${letter === q.correct}">${letter}. ${opt}</li>`;
      }).join("")}</ul>
      <button class="reveal-btn" onclick="this.previousElementSibling.querySelectorAll('[data-correct=true]').forEach(el=>el.classList.add('correct'))">Reveal Answer</button>
    </div>
  `).join("");
}

function markdownToHtml(md) {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul])(.+)$/gm, "<p>$1</p>");
}
