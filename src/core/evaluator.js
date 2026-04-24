import { buildEvaluatorPrompt, buildRevisionPrompt } from "./prompts.js";
import {
  checkRequiredSections,
  safeJsonParse,
  tokenize,
  truncate
} from "./utils.js";

function clampScore(value) {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function overlapRatio(leftTokens = [], rightTokens = []) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  if (!left.size || !right.size) {
    return 0;
  }

  let matches = 0;
  for (const token of left) {
    if (right.has(token)) {
      matches += 1;
    }
  }
  return matches / left.size;
}

export function evaluateAnswerHeuristically({ topic, answer, notes }) {
  const coverage = checkRequiredSections(answer);
  const answerTokens = tokenize(answer);
  const topicTokens = tokenize(topic);
  const topicOverlap = overlapRatio(topicTokens, answerTokens);
  const noteOverlapScores = notes.map((note) =>
    overlapRatio(tokenize(`${note.title} ${note.abstract || ""}`), answerTokens)
  );
  const noteEvidenceRatio = notes.length
    ? noteOverlapScores.filter((score) => score >= 0.18).length / notes.length
    : 0;
  const answerLengthScore = Math.min(answerTokens.length / 180, 1);

  return {
    correctness: clampScore((topicOverlap * 3 + coverage.coverageRatio * 2) || 0),
    groundedness: clampScore(noteEvidenceRatio * 5),
    completeness: clampScore((coverage.coverageRatio * 3 + answerLengthScore * 2) || 0),
    coverage_of_required_fields: clampScore(coverage.coverageRatio * 5),
    source_consistency: clampScore(
      (noteEvidenceRatio * 3 + Math.min(notes.length, 5) / 5) * 2.5
    ),
    comment:
      coverage.missing.length > 0
        ? `Автоматическая эвристическая оценка. Отсутствуют разделы: ${coverage.missing.join(", ")}`
        : "Автоматическая эвристическая оценка без явных пропусков разделов.",
    missing_sections: coverage.missing
  };
}

export async function evaluateAnswer({ topic, answer, notes, llm, mode = "llm" }) {
  if (!answer || !String(answer).trim()) {
    return {
      correctness: 0,
      groundedness: 0,
      completeness: 0,
      coverage_of_required_fields: 0,
      source_consistency: 0,
      comment: "Ответ не был получен.",
      missing_sections: checkRequiredSections("").missing
    };
  }

  if (mode === "heuristic" || !llm) {
    return evaluateAnswerHeuristically({ topic, answer, notes });
  }

  const prompt = buildEvaluatorPrompt({ topic, answer, notes });
  try {
    const raw = await llm.generateEvaluation(prompt);
    const parsed = safeJsonParse(raw, {});
    const coverage = checkRequiredSections(answer);

    return {
      correctness: Number(parsed.correctness ?? 0),
      groundedness: Number(parsed.groundedness ?? 0),
      completeness: Number(parsed.completeness ?? 0),
      coverage_of_required_fields: Number(
        parsed.coverage_of_required_fields ?? Math.round(coverage.coverageRatio * 5)
      ),
      source_consistency: Number(parsed.source_consistency ?? 0),
      comment: parsed.comment || "",
      missing_sections: Array.isArray(parsed.missing_sections)
        ? parsed.missing_sections
        : coverage.missing
    };
  } catch (error) {
    const fallback = evaluateAnswerHeuristically({ topic, answer, notes });
    return {
      ...fallback,
      comment: `${fallback.comment} Fallback after evaluator error: ${truncate(error.message, 120)}`
    };
  }
}

export function computeRubricScore(evaluation) {
  const values = [
    evaluation.correctness,
    evaluation.groundedness,
    evaluation.completeness,
    evaluation.coverage_of_required_fields,
    evaluation.source_consistency
  ];
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

export async function reviseAnswer({ topic, answer, evaluation, notes, llm }) {
  const prompt = buildRevisionPrompt({ topic, answer, evaluation, notes });
  return llm.generateAnswer(prompt);
}
