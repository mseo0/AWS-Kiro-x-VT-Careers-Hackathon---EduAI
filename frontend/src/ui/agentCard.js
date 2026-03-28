const AGENT_META = {
  orchestrator: {
    icon: "⬡",
    iconClass: "purple",
    title: "Orchestrator",
    description: "Dynamic task decomposition & routing",
    initial: "Initialising shared context object...",
  },
  research: {
    icon: "◎",
    iconClass: "teal",
    title: "Research agent",
    description: "Source gathering and grounding",
    initial: "Awaiting topic and objective inputs...",
  },
  content: {
    icon: "▣",
    iconClass: "teal",
    title: "Content agent",
    description: "Lesson narratives and slide structure",
    initial: "Waiting for research context...",
  },
  assessment: {
    icon: "◈",
    iconClass: "teal",
    title: "Assessment agent",
    description: "Objective-aligned quizzes and rubrics",
    initial: "Waiting for learning objectives...",
  },
  critic: {
    icon: "⬡",
    iconClass: "coral",
    title: "Critic / Validator",
    description: "Accuracy, alignment, and tone review",
    initial: "Waiting for draft outputs...",
  },
  formatter: {
    icon: "◫",
    iconClass: "blue",
    title: "Formatter",
    description: "Final package assembly",
    initial: "Waiting for critic approval...",
  },
};

export function createAgentCard(agentName) {
  const meta = AGENT_META[agentName];
  const card = document.createElement("article");
  card.className = "agent-card waiting expanded";
  card.dataset.agent = agentName;

  card.innerHTML = `
    <div class="agent-progress"><div class="agent-progress-bar"></div></div>
    <div class="agent-header">
      <div class="agent-icon ${meta.iconClass}">${meta.icon}</div>
      <div class="agent-meta">
        <div class="agent-name">${meta.title}</div>
        <div class="agent-desc">${meta.description}</div>
      </div>
      <div class="agent-status">
        <span class="status-dot waiting"></span>
        <span class="status-text">waiting</span>
      </div>
    </div>
    <div class="agent-body">
      <div class="agent-log"><div class="log-line info">${meta.initial}</div></div>
      <button class="retry-btn hidden" type="button">Retry Agent</button>
    </div>
  `;

  return card;
}

export function resetAgentCard(card) {
  const agentName = card?.dataset.agent;
  if (!card || !agentName) return;
  const meta = AGENT_META[agentName];

  card.className = "agent-card waiting expanded";
  card.querySelector(".status-dot").className = "status-dot waiting";
  card.querySelector(".status-text").textContent = "waiting";
  card.querySelector(".agent-log").innerHTML = `<div class="log-line info">${meta.initial}</div>`;
  card.querySelector(".retry-btn").classList.add("hidden");
  card.querySelector(".agent-progress-bar").style.width = "0%";
}

export function updateAgentCard(card, status, message = "") {
  if (!card) return;

  card.classList.remove("waiting", "running", "done", "error");
  card.classList.add(status);
  card.classList.add("expanded");

  const dot = card.querySelector(".status-dot");
  dot.className = `status-dot ${status}`;

  const statusText = card.querySelector(".status-text");
  statusText.textContent = status;

  const progressBar = card.querySelector(".agent-progress-bar");
  progressBar.style.width = status === "running" ? "72%" : status === "done" ? "100%" : "0%";

  if (message) {
    const logLine = document.createElement("div");
    logLine.className = `log-line ${classifyMessage(status, message)}`;
    logLine.textContent = message;
    card.querySelector(".agent-log").appendChild(logLine);
  }

  card.querySelector(".retry-btn").classList.toggle("hidden", status !== "error");
}

function classifyMessage(status, message) {
  if (status === "error") return "err";
  if (/approved|ready|complete|seeded|revised|found/i.test(message)) return "success";
  if (/revision|review/i.test(message)) return "warn";
  return "info";
}
