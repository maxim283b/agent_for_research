import { createClientFromArgs, parseArgs, printResultSummary } from "./common.js";
import { runSingleMode } from "../src/core/index.js";

const args = parseArgs(process.argv.slice(2));
const llm = createClientFromArgs(args);

const result = await runSingleMode(
  args.topic || "Planning and reflection in LLM agents",
  {
    mode: args.mode || "agent",
    llm,
    topK: Number(args.topk || 4),
    perPage: Number(args["per-page"] || 6),
    maxSteps: Number(args["max-steps"] || 5)
  }
);

printResultSummary(result);
