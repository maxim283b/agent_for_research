const form = document.querySelector("#run-form");
const topicChips = document.querySelector("#topic-chips");
const answerOutput = document.querySelector("#answer-output");
const sourcesOutput = document.querySelector("#sources-output");
const traceBody = document.querySelector("#trace-body");
const metrics = document.querySelector("#metrics");
const statusText = document.querySelector("#status-text");
const exportTraceButton = document.querySelector("#export-trace");
const apiBaseUrlInput = document.querySelector("#api-base-url");

let lastResult = null;
const DEFAULT_TOPICS = [
  "Agentic AI for customer support",
  "Graph RAG for enterprise knowledge systems",
  "LLM evaluation and process-aware metrics",
  "Tool-using language models in scientific search",
  "Retrieval-augmented generation in medicine",
  "Planning and reflection in LLM agents",
  "Human-in-the-loop AI systems",
  "Knowledge graphs for procedural reasoning"
];

function getDefaultApiBaseUrl() {
  const runtimeConfig = window.APP_CONFIG || {};
  const saved = window.localStorage.getItem("agentApiBaseUrl");
  if (saved) {
    return saved;
  }
  if (runtimeConfig.API_BASE_URL) {
    return runtimeConfig.API_BASE_URL;
  }
  if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    return "http://127.0.0.1:8787";
  }
  return `${window.location.origin}`;
}

function normalizeApiBaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function renderTopicChips() {
  topicChips.innerHTML = "";
  for (const topic of DEFAULT_TOPICS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = topic;
    button.addEventListener("click", () => {
      form.elements.topic.value = topic;
    });
    topicChips.appendChild(button);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeInlineHtmlPreservingCode(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function stripMarkdownFence(text) {
  return String(text || "")
    .replace(/^```[a-zA-Z0-9_-]*\s*\n/, "")
    .replace(/\n```$/, "")
    .trim();
}

function renderMarkdown(text) {
  const normalized = stripMarkdownFence(text).replace(/\r\n/g, "\n");
  if (!normalized) {
    return "<p>Ответ не был получен.</p>";
  }

  const lines = normalized.split("\n");
  const html = [];
  let inCodeBlock = false;
  let codeLines = [];
  let paragraphLines = [];
  let listType = null;

  function flushParagraph() {
    if (!paragraphLines.length) {
      return;
    }
    html.push(`<p>${escapeInlineHtmlPreservingCode(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  }

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  }

  function flushCodeBlock() {
    if (!codeLines.length) {
      return;
    }
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      closeList();
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      closeList();
      html.push("<hr>");
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${escapeInlineHtmlPreservingCode(headingMatch[2])}</h${level}>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${escapeInlineHtmlPreservingCode(orderedMatch[1])}</li>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${escapeInlineHtmlPreservingCode(unorderedMatch[1])}</li>`);
      continue;
    }

    closeList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  closeList();
  if (inCodeBlock) {
    flushCodeBlock();
  }

  return html.join("");
}

function renderTrace(trace = []) {
  traceBody.innerHTML = "";
  for (const step of trace) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${step.stepId}</td>
      <td>${step.action}</td>
      <td>${step.status}</td>
      <td>${escapeHtml(step.summary || "")}</td>
      <td>${step.sourceCount}</td>
      <td>${step.noteCount}</td>
    `;
    traceBody.appendChild(row);
  }
}

function renderMetrics(result) {
  const evaluation = result.externalEvaluation || {};
  const cards = [
    ["Rubric", Number(result.rubric || 0).toFixed(2)],
    ["Correctness", evaluation.correctness ?? "0"],
    ["Groundedness", evaluation.groundedness ?? "0"],
    ["Completeness", evaluation.completeness ?? "0"],
    ["Steps", result.nSteps ?? "0"],
    ["Latency", `${Math.round(result.latencyMs || 0)} ms`]
  ];

  metrics.innerHTML = "";
  for (const [label, value] of cards) {
    const card = document.createElement("article");
    card.className = "metric-card";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    metrics.appendChild(card);
  }
}

function renderSources(sources) {
  sourcesOutput.innerHTML = "";

  if (!sources.length) {
    sourcesOutput.innerHTML = "<p class=\"hint\">Источники пока не найдены.</p>";
    return;
  }

  for (const source of sources) {
    const card = document.createElement("article");
    card.className = "source-card";
    card.innerHTML = `
      <h4>${source.title || "Без названия"}</h4>
      <p><strong>Год:</strong> ${source.year || "—"}</p>
      <p><strong>Авторы:</strong> ${source.authors || "—"}</p>
      <p><strong>Площадка:</strong> ${source.venue || "—"}</p>
      <p>${source.abstract || "Аннотация недоступна."}</p>
    `;
    sourcesOutput.appendChild(card);
  }
}

function getResultMessage(result) {
  if (result.answer && String(result.answer).trim()) {
    return result.answer;
  }

  const trace = Array.isArray(result.trace) ? result.trace : [];
  const lastErrorStep = [...trace].reverse().find((step) => step.status === "error");
  if (lastErrorStep?.summary) {
    return `Ответ не был получен.\n\nПричина: ${lastErrorStep.summary}`;
  }

  if (result.stopReason) {
    return `Ответ не был получен.\n\nПричина остановки: ${result.stopReason}`;
  }

  return "Ответ не был получен.";
}

function renderResult(result) {
  answerOutput.innerHTML = renderMarkdown(getResultMessage(result));
  renderMetrics(result);
  renderSources(result.sources || []);
  renderTrace(result.trace || []);
}

async function fetchTopics(apiBaseUrl) {
  try {
    const response = await fetch(`${apiBaseUrl}/api/topics`);
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    if (Array.isArray(payload.topics) && payload.topics.length) {
      DEFAULT_TOPICS.splice(0, DEFAULT_TOPICS.length, ...payload.topics);
      renderTopicChips();
    }
  } catch {
    // Keep local default topics when API is unreachable.
  }
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

apiBaseUrlInput.value = getDefaultApiBaseUrl();
renderTopicChips();
fetchTopics(normalizeApiBaseUrl(apiBaseUrlInput.value));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const topic = form.elements.topic.value.trim();
  if (!topic) {
    statusText.textContent = "Нужна тема для запуска.";
    return;
  }

  const apiBaseUrl = normalizeApiBaseUrl(form.elements.apiBaseUrl.value);
  const mode = form.elements.mode.value;
  const topK = Number(form.elements.topK.value || 5);
  const maxSteps = Number(form.elements.maxSteps.value || 6);
  const maxTokens = Number(form.elements.maxTokens.value || 1200);

  if (!apiBaseUrl) {
    statusText.textContent = "Нужен URL бэкенда агента.";
    return;
  }

  window.localStorage.setItem("agentApiBaseUrl", apiBaseUrl);
  lastResult = null;
  exportTraceButton.disabled = true;
  answerOutput.textContent = "Выполняется запуск...";
  sourcesOutput.innerHTML = "";
  metrics.innerHTML = "";
  renderTrace([]);
  statusText.textContent = "Идет вызов серверного агента...";

  try {
    const response = await fetch(`${apiBaseUrl}/api/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        topic,
        mode,
        topK,
        maxSteps,
        maxTokens
      })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Server request failed");
    }

    const result = payload.result;

    lastResult = result;
    exportTraceButton.disabled = false;
    renderResult(result);
    statusText.textContent = `Готово: ${result.mode}, ${result.nSteps} шагов, stop_reason=${result.stopReason}`;
  } catch (error) {
    answerOutput.textContent = error.message;
    statusText.textContent = "Запуск завершился ошибкой.";
  }
});

exportTraceButton.addEventListener("click", () => {
  if (!lastResult) {
    return;
  }
  downloadJson("trace.json", {
    topic: lastResult.topic,
    mode: lastResult.mode,
    trace: lastResult.trace,
    evaluation: lastResult.externalEvaluation
  });
});
