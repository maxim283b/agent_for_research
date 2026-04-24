import { DEFAULT_EXPERIMENT_OPTIONS } from "./constants.js";
import { runAgent } from "./agent.js";
import { runBaseline } from "./baseline.js";
import { computeRubricScore, evaluateAnswer } from "./evaluator.js";

export async function runSingleMode(topic, options) {
  const startedAt = Date.now();
  const config = {
    ...DEFAULT_EXPERIMENT_OPTIONS,
    ...options
  };

  const runner =
    config.mode === "baseline"
      ? runBaseline
      : runAgent;

  const result = await runner(topic, {
    ...config,
    useEvaluator: config.mode === "agent_evaluator"
  });

  const latencyMs = Date.now() - startedAt;
  const externalEvaluation = await evaluateAnswer({
    topic,
    answer: result.answer,
    notes: result.notes,
    llm: config.llm,
    mode: config.fastEval ? "heuristic" : "llm"
  });

  return {
    ...result,
    latencyMs,
    externalEvaluation,
    rubric: computeRubricScore(externalEvaluation)
  };
}

export async function runExperimentBatch(topics, modes, options) {
  const records = [];

  for (const mode of modes) {
    for (const topic of topics) {
      const result = await runSingleMode(topic, {
        ...options,
        mode
      });
      records.push({
        topic,
        mode,
        correctness: result.externalEvaluation.correctness,
        groundedness: result.externalEvaluation.groundedness,
        completeness: result.externalEvaluation.completeness,
        coverage: result.externalEvaluation.coverage_of_required_fields,
        source_consistency: result.externalEvaluation.source_consistency,
        rubric: result.rubric,
        n_steps: result.nSteps,
        tool_errors: result.toolErrors,
        redundant_steps: result.redundantSteps,
        latency_ms: result.latencyMs,
        stop_reason: result.stopReason
      });
    }
  }

  return records;
}
