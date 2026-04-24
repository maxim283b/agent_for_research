import {
  AGENT_SYSTEM_PROMPT,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  EVALUATOR_SYSTEM_PROMPT
} from "./constants.js";

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}${path}`;
}

function withTimeout(ms, init = {}) {
  return {
    ...init,
    signal: AbortSignal.timeout(ms)
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected non-JSON response: ${text.slice(0, 400)}`);
  }
}

export function getDefaultRuntimeConfig(overrides = {}) {
  const env = typeof process !== "undefined" ? process.env || {} : {};
  return {
    provider: overrides.provider || env.LLM_PROVIDER || "ollama",
    model:
      overrides.model ||
      env.OLLAMA_MODEL ||
      env.OPENAI_MODEL ||
      DEFAULT_OLLAMA_MODEL,
    baseUrl:
      overrides.baseUrl ||
      env.OLLAMA_BASE_URL ||
      env.OPENAI_BASE_URL ||
      DEFAULT_OLLAMA_BASE_URL,
    apiKey: overrides.apiKey || env.OPENAI_API_KEY || "",
    temperature: Number(overrides.temperature ?? env.LLM_TEMPERATURE ?? 0.2),
    maxTokens: Number(overrides.maxTokens ?? env.LLM_MAX_TOKENS ?? 900)
  };
}

export function createLlmClient(config = {}, fetchFn = fetch) {
  const runtime = getDefaultRuntimeConfig(config);

  async function callOllama({ systemPrompt, userPrompt, temperature }) {
    const response = await fetchFn(joinUrl(runtime.baseUrl, "/api/chat"), {
      ...withTimeout(90000),
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: runtime.model || DEFAULT_OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt || AGENT_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        options: {
          temperature: temperature ?? runtime.temperature,
          num_predict: runtime.maxTokens
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const json = await readJsonResponse(response);
    return json?.message?.content || "";
  }

  async function callOpenAiCompatible({ systemPrompt, userPrompt, temperature }) {
    const headers = {
      "content-type": "application/json"
    };
    if (runtime.apiKey) {
      headers.authorization = `Bearer ${runtime.apiKey}`;
    }

    const response = await fetchFn(joinUrl(runtime.baseUrl, "/chat/completions"), {
      ...withTimeout(90000),
      method: "POST",
      headers,
      body: JSON.stringify({
        model: runtime.model,
        temperature: temperature ?? runtime.temperature,
        max_tokens: runtime.maxTokens,
        messages: [
          { role: "system", content: systemPrompt || AGENT_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed with status ${response.status}`);
    }

    const json = await readJsonResponse(response);
    return json?.choices?.[0]?.message?.content || "";
  }

  async function generate(options) {
    if (runtime.provider === "openai") {
      return callOpenAiCompatible(options);
    }
    return callOllama(options);
  }

  return {
    config: runtime,
    async generateAnswer(userPrompt, options = {}) {
      return generate({
        systemPrompt: options.systemPrompt || AGENT_SYSTEM_PROMPT,
        userPrompt,
        temperature: options.temperature
      });
    },
    async generateEvaluation(userPrompt, options = {}) {
      return generate({
        systemPrompt: options.systemPrompt || EVALUATOR_SYSTEM_PROMPT,
        userPrompt,
        temperature: options.temperature ?? 0
      });
    }
  };
}
