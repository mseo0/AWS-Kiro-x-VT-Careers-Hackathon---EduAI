/**
 * Renders and updates a single agent status card.
 * States: waiting | running | done | error
 */
export function createAgentCard(agentName) {
  const card = document.createElement("div");
  card.className = "agent-card waiting";
  card.dataset.agent = agentName;

  const dot = document.createElement("span");
  dot.className = "status-dot";

  const label = document.createElement("span");
  label.className = "agent-label";
  label.textContent = agentName.charAt(0).toUpperCase() + agentName.slice(1);

  const progress = document.createElement("div");
  progress.className = "progress-bar";
  const progressInner = document.createElement("div");
  progressInner.className = "progress-inner";
  progress.appendChild(progressInner);

  const log = document.createElement("div");
  log.className = "agent-log";

  const retryBtn = document.createElement("button");
  retryBtn.className = "retry-btn hidden";
  retryBtn.textContent = "Retry";

  card.append(dot, label, progress, log, retryBtn);
  return card;
}

export function updateAgentCard(card, status, message = "") {
  card.className = `agent-card ${status}`;

  const log = card.querySelector(".agent-log");
  const retryBtn = card.querySelector(".retry-btn");
  const progress = card.querySelector(".progress-bar");

  if (message) {
    const line = document.createElement("div");
    line.textContent = message;
    log.appendChild(line);
  }

  retryBtn.classList.toggle("hidden", status !== "error");
  progress.classList.toggle("hidden", status !== "running");
}
