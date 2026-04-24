import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLlmClient, formatNumber, slugify, toCsv } from "../src/core/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, "..");

export function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

export function resolveRepoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

export async function ensureDir(targetPath) {
  await mkdir(targetPath, { recursive: true });
}

export async function readJson(targetPath) {
  const content = await readFile(targetPath, "utf-8");
  return JSON.parse(content);
}

export async function writeJson(targetPath, payload) {
  await ensureDir(path.dirname(targetPath));
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export async function writeText(targetPath, content) {
  await ensureDir(path.dirname(targetPath));
  await writeFile(targetPath, content, "utf-8");
}

export function createClientFromArgs(args) {
  return createLlmClient({
    provider: args.provider,
    model: args.model,
    baseUrl: args["base-url"],
    apiKey: args["api-key"],
    temperature: args.temperature,
    maxTokens: args["max-tokens"]
  });
}

export function buildRunLabel({ experimentGroup, variantLabel, topic }) {
  return `${experimentGroup}__${variantLabel}__${slugify(topic)}`;
}

export async function loadTopicsFromArgs(args) {
  if (args.topic) {
    return [args.topic];
  }
  const filePath = resolveRepoPath(args.topics || "data/topics.json");
  return readJson(filePath);
}

export function summariseResult(result) {
  const evaluation = result.externalEvaluation || {};
  return {
    topic: result.topic,
    mode: result.mode,
    status: result.status,
    stopReason: result.stopReason,
    latencyMs: result.latencyMs,
    steps: result.nSteps,
    correctness: evaluation.correctness,
    groundedness: evaluation.groundedness,
    completeness: evaluation.completeness,
    coverage: evaluation.coverage_of_required_fields,
    rubric: formatNumber(result.rubric),
    toolErrors: result.toolErrors
  };
}

export function printResultSummary(result) {
  const summary = summariseResult(result);
  console.log(JSON.stringify(summary, null, 2));
}

export function groupAverages(records, groupKey) {
  const grouped = new Map();

  for (const record of records) {
    const key = record[groupKey];
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(record);
  }

  const metrics = [
    "correctness",
    "groundedness",
    "completeness",
    "coverage",
    "source_consistency",
    "rubric",
    "n_steps",
    "tool_errors",
    "redundant_steps",
    "latency_ms"
  ];

  return [...grouped.entries()].map(([key, items]) => {
    const row = { [groupKey]: key, runs: items.length };
    for (const metric of metrics) {
      row[metric] =
        items.reduce((sum, item) => sum + Number(item[metric] || 0), 0) / items.length;
    }
    return row;
  });
}

export function markdownTable(rows) {
  if (!rows.length) {
    return "_Нет данных_";
  }

  const columns = Object.keys(rows[0]);
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) =>
    `| ${columns.map((column) => String(row[column] ?? "")).join(" | ")} |`
  );

  return [header, separator, ...body].join("\n");
}

export function recordsToCsv(records) {
  return toCsv(records);
}
