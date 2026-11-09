# Cypher - Modern Local AI Interface

A sleek, precision dark-themed chat interface built for local LLMs running via **Ollama**, specifically configured for **Qwen 3.5 9B** with deep **Think Mode** support.

Designed with a high-end, distraction-free aesthetic (neutral graphite, deep obsidian, clean typography) — strictly avoiding generic cliché AI gradients.

---

## Features

- **Qwen 3.5 9B Native Integration**: Pre-configured to communicate directly with Ollama's local REST API (`/api/chat` and `/api/tags`).
- **Live "Think Mode" (Reasoning Blocks)**:
  - Dynamic streaming extraction of the model's internal step-by-step reasoning tokens (`message.thinking` or `<think>...</think>`).
  - Sleek collapsible Thought Process panel with character count and one-click copy.
  - Dedicated toggle switch right on the top header and input bar.
- **Precision Dark UI**:
  - Deep obsidian (`#090a0c`) and dark graphite (`#121418`) theme with subtle borders.
  - Code syntax highlighting with one-click copy and language tags.
  - Token generation performance metrics (tokens/sec, total duration, tokens generated).
  - Stop generation support (`AbortController`).
- **Zero-Config CORS Proxy**:
  - Vite dev server automatically proxies `/ollama-api` requests directly to `http://127.0.0.1:11434`, eliminating browser CORS issues out-of-the-box.
- **Model Detection & Settings**:
  - Auto-detects installed Ollama models (`qwen3.5:9b`, `qwen3.5:4b`, etc.).
  - Sampling temperature slider (0.0 to 1.5).
  - Custom system prompt support.

---

## Getting Started

### 1. Ensure Ollama is running

If Ollama is already running in the background, you're all set! If you need to launch it manually:

```bash
OLLAMA_MODELS=/usr/share/ollama/.ollama/models ollama serve
```

### 2. Run the Web App

In the project directory:

```bash
npm run dev
```

Open your browser at:
```
http://localhost:5173
```

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide Icons, Custom Markdown Theme
- **Backend / Engine**: Ollama REST API (`/api/chat`, `/api/tags`) with HTTP streaming (NDJSON)
