# Agentic AI Literature Lab

Проект для лабораторной работы по агентному искусственному интеллекту. Репозиторий реализует:

- `baseline` режим для одношагового формирования обзора;
- `agent` режим с состоянием, инструментами, trace и отбором источников;
- `agent + evaluator` режим с дополнительным внутренним контролем качества;
- браузерный интерфейс для демонстрации;
- CLI-скрипты для контролируемых экспериментов и подготовки материалов для отчета.

## Что делает система

По теме исследования система строит краткий научно-аналитический обзор в фиксированной структуре:

1. `Определение`
2. `Основные подходы`
3. `Ключевые работы`
4. `Применения`
5. `Ограничения`
6. `Использованные источники`

Для поиска и grounding используются:

- `Wikipedia API` для общего контекста;
- `OpenAlex API` для публикаций и аннотаций;
- `Crossref API` как дополнительный источник при уточнении поиска.

## Архитектура

### Baseline

`baseline` делает ровно три логических шага:

1. ищет краткий общий контекст;
2. берет короткий список публикаций;
3. формирует итоговый ответ за один проход.

### Agent

`agent` хранит состояние `AgentState` и проходит по шагам:

1. собирает общий контекст;
2. ищет публикации через `OpenAlex`;
3. при необходимости уточняет запрос и добирает источники через `OpenAlex + Crossref`;
4. отбирает наиболее релевантные работы и извлекает заметки;
5. формирует структурированный итоговый обзор.

### Agent + evaluator

Этот режим делает то же самое, но после генерации:

1. оценивает ответ по фиксированной рубрике;
2. при необходимости перерабатывает ответ по замечаниям evaluator.

### Trace

Каждый запуск пишет детализированный trace:

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
├── data/topics.json
├── docs/lab-report-template.md
├── index.html
├── styles.css
├── web/app.js
├── src/core/
├── scripts/
├── tests/
└── results/
```

## Требования

- `Node.js 20+`
- локальный `Ollama` или любой OpenAI-compatible endpoint

Локально проверено под `Node 24`.

## Быстрый старт

### 1. Запустить веб-интерфейс

```bash
npm run serve
```

После этого открой `http://127.0.0.1:4173`.

### 2. Локальный запуск через Ollama

Если у тебя уже поднят `Ollama`, достаточно оставить параметры по умолчанию:

- provider: `ollama`
- base URL: `http://127.0.0.1:11434`
- model: `qwen2.5:7b`

### 3. Запуск одной темы из CLI

```bash
npm run single -- --mode agent_evaluator --topic "Planning and reflection in LLM agents"
```

### 4. Smoke-test

```bash
npm run smoke -- --mode agent_evaluator --topic "Planning and reflection in LLM agents"
```

### 5. Полный эксперимент

```bash
npm run experiments
```

Скрипт создаст папку в `results/<timestamp>/` и сохранит:

- все отдельные запуски;
- trace-файлы;
- `records.json`;
- `summary.csv`;
- `summary.md`;
- `summary.json`;
- `quality-comparison.svg`;
- `process-comparison.svg`.

## Параметры модели

### Ollama

Через UI или CLI:

- `provider=ollama`
- `base-url=http://127.0.0.1:11434`
- `model=qwen2.5:7b`

### OpenAI-compatible

Через UI или CLI:

- `provider=openai`
- `base-url=https://.../v1`
- `api-key=...`
- `model=...`

Пример:

```bash
npm run single -- \
  --provider openai \
  --base-url https://api.openai.com/v1 \
  --api-key YOUR_KEY \
  --model gpt-4.1-mini \
  --mode agent \
  --topic "Tool-using language models in scientific search"
```

## Экспериментальный дизайн

По умолчанию проект покрывает требования лабораторной:

- 8 тем из `data/topics.json`;
- сравнение `baseline`, `agent`, `agent_evaluator`;
- sweep по `topK = 3, 5, 8`;
- sweep по `maxSteps = 4, 6, 8`.

Внешняя оценка применяется ко всем конфигурациям одинаково, чтобы сравнение было воспроизводимым.

## Отчет

Шаблон для отчета лежит в:

- docs

После прогона экспериментов можно собрать черновик:

```bash
npm run report -- --input results/<timestamp>/records.json
```

Будет создан файл `lab-report-draft.md` рядом с экспериментами.

При необходимости графики можно пересобрать отдельно:

```bash
npm run charts -- --input results/<timestamp>/summary.json
```

## Размещение на Netlify

Проект сделан как статический фронтенд без обязательного сборщика. Для публикации:

1. отправь репозиторий на GitHub;
2. подключи репозиторий в Netlify;
3. укажи publish directory: `.`;
4. используй OpenAI-compatible endpoint в браузере.

Важно: если страница размещена публично, API-ключ вводится на клиенте. Для production-сценария лучше вынести вызовы модели в серверный прокси, но для лабораторной и демонстрации текущая схема подходит.

## Тесты

```bash
npm test
```

Покрыты базовые функции:

- восстановление abstract из inverted index;
- разбор JSON evaluator;
- проверка обязательных разделов;
- дедупликация источников;
- ранжирование релевантных работ.
