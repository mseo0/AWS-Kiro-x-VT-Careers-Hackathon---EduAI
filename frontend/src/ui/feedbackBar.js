/**
 * Feedback bar — disabled while pipeline is running, enabled on completion.
 */
export function createFeedbackBar(onSubmit) {
  const bar = document.createElement("div");
  bar.className = "feedback-bar";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Submit feedback to revise specific outputs...";
  input.disabled = true;
  input.className = "feedback-input";

  const btn = document.createElement("button");
  btn.textContent = "Submit";
  btn.disabled = true;
  btn.className = "feedback-submit";

  btn.addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    setEnabled(false);
    onSubmit(text);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btn.click();
  });

  function setEnabled(enabled) {
    input.disabled = !enabled;
    btn.disabled = !enabled;
  }

  bar.append(input, btn);
  bar.setEnabled = setEnabled;
  return bar;
}
