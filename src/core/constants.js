export const REQUIRED_SECTIONS = [
  "Определение",
  "Основные подходы",
  "Ключевые работы",
  "Применения",
  "Ограничения",
  "Использованные источники"
];

export const REQUIRED_SECTION_HEADINGS = REQUIRED_SECTIONS.map(
  (section) => `## ${section}`
);

export const DEFAULT_TOPICS = [
  "Agentic AI for customer support",
  "Graph RAG for enterprise knowledge systems",
  "LLM evaluation and process-aware metrics",
  "Tool-using language models in scientific search",
  "Retrieval-augmented generation in medicine",
  "Planning and reflection in LLM agents",
  "Human-in-the-loop AI systems",
  "Knowledge graphs for procedural reasoning"
];

export const DEFAULT_OBJECTIVE =
  "Подготовить краткий научно-аналитический обзор с опорой на найденные источники.";

export const DEFAULT_OLLAMA_MODEL = "mistral";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export const DEFAULT_EXPERIMENT_OPTIONS = {
  maxSteps: 6,
  topK: 5,
  perPage: 8,
  relevanceThreshold: 0.18,
  maxTokens: 900
};

export const AGENT_SYSTEM_PROMPT = [
  "Ты научный ассистент и пишешь строго по найденным источникам.",
  "Не придумывай статьи и не добавляй источники, которых нет в переданных данных.",
  "Если информации недостаточно, прямо скажи об этом в соответствующем разделе.",
  "Ответ пиши на русском языке в Markdown и используй точные заголовки разделов.",
  REQUIRED_SECTION_HEADINGS.join("\n")
].join("\n");

export const QUERY_REWRITE_PROMPT = [
  "Переформулируй запрос для научного поиска.",
  "Верни только JSON вида:",
  '{"rewritten_query":"...","reason":"..."}'
].join("\n");

export const EVALUATOR_SYSTEM_PROMPT = [
  "Ты оцениваешь качество научно-аналитического обзора.",
  "Смотри только на данный ответ и предоставленные источники.",
  "Оценки ставь по шкале от 0 до 5.",
  "Верни только JSON без пояснений вне JSON."
].join("\n");
