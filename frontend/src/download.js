import JSZip from "jszip";

export async function downloadCourseZip(result) {
  const { course_package, shared_context } = result;
  const topic = shared_context?.topic || "course";
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const sep = "=".repeat(60);

  const zip = new JSZip();
  const folder = zip.folder(slug);

  // Lesson plan
  const lesson = shared_context?.prior_outputs?.lesson_plan || "";
  if (lesson) {
    folder.file("lesson-plan.txt", `LESSON PLAN: ${topic.toUpperCase()}\n${sep}\n\n${lesson}`);
  }

  // Reading list
  const sources = shared_context?.sources || [];
  if (sources.length) {
    const lines = sources.map((s, i) =>
      `${i + 1}. ${s.title}\n   URL: ${s.url}\n   ${s.summary}`
    ).join("\n\n");
    folder.file("reading-list.txt", `READING LIST: ${topic.toUpperCase()}\n${sep}\n\n${lines}`);
  }

  // Quiz bank
  const quiz = shared_context?.prior_outputs?.quiz_bank;
  if (quiz?.questions?.length) {
    const lines = quiz.questions.map((q) => {
      const opts = q.options.map((opt, i) => {
        const letter = ["A", "B", "C", "D"][i];
        return `  ${letter}. ${opt}${letter === q.correct ? "  [CORRECT]" : ""}`;
      }).join("\n");
      return `Q${q.id}. [${q.bloom_level.toUpperCase()}]\n${q.question}\n${opts}`;
    }).join("\n\n");

    let rubricText = "";
    if (quiz.rubric) {
      const criteria = (quiz.rubric.criteria || []).map((c, i) => `  ${i + 1}. ${c}`).join("\n");
      rubricText = `\n\n${sep}\nRUBRIC\n${sep}\n${criteria}\n\nScoring: ${quiz.rubric.scoring || ""}`;
    }

    folder.file("quiz-bank.txt", `QUIZ BANK: ${topic.toUpperCase()}\n${sep}\n\n${lines}${rubricText}`);
  }

  // Full course package
  if (course_package) {
    folder.file("course-package.txt", course_package);
  }

  // Context summary
  const ctx = shared_context;
  const contextLines = [
    `COURSE CONTEXT`,
    sep,
    `Topic:      ${ctx.topic}`,
    `Audience:   ${ctx.audience}`,
    `Duration:   ${ctx.duration}`,
    `Tone:       ${ctx.tone}`,
    `Outputs:    ${(ctx.outputs_requested || []).join(", ")}`,
    ``,
    `LEARNING OBJECTIVES`,
    sep,
    ...(ctx.learning_objectives?.length
      ? ctx.learning_objectives.map((o, i) => `${i + 1}. ${o}`)
      : ["(none provided — derived from topic)"]),
  ].join("\n");
  folder.file("context.txt", contextLines);

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${slug}-course-package.zip`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
