import OpenAI from "openai";

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    const apiKey = getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      return json({ error: "OPENAI_API_KEY is not configured on the server." }, 503);
    }

    const body = await request.json().catch(() => ({}));
    const topic = String(body.topic || "").trim().slice(0, 240);
    const tone = String(body.tone || "educational");
    const format = String(body.format || "short");
    const duration = Number(body.duration || 30);
    const sceneCount = duration <= 20 ? 4 : duration <= 30 ? 5 : duration <= 45 ? 7 : 9;

    if (!topic) {
      return json({ error: "Topic is required." }, 400);
    }

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: getEnv("OPENAI_MODEL") || "gpt-4.1-mini",
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
    return json({
      scenes: normalizeScenes(parsed.scenes, sceneCount, duration),
      source: "openai"
    });
  } catch (error) {
    console.error(error);
    if (error.status === 429 || error.code === "insufficient_quota") {
      return json({
        error: "OpenAI quota is unavailable for this project. Check billing or try another API key."
      }, 429);
    }

    return json({ error: "Could not generate storyboard." }, 500);
  }
};

export const config = {
  path: "/api/storyboard"
};

function getEnv(key) {
  return globalThis.Netlify?.env?.get?.(key) || process.env[key] || "";
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

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}
