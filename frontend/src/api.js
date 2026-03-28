const BASE = "http://localhost:8000";

export async function startGeneration(formData) {
  const res = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to start generation.");
  return (await res.json()).job_id;
}

export function streamStatus(jobId, onEvent) {
  const es = new EventSource(`${BASE}/stream/${jobId}`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch (_) {}
  };
  es.onerror = () => es.close();
  return es;
}

export async function getResult(jobId) {
  const res = await fetch(`${BASE}/result/${jobId}`);
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to get result.");
  return res.json();
}

export async function submitFeedback(jobId, text, retry = false) {
  const res = await fetch(`${BASE}/feedback/${jobId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, retry }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to submit feedback.");
  return res.json();
}
