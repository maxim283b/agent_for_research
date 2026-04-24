import { buildAgentPrompt, buildQueryRewritePrompt } from "./prompts.js";
import { createAgentState, finalizeState, recordStep } from "./state.js";
import {
  collectNotes,
  mergeSearchResults,
  searchCrossref,
  searchOpenAlex,
  searchWikipedia
} from "./tools.js";
import { evaluateAnswer, reviseAnswer } from "./evaluator.js";
import {
  buildNotesFromSources,
  computeTraceMetrics,
  safeJsonParse,
  selectRelevantSources,
  truncate
} from "./utils.js";

async function measure(action) {
  const startedAt = performance.now();
  const result = await action();
  return {
    result,
    durationMs: performance.now() - startedAt
  };
}

function canContinue(state, maxSteps) {
  return state.stepId < maxSteps && state.status === "running";
}

function needsRefinement(topic, sources, topK, relevanceThreshold) {
  const relevant = selectRelevantSources(topic, sources, topK);
  if (relevant.length < Math.min(topK, 3)) {
    return true;
  }
  const averageScore =
    relevant.reduce((sum, source) => sum + Number(source.relevanceScore || 0), 0) /
    relevant.length;
  return averageScore < relevanceThreshold;
}

async function rewriteQuery(topic, wikiContext, sources, llm) {
  const prompt = buildQueryRewritePrompt({ topic, wikiContext, sources });
  const raw = await llm.generateAnswer(prompt, {
    temperature: 0
  });
  const parsed = safeJsonParse(raw, null);
  return {
    rewrittenQuery:
      parsed?.rewritten_query ||
      `${topic} scholarly review methods applications limitations`,
    reason: parsed?.reason || truncate(raw, 180)
  };
}

export async function runAgent(topic, options) {
  const {
    llm,
    fetchFn = fetch,
    onStep,
    maxSteps = 6,
    topK = 5,
    perPage = 8,
    relevanceThreshold = 0.18,
    useEvaluator = false,
    fastEval = false
  } = options;

  const state = createAgentState(topic, {
    ...options,
    mode: useEvaluator ? "agent_evaluator" : "agent"
  });

  try {
    if (canContinue(state, maxSteps)) {
      try {
        const wikiMeasured = await measure(() => searchWikipedia(topic, fetchFn));
        state.artifacts.wikiContext = wikiMeasured.result.extract;
        recordStep(state, {
          action: "search_wikipedia",
          payload: { topic },
          summary: wikiMeasured.result.extract || "Wikipedia context not found",
          durationMs: wikiMeasured.durationMs,
          reasonNext: "Получен общий контекст для последующего поиска публикаций.",
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
    }

    if (canContinue(state, maxSteps)) {
      try {
        const searchMeasured = await measure(() => searchOpenAlex(topic, perPage, fetchFn));
        state.sources = mergeSearchResults(searchMeasured.result);
        recordStep(state, {
          action: "search_openalex",
          payload: { query: topic, perPage },
          summary: `OpenAlex вернул ${searchMeasured.result.length} результатов.`,
          durationMs: searchMeasured.durationMs,
          reasonNext: "Нужно оценить полноту и релевантность найденных работ.",
          deltaSources: state.sources.length,
          onStep
        });
      } catch (error) {
        recordStep(state, {
          action: "search_openalex",
          payload: { query: topic, perPage },
          summary: error.message,
          durationMs: 0,
          status: "error",
          reasonNext: "Продолжаем, но набор источников пока пуст.",
          onStep
        });
      }
    }

    if (
      canContinue(state, maxSteps) &&
      needsRefinement(topic, state.sources, topK, relevanceThreshold)
    ) {
      try {
        const refinementMeasured = await measure(async () => {
          const rewritten = await rewriteQuery(
            topic,
            state.artifacts.wikiContext,
            state.sources,
            llm
          );
          const [moreOpenAlex, moreCrossref] = await Promise.all([
            searchOpenAlex(rewritten.rewrittenQuery, perPage, fetchFn),
            searchCrossref(rewritten.rewrittenQuery, Math.max(3, Math.floor(topK)), fetchFn)
          ]);
          return {
            rewritten,
            merged: mergeSearchResults(state.sources, moreOpenAlex, moreCrossref)
          };
        });

        const before = state.sources.length;
        state.sources = refinementMeasured.result.merged;
        state.artifacts.rewrittenQuery = refinementMeasured.result.rewritten.rewrittenQuery;
        recordStep(state, {
          action: "refine_and_search",
          payload: {
            previousQuery: topic,
            rewrittenQuery: refinementMeasured.result.rewritten.rewrittenQuery
          },
          summary: `После уточнения поиска собрано ${state.sources.length} уникальных источников.`,
          durationMs: refinementMeasured.durationMs,
          reasonNext: "Собран расширенный набор публикаций для отбора.",
          deltaSources: state.sources.length - before,
          onStep
        });
      } catch (error) {
        recordStep(state, {
          action: "refine_and_search",
          payload: { previousQuery: topic },
          summary: error.message,
          durationMs: 0,
          status: "error",
          reasonNext: "Продолжаем с уже собранными источниками.",
          onStep
        });
      }
    }

    if (canContinue(state, maxSteps)) {
      const beforeNotes = state.notes.length;
      state.sources = selectRelevantSources(topic, state.sources, topK);
      state.notes = collectNotes(state.sources, topK);
      recordStep(state, {
        action: "select_and_extract_notes",
        payload: { topK },
        summary: `Подготовлены заметки по ${state.notes.length} наиболее релевантным источникам.`,
        durationMs: 0,
        reasonNext: "Можно формировать итоговый структурированный обзор.",
        deltaNotes: state.notes.length - beforeNotes,
        onStep
      });
    }

    if (canContinue(state, maxSteps)) {
      const answerMeasured = await measure(() =>
        llm.generateAnswer(
          buildAgentPrompt({
            topic,
            wikiContext: state.artifacts.wikiContext,
            notes: state.notes
          })
        )
      );
      state.finalAnswer = answerMeasured.result;
      recordStep(state, {
        action: "generate_final_answer",
        payload: { topic, topK: state.notes.length },
        summary: state.finalAnswer,
        durationMs: answerMeasured.durationMs,
        reasonNext: useEvaluator
          ? "Нужно проверить качество ответа через evaluator."
          : "Итоговый ответ сформирован.",
        onStep
      });
    }

    if (useEvaluator && canContinue(state, maxSteps)) {
      const evaluationMeasured = await measure(() =>
        evaluateAnswer({
          topic,
          answer: state.finalAnswer,
          notes: state.notes,
          llm,
          mode: fastEval ? "heuristic" : "llm"
        })
      );
      state.artifacts.evaluation = evaluationMeasured.result;
      recordStep(state, {
        action: "evaluate_answer",
        payload: { topic },
        summary: JSON.stringify(evaluationMeasured.result),
        durationMs: evaluationMeasured.durationMs,
        reasonNext:
          evaluationMeasured.result.completeness < 4 ||
          evaluationMeasured.result.coverage_of_required_fields < 4
            ? "Нужна доработка ответа по замечаниям evaluator."
            : "Оценка достаточна, можно завершать.",
        onStep
      });

      if (
        canContinue(state, maxSteps) &&
        (evaluationMeasured.result.completeness < 4 ||
          evaluationMeasured.result.coverage_of_required_fields < 4)
      ) {
        const revisionMeasured = await measure(() =>
          reviseAnswer({
            topic,
            answer: state.finalAnswer,
            evaluation: evaluationMeasured.result,
            notes: state.notes,
            llm
          })
        );
        state.finalAnswer = revisionMeasured.result;
        recordStep(state, {
          action: "revise_final_answer",
          payload: { topic },
          summary: state.finalAnswer,
          durationMs: revisionMeasured.durationMs,
          reasonNext: "После ревизии ответ можно завершить.",
          onStep
        });
      }
    }

    if (state.finalAnswer) {
      finalizeState(state, "final_answer_generated");
    } else {
      finalizeState(state, "step_budget_exhausted", "partial");
    }
  } catch (error) {
    finalizeState(state, "agent_failed", "error");
    recordStep(state, {
      action: "agent_error",
      payload: { topic },
      summary: error.message,
      durationMs: 0,
      status: "error",
      reasonNext: "Выполнение агента остановлено из-за ошибки.",
      onStep
    });
  }

  return {
    topic,
    mode: useEvaluator ? "agent_evaluator" : "agent",
    answer: state.finalAnswer,
    sources: state.sources,
    notes: buildNotesFromSources(state.sources.slice(0, topK)),
    trace: state.history,
    status: state.status,
    stopReason: state.stopReason,
    internalEvaluation: state.artifacts.evaluation,
    rewrittenQuery: state.artifacts.rewrittenQuery,
    ...computeTraceMetrics(state.history)
  };
}
