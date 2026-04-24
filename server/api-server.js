import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_EXPERIMENT_OPTIONS,
  DEFAULT_TOPICS,
  createLlmClient,
  runSingleMode
} from "../src/core/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const port = Number(process.env.PORT || 8787);
const host =
  process.env.HOST ||
  (process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PUBLIC_DOMAIN
    ? "0.0.0.0"
    : "127.0.0.1");
const provider = process.env.LLM_PROVIDER || "openai";
const model =
  process.env.OPENAI_MODEL ||
  process.env.OLLAMA_MODEL ||
  process.env.LLM_MODEL ||
  "gpt-4.1-mini";
const baseUrl =
  process.env.OPENAI_BASE_URL ||
  process.env.OLLAMA_BASE_URL ||
  process.env.LLM_BASE_URL ||
  "https://api.openai.com/v1";
const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || "";
const allowOriginsRaw =
  process.env.ALLOWED_ORIGINS ||
  process.env.FRONTEND_ORIGIN ||
  process.env.URL ||
  "*";

const allowOrigins = allowOriginsRaw
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const llm = createLlmClient({
  provider,
  model,
  baseUrl,
  apiKey,
  temperature: process.env.LLM_TEMPERATURE,
  maxTokens: process.env.LLM_MAX_TOKENS || 450
});

function getCorsOrigin(requestOrigin) {
  if (allowOrigins.includes("*")) {
    return "*";
  }

  if (requestOrigin && allowOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowOrigins[0] || "*";
}

function sendJson(response, statusCode, payload, requestOrigin) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": getCorsOrigin(requestOrigin),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendNoContent(response, requestOrigin) {
  response.writeHead(204, {
    "access-control-allow-origin": getCorsOrigin(requestOrigin),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end();
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf-8");
  if (!body) {
    return {};
  }
  return JSON.parse(body);
}

function sanitizeConfig() {
  return {
    provider: llm.config.provider,
    model: llm.config.model,
    baseUrl: llm.config.baseUrl,
    defaultMode: "agent",
    maxSteps: DEFAULT_EXPERIMENT_OPTIONS.maxSteps,
    topK: DEFAULT_EXPERIMENT_OPTIONS.topK,
    fastEvalDefault: false
  };
}

function normalizeMode(mode) {
  return ["baseline", "agent", "agent_evaluator"].includes(mode)
    ? mode
    : "agent";
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const requestOrigin = request.headers.origin;

  if (request.method === "OPTIONS") {
    sendNoContent(response, requestOrigin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(
      response,
      200,
      {
        ok: true,
        service: "agentic-ai-literature-lab-api",
        timestamp: new Date().toISOString(),
        config: sanitizeConfig()
      },
      requestOrigin
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/topics") {
    sendJson(response, 200, { topics: DEFAULT_TOPICS }, requestOrigin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, 200, sanitizeConfig(), requestOrigin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/") {
    const html = await readFile(path.join(REPO_ROOT, "docs", "deployment-api.md"), "utf-8").catch(
      () => "Agent API is running."
    );
    response.writeHead(200, {
      "content-type": "text/plain; charset=utf-8"
    });
    response.end(html);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/run") {
    try {
      const body = await readBody(request);
      const topic = String(body.topic || "").trim();

      if (!topic) {
        sendJson(
          response,
          400,
          { ok: false, error: "Field 'topic' is required." },
          requestOrigin
        );
        return;
      }

      const result = await runSingleMode(topic, {
        mode: normalizeMode(body.mode),
        llm,
        topK: Number(body.topK || DEFAULT_EXPERIMENT_OPTIONS.topK),
        maxSteps: Number(body.maxSteps || DEFAULT_EXPERIMENT_OPTIONS.maxSteps),
        perPage: Number(body.perPage || DEFAULT_EXPERIMENT_OPTIONS.perPage),
        relevanceThreshold: Number(
          body.relevanceThreshold || DEFAULT_EXPERIMENT_OPTIONS.relevanceThreshold
        ),
        fastEval: Boolean(body.fastEval ?? false)
      });

      sendJson(response, 200, { ok: true, result }, requestOrigin);
    } catch (error) {
      sendJson(
        response,
        500,
        {
          ok: false,
          error: error.message || "Unknown server error"
        },
        requestOrigin
      );
    }
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found" }, requestOrigin);
});

server.listen(port, host, () => {
  console.log(
    `Agent API is available at http://${host}:${port} using ${llm.config.provider}:${llm.config.model}`
  );
});
