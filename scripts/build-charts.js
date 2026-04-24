import path from "node:path";
import { parseArgs, readJson, resolveRepoPath, writeText } from "./common.js";

const args = parseArgs(process.argv.slice(2));
const summaryPath = args.input ? resolveRepoPath(args.input) : null;

if (!summaryPath) {
  console.error("Usage: npm run charts -- --input results/<timestamp>/summary.json");
  process.exit(1);
}

const summary = await readJson(summaryPath);

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

const mainSummary = Array.isArray(summary.mainSummary) ? summary.mainSummary : [];
const labels = mainSummary.map((row) => row.variant_label);

const qualitySvg = buildBarChartSvg({
  title: "Сравнение качества результатов",
  subtitle: "Correctness, groundedness, completeness и rubric score по основным конфигурациям",
  labels,
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
  labels,
  series: [
    { name: "Steps", values: mainSummary.map((row) => row.n_steps) },
    { name: "Latency (sec)", values: mainSummary.map((row) => row.latency_ms / 1000) }
  ],
  maxValue: Math.max(
    ...mainSummary.map((row) => Math.max(row.n_steps, row.latency_ms / 1000)),
    1
  )
});

const outputDir = path.dirname(summaryPath);
await writeText(path.join(outputDir, "quality-comparison.svg"), qualitySvg);
await writeText(path.join(outputDir, "process-comparison.svg"), processSvg);
console.log(`Saved charts to ${outputDir}`);
