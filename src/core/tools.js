import {
  buildNotesFromSources,
  invertAbstract,
  mergeSources,
  normalizeSource,
  normalizeWhitespace
} from "./utils.js";

function withTimeout(ms, init = {}) {
  return {
    ...init,
    signal: AbortSignal.timeout(ms)
  };
}

export async function searchWikipedia(query, fetchFn = fetch) {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const searchResponse = await fetchFn(searchUrl, {
    ...withTimeout(12000),
    headers: {
      accept: "application/json"
    }
  });
  if (!searchResponse.ok) {
    throw new Error(`Wikipedia search failed with status ${searchResponse.status}`);
  }

  const searchJson = await searchResponse.json();
  const title = searchJson?.query?.search?.[0]?.title;
  if (!title) {
    return { title: "", extract: "" };
  }

  const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
  extractUrl.searchParams.set("action", "query");
  extractUrl.searchParams.set("prop", "extracts");
  extractUrl.searchParams.set("exintro", "1");
  extractUrl.searchParams.set("explaintext", "1");
  extractUrl.searchParams.set("titles", title);
  extractUrl.searchParams.set("format", "json");
  extractUrl.searchParams.set("origin", "*");

  const extractResponse = await fetchFn(extractUrl, {
    ...withTimeout(12000),
    headers: {
      accept: "application/json"
    }
  });
  if (!extractResponse.ok) {
    throw new Error(`Wikipedia extract failed with status ${extractResponse.status}`);
  }

  const extractJson = await extractResponse.json();
  const pages = extractJson?.query?.pages || {};
  const page = Object.values(pages)[0];

  return {
    title,
    extract: normalizeWhitespace(page?.extract || "")
  };
}

export async function searchOpenAlex(query, perPage = 8, fetchFn = fetch) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set(
    "select",
    [
      "id",
      "display_name",
      "publication_year",
      "publication_date",
      "abstract_inverted_index",
      "authorships",
      "primary_location",
      "doi",
      "cited_by_count"
    ].join(",")
  );

  const response = await fetchFn(url, {
    ...withTimeout(15000),
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`OpenAlex failed with status ${response.status}`);
  }

  const json = await response.json();
  return (json?.results || []).map((item) =>
    normalizeSource({
      ...item,
      abstract: invertAbstract(item.abstract_inverted_index)
    })
  );
}

export async function searchCrossref(query, rows = 5, fetchFn = fetch) {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.title", query);
  url.searchParams.set("rows", String(rows));

  const response = await fetchFn(url, {
    ...withTimeout(15000),
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Crossref failed with status ${response.status}`);
  }

  const json = await response.json();
  return (json?.message?.items || []).map((item) =>
    normalizeSource({
      ...item,
      title: item.title?.[0] || "",
      authors:
        item.author
          ?.map((author) => [author.given, author.family].filter(Boolean).join(" "))
          .join(", ") || ""
    })
  );
}

export function collectNotes(sources, limit = 5) {
  return buildNotesFromSources(sources.slice(0, limit));
}

export function mergeSearchResults(...groups) {
  return mergeSources(...groups);
}
