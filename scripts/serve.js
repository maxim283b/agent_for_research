import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./common.js";

const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

const server = createServer(async (request, response) => {
  try {
    const requestPath = request.url === "/" ? "/index.html" : request.url;
    const targetPath = path.join(REPO_ROOT, decodeURIComponent(requestPath));
    const content = await readFile(targetPath);
    const contentType = mimeTypes[path.extname(targetPath)] || "text/plain; charset=utf-8";
    response.writeHead(200, { "content-type": contentType });
    response.end(content);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Static UI is available at http://127.0.0.1:${port}`);
});
