# Cypher - Modern Local AI Interface

A chat interface built for local LLMs running via **Ollama**, specifically configured for **Qwen 3.5 9B** with deep **Think Mode** support.

---

## Features

- **Qwen 3.5 9B Native Integration**: Pre-configured to communicate directly with Ollama's local REST API (`/api/chat` and `/api/tags`).
- **Live "Think Mode" (Reasoning Blocks)**:
  - Dynamic streaming extraction of the model's internal step-by-step reasoning tokens (`message.thinking` or `<think>...</think>`).
  - Collapsible Thought Process panel with character count and copy support.
  - Dedicated toggle switch in the header and input bar.
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
