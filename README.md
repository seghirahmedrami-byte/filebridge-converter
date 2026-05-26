# FileBridge Converter

A browser-based PDF, JPEG, and Excel tool.

## Features

- Convert PDF text to Excel
- Convert JPEG images to Excel with OCR
- Convert Excel or CSV files to PDF
- Convert Excel or CSV files to JPEG
- Open and edit PDF pages
- Rotate, delete, and reorder PDF pages
- Add text to PDFs
- Cover/remove text areas
- Detect embedded PDF text and replace or remove it with matched style metadata
- Generate short vertical videos from a topic with script/storyboard, captions, animation, and WebM export

## Run Locally

```bash
npm install
npm start
```

Then open:

```text
http://127.0.0.1:8123/
```

The app runs in the browser. For GitHub Pages or other static hosting, the app falls back to CDN libraries.

## Optional OpenAI Storyboard API

ShortForge Studio can call a local backend route for AI storyboard generation.

```bash
set OPENAI_API_KEY=your_key_here
npm start
```

Without `OPENAI_API_KEY`, the video studio falls back to its local script generator.
