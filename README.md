# Agentic AI Literature Assistant

Веб-приложение и backend API для научно-информационного поиска по заданной теме. Проект ищет общий контекст, находит публикации, отбирает релевантные источники и формирует структурированный обзор с trace выполнения.

## Возможности

- `baseline` режим для быстрого одношагового обзора
- `agent` режим с состоянием, инструментами и пошаговой траекторией
- `agent + evaluator` режим с дополнительной проверкой качества
- браузерный интерфейс для интерактивного использования
- серверный API для безопасного публичного доступа к агенту
- trace, метрики и CLI-скрипты для экспериментальных запусков

## Что возвращает агент

По теме исследования система строит краткий обзор в фиксированной структуре:

1. `Определение`
2. `Основные подходы`
3. `Ключевые работы`
4. `Применения`
5. `Ограничения`
6. `Использованные источники`

Для поиска и grounding используются:

- `Wikipedia API` для общего контекста
- `OpenAlex API` для публикаций и аннотаций
- `Crossref API` как дополнительный источник при уточнении поиска

## Архитектура

### Baseline

`baseline` делает короткий линейный проход:

1. ищет общий контекст;
2. берет компактный список публикаций;
3. сразу формирует итоговый обзор.

### Agent

`agent` использует состояние и планировочную логику:

1. собирает общий контекст;
2. ищет публикации;
3. при необходимости уточняет запрос;
4. отбирает наиболее релевантные источники;
5. извлекает notes;
6. строит финальный ответ.

### Agent + evaluator

Этот режим дополняет агентный цикл отдельной оценкой результата:

1. проверяет полноту и согласованность ответа;
2. при необходимости выполняет ревизию финального текста.

### Trace

Каждый запуск сохраняет детализированный trace:

- `stepId`
- `action`
- `payload`
- `summary`
- `durationMs`
- `sourceCount`
- `noteCount`
- `reasonNext`
- `status`

## Структура проекта

```text
.
├── app-config.js
├── data/topics.json
├── docs/
├── index.html
├── netlify.toml
├── railway.json
├── server/
├── src/core/
├── scripts/
├── styles.css
├── tests/
├── web/
└── results/
```

## Требования

- `Node.js 20+`
- локальный `Ollama` или любой OpenAI-compatible endpoint

Локально проект проверялся под `Node 24`.

## Быстрый старт

### 1. Запустить backend API

```bash
npm start
```

### 2. Запустить статический frontend

```bash
npm run serve
```

После этого открой `http://127.0.0.1:4173`.

## Локальная конфигурация модели

Пример для Ollama:

- `LLM_PROVIDER=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `OLLAMA_MODEL=qwen2.5:7b`

Пример для OpenAI-compatible API:

- `LLM_PROVIDER=openai`
- `OPENAI_BASE_URL=https://api.openai.com/v1`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4.1-mini`

Шаблон переменных лежит в [.env.example](/Users/maksi/Desktop/в итмо/deeplearning/.env.example).

## Использование через браузер

Frontend не хранит ключи модели в браузере. Страница отправляет запросы в backend API, адрес которого задается в [app-config.js](/Users/maksi/Desktop/в итмо/deeplearning/app-config.js).

По умолчанию локально используется:

```js
window.APP_CONFIG = {
  API_BASE_URL: ""
};
```

На локальной машине frontend автоматически подставляет `http://127.0.0.1:8787`, а в production нужно явно указать публичный URL backend-сервиса.

## HTTP API

Backend предоставляет следующие endpoints:

- `GET /api/health`
- `GET /api/config`
- `GET /api/topics`
- `POST /api/run`

Пример запроса:

```bash
curl -X POST http://127.0.0.1:8787/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Planning and reflection in LLM agents",
    "mode": "agent_evaluator",
    "topK": 5,
    "maxSteps": 6
  }'
```

## CLI-скрипты

Запуск одной темы:

```bash
npm run single -- --mode agent_evaluator --topic "Planning and reflection in LLM agents"
```

Smoke-test:

```bash
npm run smoke -- --mode agent_evaluator --topic "Planning and reflection in LLM agents"
```

Серия экспериментов:

```bash
npm run experiments
```

Построение графиков:

```bash
npm run charts -- --input results/<timestamp>/summary.json
```

Сборка markdown-отчета:

```bash
npm run report -- --input results/<timestamp>/records.json
```

## Публичный деплой

Рекомендуемая схема:

- `Railway` для backend API
- `Netlify` для frontend

Почему именно так:

- ключ модели хранится на сервере, а не в браузере
- backend можно держать постоянно доступным
- frontend остается простым статическим сайтом

Пошаговый гайд:

- [docs/deploy-netlify-railway.md](/Users/maksi/Desktop/в итмо/deeplearning/docs/deploy-netlify-railway.md)

## Запуск в production

### Railway

Проект уже содержит [railway.json](/Users/maksi/Desktop/в итмо/deeplearning/railway.json), поэтому backend можно подключить к Railway напрямую из GitHub.

### Netlify

Фронтенд публикуется как статический сайт без сборщика:

- Build command: пусто
- Publish directory: `.`

После получения Railway URL нужно обновить [app-config.js](/Users/maksi/Desktop/в итмо/deeplearning/app-config.js), чтобы frontend ходил в production backend.

## Тесты

```bash
npm test
```

Тестами покрыты базовые функции:

- восстановление abstract из inverted index
- разбор JSON evaluator
- проверка обязательных разделов
- дедупликация источников
- ранжирование релевантных работ

## Дополнительные материалы

- деплой-гайд: [docs/deploy-netlify-railway.md](/Users/maksi/Desktop/в итмо/deeplearning/docs/deploy-netlify-railway.md)
- шаблон отчетных материалов: [docs/lab-report-template.md](/Users/maksi/Desktop/в итмо/deeplearning/docs/lab-report-template.md)
