import path from "node:path";
import { runSingleMode } from "../src/core/index.js";
import {
  buildRunLabel,
  createClientFromArgs,
  ensureDir,
  groupAverages,
  loadTopicsFromArgs,
  markdownTable,
  parseArgs,
  recordsToCsv,
  resolveRepoPath,
  writeJson,
  writeText
} from "./common.js";

const args = parseArgs(process.argv.slice(2));
const llm = createClientFromArgs(args);
const topics = await loadTopicsFromArgs(args);
const now = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = resolveRepoPath("results", now);
const runDir = path.join(outputDir, "runs");
const traceDir = path.join(outputDir, "traces");

await ensureDir(runDir);
await ensureDir(traceDir);

const records = [];
const fullRuns = [];
const mainModes = ["baseline", "agent", "agent_evaluator"];

function buildBarChartSvg({ title, subtitle, labels, series, maxValue }) {
  const width = 980;
  const height = 520;
  const margin = { top: 88, right: 40, bottom: 96, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const groupWidth = plotWidth / Math.max(labels.length, 1);
  const colors = ["#b35c2e", "#3f6f8c", "#708238", "#7d4a9f"];

  const legend = series
    .map(
      (entry, index) =>
        `<g transform="translate(${margin.left + index * 180}, 42)">
          <rect width="14" height="14" rx="4" fill="${colors[index % colors.length]}" />
          <text x="22" y="12" font-size="14" fill="#39414f">${entry.name}</text>
        </g>`
    )
    .join("");

  const bars = labels
    .map((label, labelIndex) => {
      const innerBarWidth = Math.min(34, groupWidth / (series.length + 1));
      const offsetBase =
        margin.left +
        labelIndex * groupWidth +
        (groupWidth - innerBarWidth * series.length) / 2;

      const seriesBars = series
        .map((entry, seriesIndex) => {
          const value = Number(entry.values[labelIndex] || 0);
          const barHeight = maxValue ? (value / maxValue) * plotHeight : 0;
          const x = offsetBase + seriesIndex * innerBarWidth;
          const y = margin.top + plotHeight - barHeight;
          return `<g>
            <rect x="${x}" y="${y}" width="${innerBarWidth - 6}" height="${barHeight}" rx="10" fill="${colors[seriesIndex % colors.length]}" />
            <text x="${x + (innerBarWidth - 6) / 2}" y="${y - 8}" text-anchor="middle" font-size="12" fill="#39414f">${value.toFixed(2)}</text>
          </g>`;
        })
        .join("");

      return `${seriesBars}
        <text x="${margin.left + labelIndex * groupWidth + groupWidth / 2}" y="${height - 36}" text-anchor="middle" font-size="14" fill="#39414f">${label}</text>`;
    })
    .join("");

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const value = (maxValue / 4) * index;
    const y = margin.top + plotHeight - (plotHeight / 4) * index;
    return `<g>
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="rgba(57,65,79,0.15)" />
      <text x="${margin.left - 12}" y="${y + 4}" text-anchor="end" font-size="12" fill="#5a6472">${value.toFixed(1)}</text>
    </g>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f8f2e9" rx="24" />
  <text x="${margin.left}" y="30" font-size="30" font-family="Georgia, serif" fill="#1f2430">${title}</text>
  <text x="${margin.left}" y="62" font-size="15" fill="#5a6472">${subtitle}</text>
  ${legend}
  ${gridLines}
  ${bars}
</svg>`;
}

async function executeRun(experimentGroup, variantLabel, topic, options) {
  const result = await runSingleMode(topic, {
    ...options,
    llm
  });

  const label = buildRunLabel({ experimentGroup, variantLabel, topic });
  fullRuns.push({
    experimentGroup,
    variantLabel,
    ...result
  });

  records.push({
    experiment_group: experimentGroup,
    variant_label: variantLabel,
    topic,
    mode: result.mode,
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

  await writeJson(path.join(runDir, `${label}.json`), result);
  await writeJson(path.join(traceDir, `${label}.json`), result.trace);
  console.log(`[${experimentGroup}] ${variantLabel} :: ${topic}`);
}

for (const mode of mainModes) {
  for (const topic of topics) {
    await executeRun("main_comparison", mode, topic, {
      mode,
      topK: Number(args.topk || 5),
      perPage: Number(args["per-page"] || 8),
      maxSteps: Number(args["max-steps"] || 6),
      relevanceThreshold: Number(args["relevance-threshold"] || 0.08),
      fastEval: Boolean(args["fast-eval"])
    });
  }
}

if (!args["skip-sweeps"]) {
  for (const topK of [3, 5, 8]) {
    for (const topic of topics) {
      await executeRun("topk_sweep", `agent_topk_${topK}`, topic, {
        mode: "agent",
        topK,
        perPage: Math.max(8, topK + 2),
        maxSteps: Number(args["max-steps"] || 6),
        relevanceThreshold: Number(args["relevance-threshold"] || 0.08),
        fastEval: Boolean(args["fast-eval"])
      });
    }
  }

  for (const maxSteps of [4, 6, 8]) {
    for (const topic of topics) {
      await executeRun("step_sweep", `agent_steps_${maxSteps}`, topic, {
        mode: "agent",
        topK: Number(args.topk || 5),
        perPage: Number(args["per-page"] || 8),
        maxSteps,
        relevanceThreshold: Number(args["relevance-threshold"] || 0.08),
        fastEval: Boolean(args["fast-eval"])
      });
    }
  }
}

const mainSummary = groupAverages(
  records.filter((record) => record.experiment_group === "main_comparison"),
  "variant_label"
);
const topkSummary = groupAverages(
  records.filter((record) => record.experiment_group === "topk_sweep"),
  "variant_label"
);
const stepSummary = groupAverages(
  records.filter((record) => record.experiment_group === "step_sweep"),
  "variant_label"
);

const summary = {
  outputDir,
  totalRuns: records.length,
  topics,
  mainSummary,
  topkSummary,
  stepSummary
};

const qualitySvg = buildBarChartSvg({
  title: "Сравнение качества результатов",
  subtitle: "Correctness, groundedness, completeness и rubric по основным конфигурациям",
  labels: mainSummary.map((row) => row.variant_label),
  series: [
    { name: "Correctness", values: mainSummary.map((row) => row.correctness) },
    { name: "Groundedness", values: mainSummary.map((row) => row.groundedness) },
    { name: "Completeness", values: mainSummary.map((row) => row.completeness) },
    { name: "Rubric", values: mainSummary.map((row) => row.rubric) }
  ],
  maxValue: 5
});

const processSvg = buildBarChartSvg({
  title: "Сравнение процесса выполнения",
  subtitle: "Среднее число шагов и latency по основным конфигурациям",
  labels: mainSummary.map((row) => row.variant_label),
  series: [
    { name: "Steps", values: mainSummary.map((row) => row.n_steps) },
    { name: "Latency (sec)", values: mainSummary.map((row) => row.latency_ms / 1000) }
  ],
  maxValue: Math.max(
    ...mainSummary.map((row) => Math.max(row.n_steps, row.latency_ms / 1000)),
    1
  )
});

const worstCases = [...records]
  .sort((left, right) => left.rubric - right.rubric)
  .slice(0, 3);

const summaryMarkdown = [
  "# Experiment Summary",
  "",
  `Output directory: \`${outputDir}\``,
  "",
  "## Main Comparison",
  "",
  markdownTable(
    mainSummary.map((row) => ({
      mode: row.variant_label,
      runs: row.runs,
      correctness: row.correctness.toFixed(2),
      groundedness: row.groundedness.toFixed(2),
      completeness: row.completeness.toFixed(2),
      coverage: row.coverage.toFixed(2),
      rubric: row.rubric.toFixed(2),
      steps: row.n_steps.toFixed(2),
      latency_ms: row.latency_ms.toFixed(0)
    }))
  ),
  "",
  "## Top-K Sweep",
  "",
  markdownTable(
    topkSummary.map((row) => ({
      variant: row.variant_label,
      rubric: row.rubric.toFixed(2),
      steps: row.n_steps.toFixed(2),
      latency_ms: row.latency_ms.toFixed(0)
    }))
  ),
  "",
  "## Max-Steps Sweep",
  "",
  markdownTable(
    stepSummary.map((row) => ({
      variant: row.variant_label,
      rubric: row.rubric.toFixed(2),
      steps: row.n_steps.toFixed(2),
      latency_ms: row.latency_ms.toFixed(0)
    }))
  ),
  "",
  "## Candidate Failure Cases",
  "",
  markdownTable(
    worstCases.map((row) => ({
      topic: row.topic,
      experiment_group: row.experiment_group,
      variant: row.variant_label,
      rubric: row.rubric.toFixed(2),
      stop_reason: row.stop_reason
    }))
  )
].join("\n");

await writeJson(path.join(outputDir, "records.json"), records);
await writeJson(path.join(outputDir, "runs.json"), fullRuns);
await writeJson(path.join(outputDir, "summary.json"), summary);
await writeText(path.join(outputDir, "summary.csv"), recordsToCsv(records));
await writeText(path.join(outputDir, "summary.md"), summaryMarkdown);
await writeText(path.join(outputDir, "quality-comparison.svg"), qualitySvg);
await writeText(path.join(outputDir, "process-comparison.svg"), processSvg);

console.log(`Saved experiment bundle to ${outputDir}`);
