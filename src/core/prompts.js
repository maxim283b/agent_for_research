import { QUERY_REWRITE_PROMPT } from "./constants.js";

export function formatSourcesForPrompt(notes = []) {
  return JSON.stringify(notes, null, 2);
}

export function buildAnswerInstructions() {
  return [
    "Сформируй ответ на русском языке в Markdown.",
    "Используй ровно такие заголовки второго уровня:",
    "## Определение",
    "## Основные подходы",
    "## Ключевые работы",
    "## Применения",
    "## Ограничения",
    "## Использованные источники",
    "В разделе 'Ключевые работы' перечисли 3-5 публикаций.",
    "В разделе 'Использованные источники' перечисли только реально переданные источники.",
    "Не придумывай факты и явно отмечай, если данных недостаточно."
  ].join("\n");
}

export function buildBaselinePrompt({ topic, wikiContext, quickSources }) {
  return [
    `Тема: ${topic}`,
    "",
    "Краткий справочный контекст:",
    wikiContext || "Контекст Wikipedia не найден.",
    "",
    "Краткий список найденных публикаций:",
    quickSources.length ? formatSourcesForPrompt(quickSources) : "Публикации не найдены.",
    "",
    buildAnswerInstructions()
  ].join("\n");
}

export function buildAgentPrompt({ topic, wikiContext, notes }) {
  return [
    `Тема: ${topic}`,
    "",
    "Общий контекст:",
    wikiContext || "Контекст Wikipedia не найден.",
    "",
    "Найденные источники и заметки:",
    formatSourcesForPrompt(notes),
    "",
    buildAnswerInstructions(),
    "",
    "Для каждого утверждения старайся опираться на переданные заметки."
  ].join("\n");
}

export function buildEvaluatorPrompt({ topic, answer, notes }) {
  return [
    "Оцени ответ по шкале от 0 до 5 по критериям:",
    "1. correctness",
    "2. groundedness",
    "3. completeness",
    "4. coverage_of_required_fields",
    "5. source_consistency",
    "",
    "Верни только JSON вида:",
    '{"correctness":0,"groundedness":0,"completeness":0,"coverage_of_required_fields":0,"source_consistency":0,"comment":"","missing_sections":[]}',
    "",
    `Тема: ${topic}`,
    "",
    "Ответ:",
    answer,
    "",
    "Источники:",
    formatSourcesForPrompt(notes)
  ].join("\n");
}

export function buildRevisionPrompt({ topic, answer, evaluation, notes }) {
  return [
    `Тема: ${topic}`,
    "",
    "Исправь ответ, не придумывая новые источники.",
    "Улучши полноту и покрытие обязательных разделов.",
    `Комментарий evaluator: ${evaluation.comment || "без комментария"}`,
    `Отсутствующие разделы: ${(evaluation.missing_sections || []).join(", ") || "не указаны"}`,
    "",
    "Текущий ответ:",
    answer,
    "",
    "Источники:",
    formatSourcesForPrompt(notes),
    "",
    buildAnswerInstructions()
  ].join("\n");
}

export function buildQueryRewritePrompt({ topic, wikiContext, sources }) {
  return [
    QUERY_REWRITE_PROMPT,
    "",
    `Тема: ${topic}`,
    "Контекст:",
    wikiContext || "Контекст не найден.",
    "",
    "Что уже найдено:",
    formatSourcesForPrompt(
      sources.map((source) => ({
        title: source.title,
        year: source.year,
        venue: source.venue
      }))
    )
  ].join("\n");
}
