document.documentElement.dataset.fileBridgeReady = "true";

const modeSelect = document.querySelector("#mode");
const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector(".drop-zone");
const acceptCopy = document.querySelector("#accept-copy");
const convertBtn = document.querySelector("#convert-btn");
const clearBtn = document.querySelector("#clear-btn");
const preview = document.querySelector("#preview");
const progressBar = document.querySelector("#progress-bar");
const statusText = document.querySelector("#status-text");
const downloadLink = document.querySelector("#download-link");
const pdfEditInput = document.querySelector("#pdf-edit-input");
const pdfSaveBtn = document.querySelector("#pdf-save-btn");
const pdfResetBtn = document.querySelector("#pdf-reset-btn");
const pdfStatusText = document.querySelector("#pdf-status-text");
const pdfPageList = document.querySelector("#pdf-page-list");
const pdfDownloadLink = document.querySelector("#pdf-download-link");
const pdfTextInput = document.querySelector("#pdf-text-input");
const pdfFontSizeInput = document.querySelector("#pdf-font-size");
const pdfTextColorInput = document.querySelector("#pdf-text-color");
const pdfCoverToggle = document.querySelector("#pdf-cover-toggle");
const pdfEditMode = document.querySelector("#pdf-edit-mode");
const pdfEraseWidthInput = document.querySelector("#pdf-erase-width");
const pdfEraseHeightInput = document.querySelector("#pdf-erase-height");
const pdfUndoTextBtn = document.querySelector("#pdf-undo-text-btn");
const pdfUndoEraseBtn = document.querySelector("#pdf-undo-erase-btn");
const openPageCanvas = document.querySelector("#open-page-canvas");
const openPageTitle = document.querySelector("#open-page-title");
const openPagePrev = document.querySelector("#open-page-prev");
const openPageNext = document.querySelector("#open-page-next");
const pdfDetectTextBtn = document.querySelector("#pdf-detect-text-btn");
const pdfReplaceInput = document.querySelector("#pdf-replace-input");
const pdfReplaceTextBtn = document.querySelector("#pdf-replace-text-btn");
const pdfRemoveSelectedBtn = document.querySelector("#pdf-remove-selected-btn");
const pdfDetectedList = document.querySelector("#pdf-detected-list");
const pdfAutoStyleToggle = document.querySelector("#pdf-auto-style-toggle");

const modeConfig = {
  "pdf-to-excel": {
    accept: ".pdf",
    copy: "PDF files are accepted for this mode.",
    outputName: "converted-from-pdf.xlsx"
  },
  "jpeg-to-excel": {
    accept: ".jpg,.jpeg",
    copy: "JPEG images are accepted for this mode. Clear, high-contrast tables work best.",
    outputName: "converted-from-image.xlsx"
  },
  "excel-to-pdf": {
    accept: ".xlsx,.xls,.csv",
    copy: "Excel and CSV files are accepted for this mode.",
    outputName: "converted-from-excel.pdf"
  },
  "excel-to-jpeg": {
    accept: ".xlsx,.xls,.csv",
    copy: "Excel and CSV files are accepted for this mode.",
    outputName: "converted-from-excel.jpg"
  }
};

const LOCAL_TESSERACT_OPTIONS = {
  workerPath: "/node_modules/tesseract.js/dist/worker.min.js",
  corePath: "/node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  langPath: "/node_modules/@tesseract.js-data/eng/4.0.0"
};

let selectedFile = null;
let currentObjectUrl = null;
let Tesseract;
let XLSX;
let jsPDF;
let librariesPromise;
let PDFDocument;
let degrees;
let rgb;
let StandardFonts;
let pdfSourceBytes = null;
let pdfSourceName = "modified.pdf";
let pdfPages = [];
let pdfDocumentProxy = null;
let pdfObjectUrl = null;
let pdfLibPromise;
let activePdfPageIndex = null;
let pdfjsRenderer = null;
let selectedDetectedText = null;
let useLocalTesseractAssets = false;

async function loadLibraries() {
  if (!librariesPromise) {
    librariesPromise = Promise.all([
      loadScriptAny("/node_modules/tesseract.js/dist/tesseract.min.js", "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"),
      loadScriptAny("/node_modules/xlsx/dist/xlsx.full.min.js", "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"),
      loadScriptAny("/node_modules/jspdf/dist/jspdf.umd.min.js", "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"),
      loadScriptAny("/node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js", "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js")
    ]).then(([tesseractSrc]) => {
      useLocalTesseractAssets = tesseractSrc.startsWith("/node_modules/");
      Tesseract = window.Tesseract;
      XLSX = window.XLSX;
      jsPDF = window.jspdf?.jsPDF;
      if (!Tesseract || !XLSX || !jsPDF) {
        throw new Error("Converter tools did not load. Refresh the page and try again.");
      }
      document.documentElement.dataset.fileBridgeLibraries = "true";
    });
  }

  return librariesPromise;
}

async function loadScriptAny(localSrc, cdnSrc) {
  try {
    return await loadScript(localSrc);
  } catch (localError) {
    return loadScript(cdnSrc);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve(src);
      return;
    }

    const script = existing || document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve(src);
    };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    if (!existing) document.head.appendChild(script);
  });
}

window.fileBridgeTestLoad = loadLibraries;

function getTesseractOptions(extra = {}) {
  return useLocalTesseractAssets ? { ...LOCAL_TESSERACT_OPTIONS, ...extra } : extra;
}

async function loadPdfTools() {
  if (!pdfLibPromise) {
    pdfLibPromise = loadScriptAny("/node_modules/pdf-lib/dist/pdf-lib.min.js", "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js").then(() => {
      PDFDocument = window.PDFLib?.PDFDocument;
      degrees = window.PDFLib?.degrees;
      rgb = window.PDFLib?.rgb;
      StandardFonts = window.PDFLib?.StandardFonts;
      if (!PDFDocument || !degrees || !rgb || !StandardFonts) {
        throw new Error("PDF editing tools did not load. Refresh the page and try again.");
      }
      return loadPdfRenderer();
    });
  }

  return pdfLibPromise;
}

async function loadPdfRenderer() {
  if (!pdfjsRenderer) {
    try {
      pdfjsRenderer = await import("/node_modules/pdfjs-dist/build/pdf.min.mjs");
      pdfjsRenderer.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    } catch (localError) {
      pdfjsRenderer = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
      pdfjsRenderer.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    }
  }

  return pdfjsRenderer;
}

modeSelect.addEventListener("change", () => {
  const config = modeConfig[modeSelect.value];
  fileInput.accept = config.accept;
  acceptCopy.textContent = config.copy;
  resetOutput();
});

fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files[0] || null;
  resetOutput();
  setStatus(selectedFile ? `Ready: ${selectedFile.name}` : "Select a conversion mode and upload a file.", 0);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  selectedFile = file;
  fileInput.files = event.dataTransfer.files;
  resetOutput();
  setStatus(`Ready: ${file.name}`, 0);
});

clearBtn.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";
  resetOutput();
  preview.innerHTML = `<p class="empty">Your converted data will appear here.</p>`;
  setStatus("Select a conversion mode and upload a file.", 0);
});

pdfEditInput.addEventListener("change", async () => {
  const file = pdfEditInput.files[0];
  if (!file) return;
  await openEditablePdf(file);
});

pdfResetBtn.addEventListener("click", () => {
  resetPdfEditor();
});

pdfSaveBtn.addEventListener("click", async () => {
  await saveModifiedPdf();
});

pdfUndoTextBtn.addEventListener("click", async () => {
  await undoLastPdfText();
});

pdfUndoEraseBtn.addEventListener("click", async () => {
  await undoLastPdfErase();
});

openPagePrev.addEventListener("click", async () => {
  if (activePdfPageIndex === null) return;
  await openPdfPage(Math.max(0, activePdfPageIndex - 1));
});

openPageNext.addEventListener("click", async () => {
  if (activePdfPageIndex === null) return;
  await openPdfPage(Math.min(pdfPages.length - 1, activePdfPageIndex + 1));
});

pdfDetectTextBtn.addEventListener("click", async () => {
  await detectOpenPageText();
});

pdfReplaceTextBtn.addEventListener("click", async () => {
  await replaceSelectedDetectedText();
});

pdfRemoveSelectedBtn.addEventListener("click", async () => {
  await removeSelectedDetectedText();
});

convertBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    setStatus("Choose a file first.", 0);
    return;
  }

  convertBtn.disabled = true;
  resetOutput();

  try {
    setStatus("Loading converter tools...", 5);
    await loadLibraries();
    const mode = modeSelect.value;
    if (mode === "pdf-to-excel") await pdfToExcel(selectedFile);
    if (mode === "jpeg-to-excel") await jpegToExcel(selectedFile);
    if (mode === "excel-to-pdf") await excelToPdf(selectedFile);
    if (mode === "excel-to-jpeg") await excelToJpeg(selectedFile);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Conversion failed. Try another file.", 0);
  } finally {
    convertBtn.disabled = false;
  }
});

async function pdfToExcel(file) {
  assertExtension(file, [".pdf"]);
  setStatus("Reading PDF pages...", 12);

  const pdfjsLib = await import("/node_modules/pdfjs-dist/build/pdf.min.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const rows = [["Page", "Line", "Text"]];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(`Extracting page ${pageNumber} of ${pdf.numPages}...`, 15 + Math.round((pageNumber / pdf.numPages) * 60));
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = groupTextItemsIntoLines(content.items);
    lines.forEach((line, index) => rows.push([pageNumber, index + 1, line]));
  }

  if (rows.length === 1) {
    rows.push(...(await ocrPdfPages(pdf)));
  }

  finishWorkbook(rows, "PDF text extracted into rows. Scanned PDFs are OCR-read when no embedded text is found.");
}

async function ocrPdfPages(pdf) {
  const rows = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(`OCR reading scanned page ${pageNumber} of ${pdf.numPages}...`, 18 + Math.round((pageNumber / pdf.numPages) * 70));
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    const result = await Tesseract.recognize(canvas, "eng", getTesseractOptions());
    textToRows(result.data.text).forEach((row, index) => {
      rows.push([pageNumber, index + 1, row.join(" ")]);
    });
  }

  return rows;
}

async function jpegToExcel(file) {
  assertExtension(file, [".jpg", ".jpeg"]);
  setStatus("Starting OCR...", 8);

  const result = await Tesseract.recognize(file, "eng", getTesseractOptions({
    logger: (message) => {
      if (message.status === "recognizing text") {
        setStatus("Reading text from image...", 15 + Math.round(message.progress * 70));
      }
    }
  }));

  const rows = textToRows(result.data.text);
  finishWorkbook(rows, "OCR finished. Review the preview because image-to-table conversion depends on image quality.");
}

async function excelToPdf(file) {
  assertExtension(file, [".xlsx", ".xls", ".csv"]);
  setStatus("Reading spreadsheet...", 20);
  const rows = await readSpreadsheet(file);
  renderTable(rows, "Spreadsheet preview.");

  setStatus("Building PDF...", 72);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const head = [rows[0] || ["Column 1"]];
  const body = rows.slice(1);
  doc.text("Converted spreadsheet", 40, 34);
  doc.autoTable({
    head,
    body,
    startY: 52,
    styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [15, 123, 108] }
  });

  const blob = doc.output("blob");
  setDownload(blob, modeConfig[modeSelect.value].outputName);
  setStatus("PDF is ready to download.", 100);
}

async function excelToJpeg(file) {
  assertExtension(file, [".xlsx", ".xls", ".csv"]);
  setStatus("Reading spreadsheet...", 20);
  const rows = await readSpreadsheet(file);
  renderTable(rows, "Spreadsheet preview.");
  setStatus("Painting JPEG image...", 78);

  const blob = await rowsToJpeg(rows);
  setDownload(blob, modeConfig[modeSelect.value].outputName);
  setStatus("JPEG is ready to download.", 100);
}

function finishWorkbook(rows, notice) {
  const safeRows = rows.length > 1 ? rows : [["Text"], ["No readable text was found."]];
  renderTable(safeRows, notice);

  const worksheet = XLSX.utils.aoa_to_sheet(safeRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Converted");
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  setDownload(blob, modeConfig[modeSelect.value].outputName);
  setStatus("Excel file is ready to download.", 100);
}

async function readSpreadsheet(file) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const csv = await file.text();
    return textToRows(csv);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }).map((row) => row.map((cell) => String(cell ?? "")));
}

function groupTextItemsIntoLines(items) {
  const groups = new Map();
  items.forEach((item) => {
    const y = Math.round(item.transform[5] / 5) * 5;
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(item);
  });

  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, lineItems]) =>
      lineItems
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((item) => item.str.trim())
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean);
}

function textToRows(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines.map((line) => {
    const tabbed = line.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);
    if (tabbed.length > 1) return tabbed;
    return line.split(/\s{2,}|,\s*/).map((cell) => cell.trim()).filter(Boolean);
  });

  return rows.length ? rows : [["Text"], ["No readable text was found."]];
}

function renderTable(rows, notice) {
  const normalized = normalizeRows(rows);
  const head = normalized[0] || ["Column 1"];
  const body = normalized.slice(1);
  preview.innerHTML = "";

  if (notice) {
    const noticeElement = document.createElement("p");
    noticeElement.className = "notice";
    noticeElement.textContent = notice;
    preview.appendChild(noticeElement);
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  head.forEach((cell) => {
    const th = document.createElement("th");
    th.textContent = cell || " ";
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  body.slice(0, 200).forEach((row) => {
    const bodyTr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      bodyTr.appendChild(td);
    });
    tbody.appendChild(bodyTr);
  });
  table.appendChild(tbody);
  preview.appendChild(table);
}

function normalizeRows(rows) {
  const width = Math.max(1, ...rows.map((row) => row.length));
  return rows.map((row) => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next.map((cell) => String(cell ?? ""));
  });
}

async function rowsToJpeg(rows) {
  const normalized = normalizeRows(rows).slice(0, 80);
  const columnCount = normalized[0]?.length || 1;
  const cellWidth = 180;
  const rowHeight = 42;
  const padding = 32;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(6000, padding * 2 + columnCount * cellWidth);
  canvas.height = padding * 2 + normalized.length * rowHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "14px Arial";
  ctx.textBaseline = "middle";

  normalized.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const x = padding + columnIndex * cellWidth;
      const y = padding + rowIndex * rowHeight;
      ctx.fillStyle = rowIndex === 0 ? "#edf6f3" : "#ffffff";
      ctx.fillRect(x, y, cellWidth, rowHeight);
      ctx.strokeStyle = "#d8e3df";
      ctx.strokeRect(x, y, cellWidth, rowHeight);
      ctx.fillStyle = rowIndex === 0 ? "#07564b" : "#13201f";
      ctx.fillText(truncate(cell, 22), x + 10, y + rowHeight / 2);
    });
  });

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function setDownload(blob, filename) {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(blob);
  downloadLink.href = currentObjectUrl;
  downloadLink.download = filename;
  downloadLink.classList.remove("disabled");
}

function resetOutput() {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
  downloadLink.href = "#";
  downloadLink.classList.add("disabled");
  setStatus(selectedFile ? `Ready: ${selectedFile.name}` : "Select a conversion mode and upload a file.", 0);
}

function setStatus(message, progress) {
  statusText.textContent = message;
  progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

function assertExtension(file, extensions) {
  const name = file.name.toLowerCase();
  if (!extensions.some((extension) => name.endsWith(extension))) {
    throw new Error(`This mode expects: ${extensions.join(", ")}`);
  }
}

modeSelect.dispatchEvent(new Event("change"));

async function openEditablePdf(file) {
  try {
    assertExtension(file, [".pdf"]);
    setPdfStatus("Loading PDF pages...");
    resetPdfDownload();
    await loadPdfTools();

    pdfSourceName = file.name.replace(/\.pdf$/i, "-modified.pdf");
    pdfSourceBytes = await file.arrayBuffer();
    const pdfjsLib = await loadPdfRenderer();
    pdfDocumentProxy = await pdfjsLib.getDocument({ data: pdfSourceBytes.slice(0) }).promise;
    pdfPages = Array.from({ length: pdfDocumentProxy.numPages }, (_, index) => ({
      originalIndex: index,
      rotation: 0,
      removed: false,
      annotations: [],
      erasures: []
    }));

    await renderPdfPages();
    await openPdfPage(0);
    setPdfStatus(`${pdfDocumentProxy.numPages} page PDF ready to edit.`);
  } catch (error) {
    console.error(error);
    setPdfStatus(error.message || "Could not open this PDF.");
  }
}

async function renderPdfPages() {
  pdfPageList.innerHTML = "";

  if (!pdfPages.length) {
    pdfPageList.innerHTML = `<p class="empty">PDF pages will appear here.</p>`;
    return;
  }

  pdfPages.forEach((pageState, index) => {
    const card = document.createElement("article");
    card.className = `pdf-page-card${pageState.removed ? " removed" : ""}${index === activePdfPageIndex ? " active" : ""}`;

    const previewBox = document.createElement("div");
    previewBox.className = "pdf-page-preview editable";
    previewBox.textContent = "Rendering...";
    previewBox.addEventListener("click", (event) => handlePdfPageEdit(index, event));

    const meta = document.createElement("div");
    meta.className = "pdf-page-meta";
    meta.innerHTML = `<span>Page ${index + 1}</span><span>${pageState.rotation} deg</span>`;

    const actions = document.createElement("div");
    actions.className = "pdf-page-actions";
    actions.append(
      makePdfButton("Open", () => openPdfPage(index)),
      makePdfButton("Left", () => rotatePdfPage(index, -90)),
      makePdfButton("Right", () => rotatePdfPage(index, 90)),
      makePdfButton("Up", () => movePdfPage(index, -1)),
      makePdfButton("Down", () => movePdfPage(index, 1))
    );

    const removeButton = makePdfButton(pageState.removed ? "Keep" : "Delete", () => togglePdfPage(index));
    removeButton.classList.add("danger");
    actions.append(removeButton);

    card.append(previewBox, meta, actions);
    pdfPageList.appendChild(card);
    renderPageCanvas(pageState, previewBox);
  });
}

async function renderPageCanvas(pageState, previewBox) {
  try {
    const page = await pdfDocumentProxy.getPage(pageState.originalIndex + 1);
    const viewport = page.getViewport({ scale: 0.28, rotation: pageState.rotation });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    previewBox.textContent = "";
    previewBox.appendChild(canvas);
    renderEditMarkers(pageState, previewBox);
  } catch (error) {
    previewBox.textContent = "Preview unavailable";
  }
}

async function openPdfPage(index) {
  if (!pdfPages[index]) return;
  activePdfPageIndex = index;
  selectedDetectedText = null;
  pdfDetectedList.innerHTML = `<p class="empty">Click Detect Page Text to identify editable text.</p>`;
  await renderPdfPages();
  await renderOpenPdfPage();
}

async function renderOpenPdfPage() {
  openPageCanvas.innerHTML = "";

  if (activePdfPageIndex === null || !pdfPages[activePdfPageIndex]) {
    openPageTitle.textContent = "Open a page to edit";
    openPageCanvas.innerHTML = `<p class="empty">Choose a PDF, then click Open on a page.</p>`;
    return;
  }

  const pageState = pdfPages[activePdfPageIndex];
  openPageTitle.textContent = `Editing page ${activePdfPageIndex + 1}`;

  if (pageState.removed) {
    openPageCanvas.innerHTML = `<p class="empty">This page is marked for deletion. Restore it to edit.</p>`;
    return;
  }

  const page = await pdfDocumentProxy.getPage(pageState.originalIndex + 1);
  const viewport = page.getViewport({ scale: 1.35, rotation: pageState.rotation });
  const frame = document.createElement("div");
  frame.className = "open-page-frame";
  frame.addEventListener("click", (event) => handlePdfPageEdit(activePdfPageIndex, event));

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  frame.appendChild(canvas);
  renderEditMarkers(pageState, frame);
  openPageCanvas.appendChild(frame);
}

function renderEditMarkers(pageState, container) {
  if (selectedDetectedText && pageState === pdfPages[activePdfPageIndex]) {
    const marker = document.createElement("span");
    marker.className = "pdf-detected-marker";
    marker.style.left = `${selectedDetectedText.xRatio * 100}%`;
    marker.style.top = `${selectedDetectedText.yRatio * 100}%`;
    marker.style.width = `${selectedDetectedText.widthRatio * 100}%`;
    marker.style.height = `${selectedDetectedText.heightRatio * 100}%`;
    container.appendChild(marker);
  }

  pageState.annotations.forEach((annotation) => {
    const marker = document.createElement("span");
    marker.className = "pdf-text-marker";
    marker.textContent = annotation.text;
    marker.style.left = `${annotation.xRatio * 100}%`;
    marker.style.top = `${annotation.yRatio * 100}%`;
    marker.style.color = annotation.color;
    container.appendChild(marker);
  });
  pageState.erasures.forEach((erasure) => {
    const marker = document.createElement("span");
    marker.className = "pdf-erase-marker";
    marker.style.left = `${erasure.xRatio * 100}%`;
    marker.style.top = `${erasure.yRatio * 100}%`;
    marker.style.width = `${erasure.widthRatio * 100}%`;
    marker.style.height = `${erasure.heightRatio * 100}%`;
    container.appendChild(marker);
  });
}

function makePdfButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function rotatePdfPage(index, amount) {
  pdfPages[index].rotation = normalizeRotation(pdfPages[index].rotation + amount);
  resetPdfDownload();
  await renderPdfPages();
  if (index === activePdfPageIndex) await renderOpenPdfPage();
  setPdfStatus("Rotation updated. Save the PDF when you are ready.");
}

async function movePdfPage(index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= pdfPages.length) return;
  const [page] = pdfPages.splice(index, 1);
  pdfPages.splice(nextIndex, 0, page);
  if (activePdfPageIndex === index) {
    activePdfPageIndex = nextIndex;
  } else if (activePdfPageIndex === nextIndex) {
    activePdfPageIndex = index;
  }
  resetPdfDownload();
  await renderPdfPages();
  await renderOpenPdfPage();
  setPdfStatus("Page order updated. Save the PDF when you are ready.");
}

async function togglePdfPage(index) {
  pdfPages[index].removed = !pdfPages[index].removed;
  resetPdfDownload();
  await renderPdfPages();
  if (index === activePdfPageIndex) await renderOpenPdfPage();
  setPdfStatus(pdfPages[index].removed ? "Page marked for deletion." : "Page restored.");
}

async function handlePdfPageEdit(index, event) {
  if (pdfEditMode.value === "erase-text") {
    await addPdfEraseAt(index, event);
    return;
  }

  await addPdfTextAt(index, event);
}

async function addPdfTextAt(index, event) {
  const text = pdfTextInput.value.trim();
  if (!text) {
    setPdfStatus("Type text first, then click the PDF page where it should go.");
    return;
  }

  if (!pdfPages[index] || pdfPages[index].removed) {
    setPdfStatus("Restore this page before adding text to it.");
    return;
  }

  const bounds = event.currentTarget.getBoundingClientRect();
  pdfPages[index].annotations.push({
    text,
    xRatio: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    yRatio: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    size: clamp(Number(pdfFontSizeInput.value) || 14, 6, 72),
    color: pdfTextColorInput.value,
    cover: pdfCoverToggle.checked
  });

  resetPdfDownload();
  await renderPdfPages();
  if (index === activePdfPageIndex) await renderOpenPdfPage();
  setPdfStatus("Text added. Save the PDF when you are ready.");
}

async function addPdfEraseAt(index, event) {
  if (!pdfPages[index] || pdfPages[index].removed) {
    setPdfStatus("Restore this page before removing text from it.");
    return;
  }

  const bounds = event.currentTarget.getBoundingClientRect();
  const widthPx = clamp(Number(pdfEraseWidthInput.value) || 160, 10, 600);
  const heightPx = clamp(Number(pdfEraseHeightInput.value) || 24, 6, 200);
  pdfPages[index].erasures.push({
    xRatio: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    yRatio: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    widthRatio: clamp(widthPx / bounds.width, 0.01, 1),
    heightRatio: clamp(heightPx / bounds.height, 0.01, 1)
  });

  resetPdfDownload();
  await renderPdfPages();
  if (index === activePdfPageIndex) await renderOpenPdfPage();
  setPdfStatus("Text area covered. Save the PDF when you are ready.");
}

async function undoLastPdfText() {
  for (let index = pdfPages.length - 1; index >= 0; index -= 1) {
    if (pdfPages[index].annotations?.length) {
      pdfPages[index].annotations.pop();
      resetPdfDownload();
      await renderPdfPages();
      if (index === activePdfPageIndex) await renderOpenPdfPage();
      setPdfStatus("Last text edit removed.");
      return;
    }
  }

  setPdfStatus("There is no text edit to undo.");
}

async function undoLastPdfErase() {
  for (let index = pdfPages.length - 1; index >= 0; index -= 1) {
    if (pdfPages[index].erasures?.length) {
      pdfPages[index].erasures.pop();
      resetPdfDownload();
      await renderPdfPages();
      if (index === activePdfPageIndex) await renderOpenPdfPage();
      setPdfStatus("Last removed text area restored.");
      return;
    }
  }

  setPdfStatus("There is no removed text area to undo.");
}

async function detectOpenPageText() {
  if (activePdfPageIndex === null || !pdfPages[activePdfPageIndex]) {
    setPdfStatus("Open a PDF page first.");
    return;
  }

  try {
    setPdfStatus("Detecting text on the open page...");
    const pageState = pdfPages[activePdfPageIndex];
    const page = await pdfDocumentProxy.getPage(pageState.originalIndex + 1);
    const pdfjsLib = await loadPdfRenderer();
    const viewport = page.getViewport({ scale: 1, rotation: pageState.rotation });
    const content = await page.getTextContent();

    pageState.detectedText = content.items
      .map((item, detectedIndex) => textItemToDetection(item, detectedIndex, viewport, pdfjsLib, content.styles))
      .filter((item) => item.text);

    selectedDetectedText = null;
    renderDetectedTextList();
    setPdfStatus(pageState.detectedText.length ? "Select detected text to replace or remove." : "No embedded text was detected on this page.");
  } catch (error) {
    console.error(error);
    setPdfStatus("Could not detect text on this page.");
  }
}

function textItemToDetection(item, detectedIndex, viewport, pdfjsLib, styles) {
  const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const fontHeight = Math.hypot(transform[2], transform[3]) || Math.abs(transform[3]) || 12;
  const width = Math.max(8, item.width * viewport.scale);
  const x = transform[4];
  const baselineY = transform[5];
  const centerY = baselineY - fontHeight / 2;
  const fontInfo = getDetectedFontInfo(item, styles);
  const text = item.str.trim();

  return {
    id: `${activePdfPageIndex}-${detectedIndex}`,
    text,
    xRatio: clamp(x / viewport.width, 0, 1),
    yRatio: clamp(centerY / viewport.height, 0, 1),
    widthRatio: clamp((width + 8) / viewport.width, 0.01, 1),
    heightRatio: clamp((fontHeight * 1.4) / viewport.height, 0.01, 1),
    size: clamp(Math.round(fontHeight), 6, 72),
    fontName: fontInfo.name,
    fontFamily: fontInfo.family,
    fontWeight: fontInfo.weight,
    fontStyle: fontInfo.style,
    type: classifyDetectedText(text, fontHeight)
  };
}

function getDetectedFontInfo(item, styles) {
  const style = styles?.[item.fontName] || {};
  const rawName = `${style.fontFamily || item.fontName || "PDF font"}`;
  const normalized = rawName.toLowerCase();

  return {
    name: item.fontName || "Unknown",
    family: rawName.replace(/^["']|["']$/g, ""),
    weight: normalized.includes("bold") || normalized.includes("black") ? "bold" : "regular",
    style: normalized.includes("italic") || normalized.includes("oblique") ? "italic" : "normal"
  };
}

function classifyDetectedText(text, fontHeight) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "email";
  if (/https?:\/\/|www\./i.test(text)) return "link";
  if (/^\+?[\d\s().-]{7,}$/.test(text)) return "phone";
  if (/[$€£₦]\s?\d|^\d+([.,]\d{2})?$/.test(text)) return "amount";
  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/.test(text)) return "date";
  if (/^\d+([.,]\d+)?$/.test(text)) return "number";
  if (fontHeight >= 20 || (text.length < 50 && text === text.toUpperCase() && /[A-Z]/.test(text))) return "title";
  if (text.endsWith(":")) return "label";
  return "body";
}

function renderDetectedTextList() {
  const pageState = pdfPages[activePdfPageIndex];
  pdfDetectedList.innerHTML = "";

  if (!pageState?.detectedText?.length) {
    pdfDetectedList.innerHTML = `<p class="empty">No detected text yet.</p>`;
    return;
  }

  pageState.detectedText.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `detected-item${selectedDetectedText?.id === item.id ? " selected" : ""}`;
    button.innerHTML = `
      <span class="detected-text-value">${escapeHtml(item.text)}</span>
      <span class="detected-meta">${escapeHtml(item.type)} · ${item.size}px · ${escapeHtml(item.fontFamily)} · ${escapeHtml(item.fontWeight)}${item.fontStyle !== "normal" ? ` · ${escapeHtml(item.fontStyle)}` : ""}</span>
    `;
    button.addEventListener("click", async () => {
      selectedDetectedText = item;
      pdfReplaceInput.value = item.text;
      if (pdfAutoStyleToggle.checked) applyDetectedStyle(item);
      renderDetectedTextList();
      await renderOpenPdfPage();
      setPdfStatus(`Selected ${item.type} text. Replacement will match its detected style.`);
    });
    pdfDetectedList.appendChild(button);
  });
}

function applyDetectedStyle(item) {
  pdfFontSizeInput.value = item.size;
  pdfCoverToggle.checked = true;
}

async function replaceSelectedDetectedText() {
  if (!selectedDetectedText || activePdfPageIndex === null) {
    setPdfStatus("Select detected text first.");
    return;
  }

  const replacement = pdfReplaceInput.value.trim();
  if (!replacement) {
    setPdfStatus("Type replacement text first.");
    return;
  }

  const pageState = pdfPages[activePdfPageIndex];
  pageState.erasures.push({
    xRatio: selectedDetectedText.xRatio,
    yRatio: selectedDetectedText.yRatio,
    widthRatio: selectedDetectedText.widthRatio,
    heightRatio: selectedDetectedText.heightRatio
  });
  pageState.annotations.push({
    text: replacement,
    xRatio: selectedDetectedText.xRatio,
    yRatio: selectedDetectedText.yRatio,
    size: pdfAutoStyleToggle.checked ? selectedDetectedText.size : clamp(Number(pdfFontSizeInput.value) || selectedDetectedText.size, 6, 72),
    color: pdfTextColorInput.value,
    fontWeight: selectedDetectedText.fontWeight,
    fontStyle: selectedDetectedText.fontStyle,
    detectedType: selectedDetectedText.type,
    cover: false
  });

  resetPdfDownload();
  await renderPdfPages();
  await renderOpenPdfPage();
  setPdfStatus("Selected text replaced. Save the PDF when you are ready.");
}

async function removeSelectedDetectedText() {
  if (!selectedDetectedText || activePdfPageIndex === null) {
    setPdfStatus("Select detected text first.");
    return;
  }

  pdfPages[activePdfPageIndex].erasures.push({
    xRatio: selectedDetectedText.xRatio,
    yRatio: selectedDetectedText.yRatio,
    widthRatio: selectedDetectedText.widthRatio,
    heightRatio: selectedDetectedText.heightRatio
  });

  resetPdfDownload();
  await renderPdfPages();
  await renderOpenPdfPage();
  setPdfStatus("Selected text removed. Save the PDF when you are ready.");
}

async function saveModifiedPdf() {
  if (!pdfSourceBytes || !pdfPages.length) {
    setPdfStatus("Choose a PDF first.");
    return;
  }

  try {
    setPdfStatus("Building modified PDF...");
    await loadPdfTools();
    const sourcePdf = await PDFDocument.load(pdfSourceBytes.slice(0));
    const outputPdf = await PDFDocument.create();
    const font = await outputPdf.embedFont(StandardFonts.Helvetica);
    const activePages = pdfPages.filter((page) => !page.removed);

    if (!activePages.length) {
      setPdfStatus("Keep at least one page before saving.");
      return;
    }

    for (const pageState of activePages) {
      const [copiedPage] = await outputPdf.copyPages(sourcePdf, [pageState.originalIndex]);
      const existingRotation = copiedPage.getRotation().angle || 0;
      copiedPage.setRotation(degrees(normalizeRotation(existingRotation + pageState.rotation)));
      drawPageErasures(copiedPage, pageState);
      drawPageAnnotations(copiedPage, pageState, font);
      outputPdf.addPage(copiedPage);
    }

    const bytes = await outputPdf.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    pdfObjectUrl = URL.createObjectURL(blob);
    pdfDownloadLink.href = pdfObjectUrl;
    pdfDownloadLink.download = pdfSourceName;
    pdfDownloadLink.classList.remove("disabled");
    setPdfStatus("Modified PDF is ready to download.");
  } catch (error) {
    console.error(error);
    setPdfStatus(error.message || "Could not save this PDF.");
  }
}

function drawPageErasures(page, pageState) {
  const { width, height } = page.getSize();
  pageState.erasures.forEach((erasure) => {
    const eraseWidth = erasure.widthRatio * width;
    const eraseHeight = erasure.heightRatio * height;
    const x = erasure.xRatio * width;
    const y = height - erasure.yRatio * height - eraseHeight / 2;

    page.drawRectangle({
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.min(width - x, eraseWidth),
      height: eraseHeight,
      color: rgb(1, 1, 1)
    });
  });
}

function drawPageAnnotations(page, pageState, font) {
  const { width, height } = page.getSize();
  pageState.annotations.forEach((annotation) => {
    const size = annotation.size;
    const x = annotation.xRatio * width;
    const y = height - annotation.yRatio * height;
    const textWidth = Math.max(80, font.widthOfTextAtSize(annotation.text, size) + 10);
    const textHeight = size * 1.45;

    if (annotation.cover) {
      page.drawRectangle({
        x: Math.max(0, x - 4),
        y: Math.max(0, y - 4),
        width: Math.min(width - x, textWidth),
        height: textHeight,
        color: rgb(1, 1, 1)
      });
    }

    page.drawText(annotation.text, {
      x,
      y,
      size,
      font,
      color: hexToRgb(annotation.color)
    });
  });
}

function resetPdfEditor() {
  pdfEditInput.value = "";
  pdfSourceBytes = null;
  pdfPages = [];
  pdfDocumentProxy = null;
  activePdfPageIndex = null;
  resetPdfDownload();
  pdfPageList.innerHTML = `<p class="empty">PDF pages will appear here.</p>`;
  openPageTitle.textContent = "Open a page to edit";
  openPageCanvas.innerHTML = `<p class="empty">Choose a PDF, then click Open on a page.</p>`;
  setPdfStatus("Select a PDF to start editing.");
}

function resetPdfDownload() {
  if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
  pdfObjectUrl = null;
  pdfDownloadLink.href = "#";
  pdfDownloadLink.classList.add("disabled");
}

function setPdfStatus(message) {
  pdfStatusText.textContent = message;
}

function normalizeRotation(value) {
  return ((value % 360) + 360) % 360;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const red = parseInt(clean.slice(0, 2), 16) / 255;
  const green = parseInt(clean.slice(2, 4), 16) / 255;
  const blue = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
