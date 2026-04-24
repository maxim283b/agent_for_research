import test from "node:test";
import assert from "node:assert/strict";
import {
  checkRequiredSections,
  invertAbstract,
  mergeSources,
  safeJsonParse,
  selectRelevantSources
} from "../src/core/index.js";

test("invertAbstract rebuilds text from inverted index", () => {
  const value = invertAbstract({
    agents: [1],
    llm: [0],
    planning: [2]
  });
  assert.equal(value, "llm agents planning");
});

test("safeJsonParse extracts embedded json", () => {
  const parsed = safeJsonParse('prefix {"ok": true, "score": 4} suffix', {});
  assert.deepEqual(parsed, { ok: true, score: 4 });
});

test("checkRequiredSections reports missing headings", () => {
  const report = checkRequiredSections("## Определение\ntext\n## Ограничения");
  assert.equal(report.present.length, 2);
  assert.ok(report.missing.includes("Основные подходы"));
});

test("mergeSources removes duplicate titles", () => {
  const merged = mergeSources(
    [{ id: "1", title: "Paper A" }],
    [{ id: "2", title: "Paper A" }, { id: "3", title: "Paper B" }]
  );
  assert.equal(merged.length, 2);
});

test("selectRelevantSources ranks topic-matching papers first", () => {
  const sources = [
    { title: "Cooking recipes", abstract: "food and kitchen" },
    { title: "Planning and reflection in LLM agents", abstract: "llm agent planning" }
  ];
  const ranked = selectRelevantSources("Planning and reflection in LLM agents", sources, 1);
  assert.equal(ranked[0].title, "Planning and reflection in LLM agents");
});
