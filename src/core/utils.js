import { REQUIRED_SECTIONS } from "./constants.js";

export function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function truncate(value = "", maxLength = 240) {
  const text = normalizeWhitespace(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

export function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function invertAbstract(invIdx) {
  if (!invIdx || typeof invIdx !== "object") {
    return "";
  }

  const pairs = [];
  for (const [token, positions] of Object.entries(invIdx)) {
    if (!Array.isArray(positions)) {
      continue;
    }
    for (const pos of positions) {
      pairs.push([pos, token]);
    }
  }

  pairs.sort((a, b) => a[0] - b[0]);
  return pairs.map(([, token]) => token).join(" ");
}

export function extractJsonObject(raw = "") {
  const text = String(raw);
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    const candidate = extractJsonObject(raw);
    if (!candidate) {
      return fallback;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      return fallback;
    }
  }
}

export function tokenize(value = "") {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-zA-Z0-9а-яА-ЯёЁ]+/)
    .filter((token) => token.length > 2);
}

export function uniqueBy(items, keyGetter) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyGetter(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function authorsToString(authorships = []) {
  return authorships
    .map((entry) => entry?.author?.display_name)
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
}

export function normalizeSource(source = {}) {
  const abstract =
    normalizeWhitespace(source.abstract) ||
    normalizeWhitespace(invertAbstract(source.abstract_inverted_index));

  return {
    id: source.id || source.DOI || source.doi || source.title || source.display_name,
    title: normalizeWhitespace(source.title || source.display_name || ""),
    year:
      source.year ||
      source.publication_year ||
      source.issued?.["date-parts"]?.[0]?.[0] ||
      "",
    abstract,
    authors:
      normalizeWhitespace(source.authors) ||
      authorsToString(source.authorships || source.author || []),
    doi: source.doi || source.DOI || "",
    url:
      source.url ||
      source.landing_page_url ||
      source.primary_location?.landing_page_url ||
      source.resource?.primary?.URL ||
      "",
    citations: source.cited_by_count || source["is-referenced-by-count"] || 0,
    venue:
      source.venue ||
      source.primary_location?.source?.display_name ||
      source["container-title"]?.[0] ||
      ""
  };
}

export function mergeSources(...groups) {
  return uniqueBy(
    groups.flat().map(normalizeSource).filter((source) => source.title),
    (source) =>
      (source.doi && source.doi.toLowerCase()) ||
      source.title.toLowerCase() ||
      source.id
  );
}

export function relevanceScore(topic, source) {
  const topicTokens = new Set(tokenize(topic));
  const bodyTokens = tokenize(`${source.title} ${source.abstract} ${source.venue}`);
  if (!topicTokens.size || !bodyTokens.length) {
    return 0;
  }

  let matches = 0;
  for (const token of bodyTokens) {
    if (topicTokens.has(token)) {
      matches += 1;
    }
  }

  const overlap = matches / topicTokens.size;
  const abstractBonus = source.abstract ? 0.08 : 0;
  const citationBonus = Math.min(Number(source.citations || 0) / 500, 0.12);
  return overlap + abstractBonus + citationBonus;
}

export function selectRelevantSources(topic, sources, limit = 5) {
  return [...sources]
    .map((source) => ({
      ...source,
      relevanceScore: relevanceScore(topic, source)
    }))
    .sort((left, right) => right.relevanceScore - left.relevanceScore)
    .slice(0, limit);
}

export function buildNotesFromSources(sources = []) {
  return sources.map((source, index) => ({
    index: index + 1,
    title: source.title,
    year: source.year,
    authors: source.authors,
    venue: source.venue,
    doi: source.doi,
    url: source.url,
    abstract: truncate(source.abstract, 1200)
  }));
}

export function checkRequiredSections(answer = "") {
  const present = REQUIRED_SECTIONS.filter((section) =>
    answer.includes(`## ${section}`)
  );
  const missing = REQUIRED_SECTIONS.filter((section) => !present.includes(section));
  return {
    present,
    missing,
    coverageRatio: REQUIRED_SECTIONS.length
      ? present.length / REQUIRED_SECTIONS.length
      : 0
  };
}

export function computeTraceMetrics(trace = []) {
  const toolErrors = trace.filter((step) => step.status === "error").length;
  const redundantSteps = trace.filter(
    (step) =>
      Number(step.deltaSources || 0) <= 0 &&
      Number(step.deltaNotes || 0) <= 0 &&
      /^search|^refine|^select/.test(step.action)
  ).length;

  return {
    nSteps: trace.length,
    toolErrors,
    redundantSteps
  };
}

export function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

export function formatNumber(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

export function toCsv(rows = []) {
  if (!rows.length) {
    return "";
  }

  const columns = uniqueBy(
    rows.flatMap((row) => Object.keys(row)).map((key) => ({ key })),
    (entry) => entry.key
  ).map((entry) => entry.key);

  const escape = (value) => {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((column) => escape(row[column])).join(","));
  return [header, ...lines].join("\n");
}
