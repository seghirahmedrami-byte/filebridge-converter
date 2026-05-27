const fs = require("fs");
const path = require("path");
const storyboard = require("./api/storyboard");

const root = __dirname;
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".gz": "application/gzip"
};

module.exports = async function handler(request, response) {
  if (request.url.split("?")[0] === "/api/storyboard") {
    await storyboard(request, response);
    return;
  }

  const requestedPath = new URL(request.url, `https://${request.headers.host}`).pathname;
  const relativePath = requestedPath === "/" ? "index.html" : decodeURIComponent(requestedPath).replace(/^\/+/, "");
  const cleanPath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, cleanPath);

  if (!filePath.startsWith(root)) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", types[path.extname(filePath).toLowerCase()] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.end(data);
  });
};
