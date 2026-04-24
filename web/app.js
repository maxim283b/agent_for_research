import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_TOPICS,
  createLlmClient,
  runSingleMode
} from "../src/core/index.js";

const form = document.querySelector("#run-form");
const providerSelect = document.querySelector("#provider-select");
const apiKeyRow = document.querySelector("#api-key-row");
const topicChips = document.querySelector("#topic-chips");
const answerOutput = document.querySelector("#answer-output");
const sourcesOutput = document.querySelector("#sources-output");
const traceBody = document.querySelector("#trace-body");
const metrics = document.querySelector("#metrics");
const statusText = document.querySelector("#status-text");
const exportTraceButton = document.querySelector("#export-trace");

let lastResult = null;
let liveTrace = [];

function syncProviderUi() {
  const isOpenAi = providerSelect.value === "openai";
  apiKeyRow.classList.toggle("hidden", !isOpenAi);

  if (isOpenAi) {
    form.elements.baseUrl.value ||= "https://api.openai.com/v1";
    form.elements.model.value ||= "gpt-4.1-mini";
  } else {
    form.elements.baseUrl.value = DEFAULT_OLLAMA_BASE_URL;
    form.elements.model.value = DEFAULT_OLLAMA_MODEL;
  }
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

function renderTrace(trace) {
  traceBody.innerHTML = "";
  for (const step of trace) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${step.stepId}</td>
      <td>${step.action}</td>
      <td>${step.status}</td>
      <td>${step.summary || ""}</td>
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

function renderResult(result) {
  answerOutput.textContent = result.answer || "Ответ не был получен.";
  renderMetrics(result);
  renderSources(result.sources || []);
  renderTrace(result.trace || []);
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

providerSelect.addEventListener("change", syncProviderUi);
syncProviderUi();
renderTopicChips();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const topic = form.elements.topic.value.trim();
  if (!topic) {
    statusText.textContent = "Нужна тема для запуска.";
    return;
  }

  const provider = form.elements.provider.value;
  const baseUrl = form.elements.baseUrl.value.trim();
  const model = form.elements.model.value.trim();
  const apiKey = form.elements.apiKey.value.trim();
  const mode = form.elements.mode.value;
  const topK = Number(form.elements.topK.value || 5);
  const maxSteps = Number(form.elements.maxSteps.value || 6);

  if (provider === "openai" && !apiKey) {
    statusText.textContent = "Для OpenAI-compatible режима нужен API key.";
    return;
  }

  liveTrace = [];
  lastResult = null;
  exportTraceButton.disabled = true;
  answerOutput.textContent = "Выполняется запуск...";
  sourcesOutput.innerHTML = "";
  metrics.innerHTML = "";
  renderTrace([]);
  statusText.textContent = "Идет поиск, генерация и оценка результата...";

  try {
    const llm = createLlmClient({
      provider,
      baseUrl,
      model,
      apiKey
    });

    const result = await runSingleMode(topic, {
      mode,
      llm,
      topK,
      maxSteps,
      onStep(step) {
        liveTrace = [...liveTrace, step];
        renderTrace(liveTrace);
        statusText.textContent = `Шаг ${step.stepId + 1}: ${step.action}`;
      }
    });

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
