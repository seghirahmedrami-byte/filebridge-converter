const http = require("http");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const root = __dirname;
loadEnvFile(path.join(root, ".env"));
const port = Number(process.env.PORT || 8123);
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

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

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  });
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/storyboard") {
    handleStoryboardRequest(request, response);
    return;
  }

  const requestedPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relativePath = requestedPath === "/" ? "index.html" : decodeURIComponent(requestedPath).replace(/^\/+/, "");
  const cleanPath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, cleanPath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
});

async function handleStoryboardRequest(request, response) {
  try {
    const body = await readJsonBody(request);
    if (!openai) {
      sendJson(response, 503, {
        error: "OPENAI_API_KEY is not configured on the server."
      });
      return;
    }

    const topic = String(body.topic || "").trim().slice(0, 240);
    const tone = String(body.tone || "educational");
    const format = String(body.format || "short");
    const duration = Number(body.duration || 30);
    const sceneCount = duration <= 20 ? 4 : duration <= 30 ? 5 : duration <= 45 ? 7 : 9;

    if (!topic) {
      sendJson(response, 400, { error: "Topic is required." });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Create concise vertical short-video storyboards. Return only valid JSON."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate a short video storyboard",
            topic,
            tone,
            format,
            durationSeconds: duration,
            sceneCount,
            requirements: [
              "Return JSON with a scenes array.",
              "Each scene needs label, text, visual, and seconds.",
              "Text must be punchy and caption-friendly.",
              "No copyrighted lyrics, no brand impersonation, no unsafe claims."
            ]
          })
        }
      ]
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const scenes = normalizeScenes(parsed.scenes, sceneCount, duration);
    sendJson(response, 200, { scenes, source: "openai" });
  } catch (error) {
    console.error(error);
    if (error.status === 429 || error.code === "insufficient_quota") {
      sendJson(response, 429, {
        error: "OpenAI quota is unavailable for this project. Check billing or try another API key."
      });
      return;
    }

    sendJson(response, 500, { error: "Could not generate storyboard." });
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function normalizeScenes(rawScenes, sceneCount, duration) {
  const seconds = duration / sceneCount;
  const safeScenes = Array.isArray(rawScenes) ? rawScenes.slice(0, sceneCount) : [];
  while (safeScenes.length < sceneCount) {
    safeScenes.push({
      label: `Scene ${safeScenes.length + 1}`,
      text: "Keep watching for the next step.",
      visual: "Animated caption scene",
      seconds
    });
  }

  return safeScenes.map((scene, index) => ({
    label: String(scene.label || `Scene ${index + 1}`).slice(0, 40),
    text: String(scene.text || "").slice(0, 220),
    visual: String(scene.visual || "Animated caption scene").slice(0, 160),
    seconds: Number(scene.seconds || seconds) || seconds,
    index
  }));
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

server.listen(port, "127.0.0.1", () => {
  console.log(`FileBridge Converter running at http://127.0.0.1:${port}/`);
});
