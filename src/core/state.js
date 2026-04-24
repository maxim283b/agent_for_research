import { DEFAULT_EXPERIMENT_OPTIONS, DEFAULT_OBJECTIVE } from "./constants.js";
import { truncate } from "./utils.js";

export function createAgentState(topic, options = {}) {
  return {
    topic,
    objective: options.objective || DEFAULT_OBJECTIVE,
    mode: options.mode || "agent",
    stepId: 0,
    history: [],
    sources: [],
    notes: [],
    finalAnswer: "",
    status: "running",
    stopReason: "",
    artifacts: {
      wikiContext: "",
      evaluation: null,
      rewrittenQuery: ""
    },
    options: {
      ...DEFAULT_EXPERIMENT_OPTIONS,
      ...options
    }
  };
}

export function recordStep(state, step) {
  const entry = {
    stepId: state.stepId,
    timestamp: new Date().toISOString(),
    action: step.action,
    payload: step.payload || {},
    status: step.status || "ok",
    summary: truncate(step.summary || "", 300),
    durationMs: Math.round(step.durationMs || 0),
    reasonNext: step.reasonNext || "",
    sourceCount: state.sources.length,
    noteCount: state.notes.length,
    deltaSources: step.deltaSources || 0,
    deltaNotes: step.deltaNotes || 0
  };

  state.history.push(entry);
  state.stepId += 1;
  step.onStep?.(entry, state);
  return entry;
}

export function finalizeState(state, stopReason, finalStatus = "finished") {
  state.status = finalStatus;
  state.stopReason = stopReason;
  return state;
}
