import { buildBaselinePrompt } from "./prompts.js";
import { createAgentState, finalizeState, recordStep } from "./state.js";
import { searchOpenAlex, searchWikipedia } from "./tools.js";
import { buildNotesFromSources, computeTraceMetrics, selectRelevantSources } from "./utils.js";

async function measure(action) {
  const startedAt = performance.now();
  const result = await action();
  return {
    result,
    durationMs: performance.now() - startedAt
  };
}

export async function runBaseline(topic, options) {
  const { llm, fetchFn = fetch, onStep } = options;
  const state = createAgentState(topic, { ...options, mode: "baseline" });

  try {
    try {
      const wikiMeasured = await measure(() => searchWikipedia(topic, fetchFn));
      state.artifacts.wikiContext = wikiMeasured.result.extract;
      recordStep(state, {
        action: "search_wikipedia",
        payload: { topic },
        summary: wikiMeasured.result.extract || "Wikipedia context not found",
        durationMs: wikiMeasured.durationMs,
        reasonNext: "Получен общий контекст для короткого one-shot ответа.",
        onStep
      });
    } catch (error) {
      recordStep(state, {
        action: "search_wikipedia",
        payload: { topic },
        summary: error.message,
        durationMs: 0,
        status: "error",
        reasonNext: "Продолжаем без Wikipedia-контекста.",
        onStep
      });
    }

    try {
      const searchMeasured = await measure(() =>
        searchOpenAlex(topic, Math.min(options.topK || 5, 5), fetchFn)
      );
      state.sources = selectRelevantSources(
        topic,
        searchMeasured.result,
        Math.min(options.topK || 5, 5)
      );
      recordStep(state, {
        action: "search_openalex_quick",
        payload: { topic, perPage: Math.min(options.topK || 5, 5) },
        summary: `Найдено публикаций: ${state.sources.length}`,
        durationMs: searchMeasured.durationMs,
        reasonNext: "Достаточно краткого набора работ для single-pass генерации.",
        deltaSources: state.sources.length,
        onStep
      });
    } catch (error) {
      recordStep(state, {
        action: "search_openalex_quick",
        payload: { topic, perPage: Math.min(options.topK || 5, 5) },
        summary: error.message,
        durationMs: 0,
        status: "error",
        reasonNext: "Продолжаем с пустым списком публикаций.",
        onStep
      });
    }

    const quickNotes = buildNotesFromSources(state.sources.slice(0, 3));
    const prompt = buildBaselinePrompt({
      topic,
      wikiContext: state.artifacts.wikiContext,
      quickSources: quickNotes
    });

    const answerMeasured = await measure(() => llm.generateAnswer(prompt));
    state.finalAnswer = answerMeasured.result;
    recordStep(state, {
      action: "generate_final_answer",
      payload: { topic, mode: "baseline" },
      summary: state.finalAnswer,
      durationMs: answerMeasured.durationMs,
      reasonNext: "Итоговый ответ baseline сформирован.",
      onStep
    });

    finalizeState(state, "final_answer_generated");
  } catch (error) {
    finalizeState(state, "baseline_failed", "error");
    recordStep(state, {
      action: "baseline_error",
      payload: { topic },
      summary: error.message,
      durationMs: 0,
      status: "error",
      reasonNext: "Выполнение baseline остановлено из-за ошибки.",
      onStep
    });
  }

  return {
    topic,
    mode: "baseline",
    answer: state.finalAnswer,
    sources: state.sources,
    notes: buildNotesFromSources(state.sources.slice(0, 3)),
    trace: state.history,
    status: state.status,
    stopReason: state.stopReason,
    ...computeTraceMetrics(state.history)
  };
}
