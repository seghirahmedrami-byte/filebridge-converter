const topicInput = document.querySelector("#topic");
const toneSelect = document.querySelector("#tone");
const durationSelect = document.querySelector("#duration");
const formatSelect = document.querySelector("#format");
const musicSelect = document.querySelector("#music");
const generateButton = document.querySelector("#generate");
const renderButton = document.querySelector("#render");
const downloadLink = document.querySelector("#download");
const statusText = document.querySelector("#status");
const scenesContainer = document.querySelector("#scenes");
const canvas = document.querySelector("#preview");
const ctx = canvas.getContext("2d");

let scenes = [];
let animationId = null;
let downloadUrl = null;

const palettes = {
  educational: ["#0e8b74", "#f2b64b", "#101817"],
  viral: ["#d95d67", "#f2b64b", "#101817"],
  luxury: ["#101817", "#c6a15b", "#ffffff"],
  story: ["#214e66", "#d95d67", "#f7f1df"]
};

generateButton.addEventListener("click", () => {
  generateStoryboard();
});

renderButton.addEventListener("click", async () => {
  if (!scenes.length) scenes = buildScenes();
  readSceneEditors();
  await renderVideo();
});

async function generateStoryboard() {
  setStatus("Generating storyboard with API...");
  generateButton.disabled = true;

  try {
    const response = await fetch("/api/storyboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: cleanTopic(topicInput.value),
        tone: toneSelect.value,
        duration: Number(durationSelect.value),
        format: formatSelect.value
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "API generation is unavailable.");
    }

    const payload = await response.json();
    scenes = normalizeApiScenes(payload.scenes);
    renderSceneEditors();
    drawScene(0, 0);
    setStatus("AI storyboard generated. Edit any scene text, then render the video.");
  } catch (error) {
    scenes = buildScenes();
    renderSceneEditors();
    drawScene(0, 0);
    setStatus(`${error.message} Used local script generator instead.`);
  } finally {
    generateButton.disabled = false;
  }
}

function buildScenes() {
  const topic = cleanTopic(topicInput.value) || "How to build better habits";
  const tone = toneSelect.value;
  const format = formatSelect.value;
  const duration = Number(durationSelect.value);
  const sceneCount = duration <= 20 ? 4 : duration <= 30 ? 5 : duration <= 45 ? 7 : 9;
  const seconds = duration / sceneCount;
  const hooks = {
    educational: `Here is the simple truth about ${topic}.`,
    viral: `Most people miss this about ${topic}.`,
    luxury: `${topic} is not about luck. It is about precision.`,
    story: `This is how ${topic} changed everything.`
  };
  const bodyLines = makeBodyLines(topic, format, sceneCount - 2);

  return [
    makeScene("Hook", hooks[tone], seconds, 0),
    ...bodyLines.map((line, index) => makeScene(`Point ${index + 1}`, line, seconds, index + 1)),
    makeScene("Call to action", `Save this and try it today: ${topic}.`, seconds, sceneCount - 1)
  ];
}

function normalizeApiScenes(apiScenes) {
  const source = Array.isArray(apiScenes) && apiScenes.length ? apiScenes : buildScenes();
  return source.map((scene, index) => ({
    label: scene.label || `Scene ${index + 1}`,
    text: scene.text || "Keep watching.",
    seconds: Number(scene.seconds || Number(durationSelect.value) / source.length),
    index,
    visual: scene.visual || "Animated caption scene",
    accent: palettes[toneSelect.value][index % palettes[toneSelect.value].length]
  }));
}

function makeBodyLines(topic, format, count) {
  const templates = {
    short: [
      `Start with one clear goal around ${topic}.`,
      "Remove anything that makes the first step harder.",
      "Track the result, not just the effort.",
      "Repeat the smallest action until it feels automatic.",
      "Upgrade only after the basic version works."
    ],
    ad: [
      `${topic} solves the problem people keep ignoring.`,
      "Show the pain clearly before showing the fix.",
      "Make the result visible in one sentence.",
      "Use proof, speed, and simplicity to build trust.",
      "End with one direct action."
    ],
    facts: [
      `Fact one: ${topic} works best when it is specific.`,
      "Fact two: consistency beats intensity.",
      "Fact three: visual proof makes people remember.",
      "Fact four: short messages spread faster.",
      "Fact five: simple systems scale."
    ]
  };
  const source = templates[format];
  return Array.from({ length: count }, (_, index) => source[index % source.length]);
}

function makeScene(label, text, seconds, index) {
  return {
    label,
    text,
    seconds,
    index,
    accent: palettes[toneSelect.value][index % palettes[toneSelect.value].length]
  };
}

function renderSceneEditors() {
  scenesContainer.innerHTML = "";
  scenes.forEach((scene, index) => {
    const article = document.createElement("article");
    article.className = "scene";
    article.innerHTML = `
      <div class="scene-top">
        <span>${scene.label}</span>
        <span>${scene.seconds.toFixed(1)}s</span>
      </div>
      <p class="visual">${scene.visual || "Animated caption scene"}</p>
      <textarea data-scene="${index}">${scene.text}</textarea>
    `;
    scenesContainer.appendChild(article);
  });
}

function readSceneEditors() {
  scenesContainer.querySelectorAll("textarea[data-scene]").forEach((textarea) => {
    scenes[Number(textarea.dataset.scene)].text = textarea.value.trim();
  });
}

async function renderVideo() {
  setStatus("Rendering video...");
  downloadLink.classList.add("disabled");
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);

  const stream = canvas.captureStream(30);
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  if (musicSelect.value !== "none") addMusic(audioContext, destination, totalDuration());
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const done = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  recorder.start();
  await playTimeline();
  recorder.stop();
  await done;
  await audioContext.close();

  const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
  downloadUrl = URL.createObjectURL(blob);
  downloadLink.href = downloadUrl;
  downloadLink.download = "shortforge-video.webm";
  downloadLink.classList.remove("disabled");
  setStatus("Video is ready. Download it as a WebM file.");
}

async function playTimeline() {
  const start = performance.now();
  const duration = totalDuration() * 1000;

  return new Promise((resolve) => {
    const tick = (now) => {
      const elapsed = now - start;
      const position = Math.min(duration, elapsed);
      const { sceneIndex, sceneTime } = locateScene(position / 1000);
      drawScene(sceneIndex, sceneTime);
      if (elapsed < duration) {
        animationId = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(animationId);
        resolve();
      }
    };
    animationId = requestAnimationFrame(tick);
  });
}

function locateScene(time) {
  let cursor = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const next = cursor + scenes[index].seconds;
    if (time <= next) return { sceneIndex: index, sceneTime: time - cursor };
    cursor = next;
  }
  return { sceneIndex: scenes.length - 1, sceneTime: scenes.at(-1).seconds };
}

function drawScene(sceneIndex, sceneTime) {
  const scene = scenes[sceneIndex] || makeScene("Preview", "Generate a script to preview your video.", 4, 0);
  const palette = palettes[toneSelect.value];
  const progress = scene.seconds ? sceneTime / scene.seconds : 0;
  const pulse = Math.sin(progress * Math.PI);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.55, scene.accent || palette[1]);
  gradient.addColorStop(1, palette[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    ctx.arc(
      120 + i * 130 + pulse * 60,
      240 + ((i * 211) % 1200),
      80 + ((i * 37) % 130),
      0,
      Math.PI * 2
    );
    ctx.fillStyle = i % 2 ? "#ffffff" : "#000000";
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(0,0,0,0.34)";
  roundRect(70, 180, 940, 1320, 42);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 58px Arial";
  ctx.fillText(scene.label.toUpperCase(), 110, 270);

  ctx.fillStyle = "#ffffff";
  wrapText(scene.text, 110, 470, 860, 88, "900 76px Arial");

  ctx.fillStyle = "rgba(255,255,255,0.86)";
  wrapText(makeCaption(scene.text), 110, 1530, 860, 46, "700 42px Arial");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(110, 1740, 860 * progress, 10);
  ctx.fillStyle = "rgba(255,255,255,0.34)";
  ctx.fillRect(110 + 860 * progress, 1740, 860 * (1 - progress), 10);
}

function wrapText(text, x, y, maxWidth, lineHeight, font) {
  ctx.font = font;
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  });
  if (line) ctx.fillText(line, x, cursorY);
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function addMusic(audioContext, destination, duration) {
  const now = audioContext.currentTime;
  const bpm = musicSelect.value === "calm" ? 82 : 118;
  const beat = 60 / bpm;
  for (let i = 0; i < duration / beat; i += 1) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = i % 4 === 0 ? "triangle" : "sine";
    oscillator.frequency.value = musicSelect.value === "calm" ? 220 + (i % 3) * 55 : 330 + (i % 5) * 35;
    gain.gain.setValueAtTime(0.0001, now + i * beat);
    gain.gain.exponentialRampToValueAtTime(0.045, now + i * beat + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * beat + beat * 0.8);
    oscillator.connect(gain).connect(destination);
    oscillator.start(now + i * beat);
    oscillator.stop(now + i * beat + beat * 0.8);
  }
}

function pickMimeType() {
  const preferred = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return preferred.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function totalDuration() {
  return scenes.reduce((sum, scene) => sum + scene.seconds, 0);
}

function makeCaption(text) {
  return text.length > 88 ? `${text.slice(0, 85)}...` : text;
}

function cleanTopic(value) {
  return value.trim().replace(/\s+/g, " ");
}

function setStatus(message) {
  statusText.textContent = message;
}

scenes = buildScenes();
renderSceneEditors();
drawScene(0, 0);
