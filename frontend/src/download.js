import JSZip from "jszip";

/**
 * Build and trigger a zip download containing all course outputs.
 * @param {object} result - the result object from GET /result/{job_id}
 */
export async function downloadCourseZip(result) {
  const { course_package, shared_context } = result;
  const topic = shared_context?.topic || "course";
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  const zip = new JSZip();
  const folder = zip.folder(slug);

  // Lesson plan
  const lesson = shared_context?.prior_outputs?.lesson_plan || course_package || "";
  if (lesson) folder.file("lesson-plan.md", lesson);

  // Sources as a readable text file
  const sources = shared_context?.sources || [];
  if (sources.length) {
    const sourcesText = sources
      .map((s, i) => `${i + 1}. ${s.title}\n   ${s.url}\n   ${s.summary}`)
      .join("\n\n");
    folder.file("reading-list.txt", `Reading List: ${topic}\n${"=".repeat(40)}\n\n${sourcesText}`);
  }

  // Quiz bank as JSON + readable txt
  const quiz = shared_context?.prior_outputs?.quiz_bank;
  if (quiz) {
    folder.file("quiz-bank.json", JSON.stringify(quiz, null, 2));

    if (quiz.questions?.length) {
      const quizTxt = quiz.questions.map((q) =>
        `Q${q.id}. [${q.bloom_level}] ${q.question}\n` +
        q.options.map((opt, i) => {
          const letter = ["A","B","C","D"][i];
          return `  ${letter}. ${opt}${letter === q.correct ? " ✓" : ""}`;
        }).join("\n")
      ).join("\n\n");
      folder.file("quiz-bank.txt", `Quiz Bank: ${topic}\n${"=".repeat(40)}\n\n${quizTxt}`);
    }
  }

  // Full course package markdown
  if (course_package) folder.file("course-package.md", course_package);

  // SharedContext JSON for reference
  folder.file("context.json", JSON.stringify(shared_context, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${slug}-course-package.zip`, "application/zip");
}

function triggerDownload(blob, filename, type) {
  const url = URL.createObjectURL(new Blob([blob], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
