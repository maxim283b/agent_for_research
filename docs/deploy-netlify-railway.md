# Deploy: Netlify + Railway

## Архитектура

- `Netlify` хостит статический сайт.
- `Railway` хостит Node API агента.
- Браузер ходит только в `Railway API`.
- Ключ модели хранится только на сервере в Railway Variables.

## 1. Railway

Создай новый проект и подключи GitHub-репозиторий.

Start command уже задан в [railway.json](/Users/maksi/Desktop/в итмо/deeplearning/railway.json):

- `npm start`

Добавь переменные окружения:

- `PORT=8787`
- `LLM_PROVIDER=openai`
- `OPENAI_BASE_URL=https://api.openai.com/v1`
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=mistral`
- `ALLOWED_ORIGINS=https://YOUR_SITE.netlify.app`
- `LLM_MAX_TOKENS=450`
- `LLM_TEMPERATURE=0.2`

После деплоя проверь:

- `https://YOUR-RAILWAY-URL/api/health`

## 2. Netlify

Подключи тот же GitHub-репозиторий как static site.

Параметры:

- Build command: пусто
- Publish directory: `.`

После того как получишь Railway URL, открой [app-config.js](/Users/maksi/Desktop/в итмо/deeplearning/app-config.js) и впиши:

```js
window.APP_CONFIG = {
  API_BASE_URL: "https://YOUR-RAILWAY-URL"
};
```

Закоммить изменение и отправь его в GitHub. Netlify автоматически подхватит новый URL.

## 3. Что уже реализовано

- Серверный API: [server/api-server.js](/Users/maksi/Desktop/в итмо/deeplearning/server/api-server.js)
- Публичные endpoints:
  - `GET /api/health`
  - `GET /api/config`
  - `GET /api/topics`
  - `POST /api/run`
- Фронтенд теперь вызывает не модель напрямую, а серверный API:
  - [web/app.js](/Users/maksi/Desktop/в итмо/deeplearning/web/app.js)

## 4. Локальная проверка

В одном терминале:

```bash
npm start
```

Во втором:

```bash
npm run serve
```

После этого открой:

- frontend: `http://127.0.0.1:4173`
- backend health: `http://127.0.0.1:8787/api/health`
