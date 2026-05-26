const OpenAI = require("openai");

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = parseBody(request.body);
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
};

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body);
  return body;
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
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}
