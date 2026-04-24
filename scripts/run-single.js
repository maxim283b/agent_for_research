import path from "node:path";
import { runSingleMode } from "../src/core/index.js";
import {
  buildRunLabel,
  createClientFromArgs,
  parseArgs,
  printResultSummary,
  resolveRepoPath,
  writeJson
} from "./common.js";

const args = parseArgs(process.argv.slice(2));

if (!args.topic) {
  console.error("Usage: npm run single -- --topic \"...\" [--mode baseline|agent|agent_evaluator]");
  process.exit(1);
}

const llm = createClientFromArgs(args);
const mode = args.mode || "agent";
const result = await runSingleMode(args.topic, {
  mode,
  llm,
  topK: Number(args.topk || 5),
  perPage: Number(args["per-page"] || 8),
  maxSteps: Number(args["max-steps"] || 6),
  relevanceThreshold: Number(args["relevance-threshold"] || 0.18)
});

printResultSummary(result);

if (args["save-json"] !== "false") {
  const label = buildRunLabel({
    experimentGroup: "single",
    variantLabel: mode,
    topic: args.topic
  });
  const targetPath = path.join(resolveRepoPath("results"), `${label}.json`);
  await writeJson(targetPath, result);
  console.log(`Saved result to ${targetPath}`);
}
