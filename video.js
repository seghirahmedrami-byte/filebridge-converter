const topicInput = document.querySelector("#topic");
const toneSelect = document.querySelector("#tone");
const durationSelect = document.querySelector("#duration");
const formatSelect = document.querySelector("#format");
const musicSelect = document.querySelector("#music");
const mediaInput = document.querySelector("#media-assets");
const generateButton = document.querySelector("#generate");
const autoBrollButton = document.querySelector("#auto-broll");
const renderButton = document.querySelector("#render");
const downloadLink = document.querySelector("#download");
const statusText = document.querySelector("#status");
const scenesContainer = document.querySelector("#scenes");
const canvas = document.querySelector("#preview");
const ctx = canvas.getContext("2d");

let scenes = [];
let animationId = null;
let downloadUrl = null;
let mediaAssets = [];
let activeMediaIndex = null;

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

mediaInput.addEventListener("change", async () => {
  await loadMediaAssets(Array.from(mediaInput.files || []));
  assignMediaToScenes();
  renderSceneEditors();
  drawScene(0, 0);
});

autoBrollButton.addEventListener("click", () => {
  if (!scenes.length) scenes = buildScenes();
  readSceneEditors();
  applyAutomaticBroll();
  renderSceneEditors();
  drawScene(0, 0);
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
    assignMediaToScenes();
    renderSceneEditors();
    drawScene(0, 0);
    setStatus("AI storyboard generated. Edit any scene text, then render the video.");
  } catch (error) {
    scenes = buildScenes();
    assignMediaToScenes();
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
    media: null,
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
      <span class="media-label">${scene.media ? `Media: ${scene.media.name}` : "No media attached"}</span>
      <input data-media="${index}" type="file" accept="video/*,image/*">
      <textarea data-scene="${index}">${scene.text}</textarea>
    `;
    scenesContainer.appendChild(article);
  });

  scenesContainer.querySelectorAll("input[data-media]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      scenes[Number(input.dataset.media)].media = await createMediaAsset(file);
      renderSceneEditors();
      drawScene(Number(input.dataset.media), 0);
    });
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
  await prepareMediaForRender();

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
  pauseAllMedia();

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
  activeMediaIndex = null;

  return new Promise((resolve) => {
    const tick = (now) => {
      const elapsed = now - start;
      const position = Math.min(duration, elapsed);
      const { sceneIndex, sceneTime } = locateScene(position / 1000);
      syncSceneMedia(sceneIndex, sceneTime);
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

  if (!drawMediaBackground(scene, sceneTime)) {
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
  }

  ctx.fillStyle = scene.media ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0.34)";
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

async function loadMediaAssets(files) {
  mediaAssets.forEach((asset) => URL.revokeObjectURL(asset.url));
  mediaAssets = [];
  for (const file of files) {
    mediaAssets.push(await createMediaAsset(file));
  }
  setStatus(mediaAssets.length ? `${mediaAssets.length} real clip(s) loaded. Generate or render your video.` : "No clips selected.");
}

async function createMediaAsset(file) {
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");
  const element = document.createElement(isVideo ? "video" : "img");
  element.src = url;

  if (isVideo) {
    element.muted = true;
    element.loop = true;
    element.playsInline = true;
    element.preload = "auto";
    await new Promise((resolve, reject) => {
      element.onloadedmetadata = resolve;
      element.onerror = reject;
    });
  } else {
    await new Promise((resolve, reject) => {
      element.onload = resolve;
      element.onerror = reject;
    });
  }

  return {
    type: isVideo ? "video" : "image",
    name: file.name,
    url,
    element
  };
}

function assignMediaToScenes() {
  if (!mediaAssets.length) return;
  scenes = scenes.map((scene, index) => ({
    ...scene,
    media: scene.media || mediaAssets[index % mediaAssets.length]
  }));
}

function applyAutomaticBroll() {
  const theme = detectBrollTheme(cleanTopic(topicInput.value));
  scenes = scenes.map((scene, index) => ({
    ...scene,
    visual: scene.visual || `Automatic ${theme} motion scene`,
    media: createAutoBrollAsset(theme, index)
  }));
  setStatus(`Automatic ${theme} b-roll added to every scene. Render to make the video.`);
}

function detectBrollTheme(topic) {
  const text = topic.toLowerCase();
  if (/money|cash|rich|business|profit|sales|shop|ecommerce|crypto|finance/.test(text)) return "money";
  if (/phone|ai|tech|software|app|computer|robot|digital|online/.test(text)) return "tech";
  if (/gym|fit|body|health|sport|run|workout|diet/.test(text)) return "fitness";
  if (/food|cook|restaurant|meal|coffee|recipe/.test(text)) return "food";
  if (/travel|city|house|real estate|car|street|luxury/.test(text)) return "city";
  return toneSelect.value === "viral" ? "viral" : "focus";
}

function createAutoBrollAsset(theme, index) {
  return {
    type: "auto",
    name: `Auto ${theme} motion ${index + 1}`,
    theme,
    seed: index * 97 + theme.length * 13
  };
}

async function prepareMediaForRender() {
  activeMediaIndex = null;
  await Promise.all(mediaAssets.map(async (asset) => {
    if (asset.type !== "video") return;
    asset.element.currentTime = 0;
    asset.element.muted = true;
    await asset.element.play().catch(() => {});
    asset.element.pause();
  }));
}

function syncSceneMedia(sceneIndex, sceneTime) {
  const scene = scenes[sceneIndex];
  if (!scene?.media || scene.media.type !== "video") {
    if (activeMediaIndex !== null) pauseAllMedia();
    activeMediaIndex = null;
    return;
  }

  if (activeMediaIndex !== sceneIndex) {
    pauseAllMedia();
    const video = scene.media.element;
    video.currentTime = scene.media.element.duration ? sceneTime % scene.media.element.duration : 0;
    video.play().catch(() => {});
    activeMediaIndex = sceneIndex;
  }
}

function pauseAllMedia() {
  mediaAssets.forEach((asset) => {
    if (asset.type === "video") asset.element.pause();
  });
}

function drawMediaBackground(scene, sceneTime = 0) {
  const asset = scene.media;
  if (!asset) return false;
  if (asset.type === "auto") {
    drawAutoBroll(asset, sceneTime);
    return true;
  }
  const element = asset.element;
  const width = asset.type === "video" ? element.videoWidth : element.naturalWidth;
  const height = asset.type === "video" ? element.videoHeight : element.naturalHeight;
  if (!width || !height) return false;

  drawCover(element, width, height);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return true;
}

function drawAutoBroll(asset, sceneTime) {
  const t = sceneTime;
  const theme = asset.theme;
  const base = {
    money: ["#0d3f2e", "#29b36f", "#f2b64b"],
    tech: ["#09111f", "#1d7cff", "#7ef0ff"],
    fitness: ["#111814", "#e64848", "#f2b64b"],
    food: ["#1d1510", "#d95d67", "#f2b64b"],
    city: ["#101817", "#506a78", "#f5f0df"],
    viral: ["#150b1f", "#d95d67", "#f2b64b"],
    focus: ["#101817", "#0e8b74", "#f2b64b"]
  }[theme] || ["#101817", "#0e8b74", "#f2b64b"];

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, base[0]);
  gradient.addColorStop(0.58, base[1]);
  gradient.addColorStop(1, base[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (theme === "money") drawMoneyMotion(t, asset.seed);
  else if (theme === "tech") drawTechMotion(t, asset.seed);
  else if (theme === "fitness") drawFitnessMotion(t, asset.seed);
  else if (theme === "food") drawFoodMotion(t, asset.seed);
  else if (theme === "city") drawCityMotion(t, asset.seed);
  else drawViralMotion(t, asset.seed);

  const zoom = 1 + Math.sin(t * 3) * 0.012;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 6;
  ctx.strokeRect(70, 90, canvas.width - 140, canvas.height - 180);
  ctx.restore();
}

function drawMoneyMotion(t, seed) {
  ctx.font = "900 78px Arial";
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 181 + seed * 7 + t * 170) % 1280) - 100;
    const y = ((i * 263 + seed * 11 + t * 260) % 2200) - 140;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t + i) * 0.4);
    ctx.fillStyle = i % 3 ? "rgba(255,255,255,0.52)" : "rgba(242,182,75,0.82)";
    ctx.fillText(i % 2 ? "$" : "SALE", 0, 0);
    ctx.restore();
  }
}

function drawTechMotion(t, seed) {
  ctx.strokeStyle = "rgba(126,240,255,0.38)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 22; i += 1) {
    const y = (i * 94 + t * 120 + seed) % canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y + Math.sin(t + i) * 80);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.74)";
  for (let i = 0; i < 30; i += 1) {
    ctx.fillRect((i * 73 + seed * 3) % canvas.width, (i * 151 + t * 240) % canvas.height, 10, 10);
  }
}

function drawFitnessMotion(t, seed) {
  for (let i = 0; i < 12; i += 1) {
    const x = 110 + ((i * 97 + seed) % 850);
    const y = 260 + ((i * 151 + t * 180) % 1300);
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.55)" : "rgba(230,72,72,0.72)";
    roundRect(x, y, 260, 34, 17);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 12, y + 17, 54 + Math.sin(t * 4 + i) * 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFoodMotion(t, seed) {
  for (let i = 0; i < 16; i += 1) {
    const x = ((i * 139 + seed + Math.sin(t + i) * 90) % 1100) - 20;
    const y = ((i * 219 + t * 150) % 1980) - 20;
    ctx.fillStyle = i % 2 ? "rgba(242,182,75,0.75)" : "rgba(217,93,103,0.7)";
    ctx.beginPath();
    ctx.arc(x, y, 38 + (i % 4) * 12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCityMotion(t, seed) {
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let i = 0; i < 12; i += 1) {
    const width = 80 + (i % 5) * 38;
    const height = 360 + ((i * 97 + seed) % 540);
    const x = i * 105 - ((t * 80) % 105);
    ctx.fillRect(x, canvas.height - height, width, height);
    ctx.fillStyle = i % 2 ? "rgba(242,182,75,0.25)" : "rgba(255,255,255,0.2)";
  }
}

function drawViralMotion(t, seed) {
  ctx.font = "900 92px Arial";
  const words = ["WAIT", "LOOK", "NOW", "STOP", "WATCH"];
  for (let i = 0; i < 14; i += 1) {
    const x = ((i * 233 + seed * 5) % 1000) + Math.sin(t * 3 + i) * 80;
    const y = ((i * 157 + t * 220) % 1900) + 20;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 5 + i) * 0.18);
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.52)" : "rgba(242,182,75,0.8)";
    ctx.fillText(words[i % words.length], -90, 0);
    ctx.restore();
  }
}

function drawCover(element, sourceWidth, sourceHeight) {
  const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  ctx.drawImage(element, x, y, width, height);
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
