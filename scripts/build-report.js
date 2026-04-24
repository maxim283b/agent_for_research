import path from "node:path";
import {
  groupAverages,
  loadTopicsFromArgs,
  markdownTable,
  parseArgs,
  readJson,
  resolveRepoPath,
  writeText
} from "./common.js";

const args = parseArgs(process.argv.slice(2));
const resultsPath = args.input
  ? resolveRepoPath(args.input)
  : null;

if (!resultsPath) {
  console.error("Usage: npm run report -- --input results/<timestamp>/records.json");
  process.exit(1);
}

const records = await readJson(resultsPath);
const topics = await loadTopicsFromArgs(args).catch(() => []);

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

const weakestCases = [...records]
  .sort((left, right) => left.rubric - right.rubric)
  .slice(0, 3);

const reportMarkdown = [
  "# Черновик отчета по лабораторной работе 3",
  "",
  "## 1. Постановка задачи",
  "",
  "Цель работы — сравнить baseline, agent и agent+evaluator для задачи научно-информационного поиска и подготовки структурированного обзора темы.",
  "",
  "## 2. Используемая модель и инструменты",
  "",
  "- LLM-интерфейс: OpenAI-compatible или Ollama через единый абстрактный клиент.",
  "- Инструменты поиска: Wikipedia API, OpenAlex API, Crossref API.",
  "- Состояние агента: тема, цель, история шагов, найденные источники, заметки, итоговый ответ, статус завершения.",
  "- Trace: журнал шагов с payload, кратким итогом, количеством источников и причинной логикой перехода.",
  "",
  "## 3. Набор тем",
  "",
  topics.length ? topics.map((topic, index) => `${index + 1}. ${topic}`).join("\n") : "_Укажите темы из data/topics.json_",
  "",
  "## 4. Основное сравнение конфигураций",
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
  "## 5. Влияние числа источников",
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
  "## 6. Влияние ограничения по шагам",
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
  "## 7. Кандидаты на разбор неудачных кейсов",
  "",
  markdownTable(
    weakestCases.map((row) => ({
      topic: row.topic,
      group: row.experiment_group,
      variant: row.variant_label,
      rubric: row.rubric.toFixed(2),
      stop_reason: row.stop_reason
    }))
  ),
  "",
  "## 8. Интерпретация результатов",
  "",
  "- Сравните выигрыш в rubric score с ростом latency и числа шагов.",
  "- Отдельно прокомментируйте groundedness и coverage обязательных полей.",
  "- Для трех слабых кейсов откройте соответствующие trace-файлы и разберите, где именно потерялось качество.",
  "",
  "## 9. Итоговый вывод",
  "",
  "Сформулируйте, какая конфигурация оказалась лучшей и за счет чего: полноты, grounding, меньшего числа лишних шагов или устойчивости к ошибкам поиска."
].join("\n");

const outputPath = path.join(path.dirname(resultsPath), "lab-report-draft.md");
await writeText(outputPath, reportMarkdown);
console.log(`Saved report draft to ${outputPath}`);
