# Cypher - Modern Local AI Interface

A sleek, precision dark-themed chat interface built for local LLMs running via **Ollama**, specifically configured for **Qwen 3.5 9B** with deep **Think Mode** support.

Designed with a high-end, distraction-free aesthetic (neutral graphite, deep obsidian, clean typography), avoiding generic design clichés.

---

## Architecture & Workflow

<<<<<<< HEAD
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
=======
Cypher combines local model inference with private, privacy-respecting metasearch and deterministic webpage extraction. When Web Search is enabled, queries pass through a multi-stage pipeline designed around Qwen's context budget before generating an answer with verified citations.

```mermaid
flowchart TD
    User([User Query]) --> CheckSearch{Web Search Enabled?}
    
    %% Direct Path
    CheckSearch -- No --> OllamaDirect[Direct Ollama Query /api/chat]
    OllamaDirect --> StreamAnswer[Stream Final Answer]

    %% Web Search Pipeline
    CheckSearch -- Yes --> Stage1[Stage 1: Qwen Heading Generation<br/>Date-aware search query]
    Stage1 --> Stage2[Stage 2: SearXNG Search Query<br/>Retrieve up to 10 results]
    Stage2 --> FilterRank[Deduplication & Relevance Ranking<br/>Select best 5–8 results]
    FilterRank --> Extractor[Webpage Content Extractor<br/>Pool Concurrency: 3 | SSRF Guard]
    
    subgraph ExtractionStage [Content Extraction & Normalization]
        direction TB
        SSRF[SSRF & Security Validation] --> SafeFetch[Safe HTTP Fetch / Size Limit 2MB]
        SafeFetch --> Parser[Mozilla Readability + LinkeDOM]
        SafeFetch --> GitHub[GitHub Raw README Extraction]
        Parser --> Scoring[Deterministic Section Scoring & Budgeting]
        GitHub --> Scoring
    end
    
    Extractor --> ExtractionStage
    Scoring --> Stage3Prompt[Stage 3: Augmented Prompt Synthesis<br/>Retrieved excerpts, code blocks, source IDs]
    Stage3Prompt --> QwenStage3[Qwen 3.5 9B Answer Generation]
    QwenStage3 --> StreamAnswer
```

---

## Key Features

### 1. Local AI Integration
- **Ollama Integration**: Communicates directly with the local Ollama daemon (`/api/chat`, `/api/tags`).
- **Qwen 3.5 9B Native Support**: Tailored to leverage Qwen's instruction following and reasoning capabilities.
- **Streaming Responses**: Token-by-token streaming with live generation metrics (tokens/sec, evaluation time, token count).
- **Think Mode (Reasoning Blocks)**:
  - Dynamic streaming and parsing of internal step-by-step reasoning tokens (`message.thinking` or `<think>...</think>`).
  - Sleek collapsible Thought Process panel with execution timers and one-click copy.
  - Independent toggle switches on both header and chat input.

### 2. Intelligent Web Search Workflow
- **Independent Controls**: Web Search and Think Mode operate independently or simultaneously.
- **Stage 1 – Date-Aware Search Heading Generation**:
  - The user query is first sent to Qwen with a dedicated query generator instruction.
  - Automatically incorporates temporal modifiers (such as "latest" when no date is supplied, or preserves explicit years/dates).
- **Stage 2 – SearXNG Metasearch**:
  - Queries local SearXNG instance (`http://127.0.0.1:8080`) requesting up to 10 results across privacy-respecting search engines.
- **Deduplication & Relevance Ranking**:
  - URL normalization strips tracking parameters (`utm_*`, `fbclid`, etc.) and removes duplicates.
  - Relevance ranking prioritizes technical documentation, GitHub repositories, developer blogs, tutorials, and working code.
  - Penalizes generic news portals, tabloid aggregators, and results matching only filler words.
  - Selects the best 5–8 results (preferring 4 high-relevance results over filling quotas).

### 3. Webpage Content Extraction
- **Full Content Retrieval**: Moves beyond search snippets by retrieving actual webpage text, headings, lists, tables, and formatted code blocks (`<pre><code>`).
- **Mozilla Readability & LinkeDOM**: Lightweight, memory-efficient DOM parsing in Node.js without the overhead of headless browsers or Python scrapers.
- **Specialized Handling**:
  - **GitHub Repositories**: Directly extracts raw README markdown (`raw.githubusercontent.com`), preserving installation steps (`pip install`, `npm i`) and usage examples.
  - **Documentation & Tutorials**: Preserves function signatures, parameter tables, and implementation steps.
- **Deterministic Programmatic Scoring**:
  - Scores sections based on keyword density, presence of code, API definitions, and dates without making additional expensive LLM calls.
  - Enforces per-page (6,000 characters) and total content budgets (6,000 characters total across up to 5 sources) to fit Qwen's 4096-token context window.

### 4. AI Answer Generation & Genuine Citations
- **Stage 3 Synthesis**:
  - Qwen receives the original user question, generated search heading, excerpts, extracted webpage content, and source identifiers (`[S1]`, `[S2]`).
  - Instructed to analyze retrieved information rather than blindly copying code or inventing facts.
- **Genuine Source Attribution**:
  - Source identifiers in generated markdown (`[S1]`, `[S2]`) automatically resolve to genuine SearXNG URLs.
  - Source cards display original title, domain, engine, published date, and extraction status badges (`Extracted`, `Unavailable`, `Failed`).

### 5. Security & Performance
- **SSRF Protection**: Outbound requests are strictly guarded against Server-Side Request Forgery:
  - Only HTTP and HTTPS protocols allowed.
  - Rejects `localhost`, `.local`, `.internal`, and embedded URL credentials (`user:pass@`).
  - DNS resolution validation before connection: blocks loopback (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), CGNAT, and reserved IP ranges.
  - Restricted internal application ports (`11434`, `8080`, `3001`, `5173`).
  - Manual redirect inspection with a maximum limit of 3 hops.
- **Performance Limits**:
  - Concurrency pool: at most 3 simultaneous webpage fetch requests.
  - Fetch timeout: 10 seconds per request.
  - Download cap: 2 MB response stream limit per webpage.

---

## Configuration

Resource limits and search extraction behavior are centrally configured in [`server/searchConfig.ts`](file:///home/sidharth/Documents/cypher/server/searchConfig.ts):

| Setting | Default | Description |
| :--- | :--- | :--- |
| `initialSearchResults` | `10` | Maximum candidate results retrieved from SearXNG |
| `maxSelectedSearchResults` | `8` | Maximum ranked search results chosen for extraction |
| `concurrentWebpageRequests` | `3` | Concurrency limit for fetching webpages |
| `requestTimeoutMs` | `10000` | Fetch request timeout (in milliseconds) |
| `maxDownloadedHtmlBytes` | `2097152` | Download stream limit per page (2 MB) |
| `maxExtractedCharsPerPage` | `6000` | Maximum readable characters extracted per webpage |
| `maxSourcesPassedToQwen` | `5` | Maximum sources with extracted content sent to Qwen |
| `totalExtractedContentBudgetChars` | `6000` | Global extracted content character budget |
| `maxRedirectHops` | `3` | Maximum HTTP redirect hops permitted with SSRF re-check |

Environment variables (optional):
- `PORT`: Backend server port (default: `3001`).
- `OLLAMA_URL`: Ollama endpoint (default: `http://127.0.0.1:11434`).
- `SEARXNG_URL`: SearXNG instance URL (default: `http://127.0.0.1:8080`).
>>>>>>> 3da935c (docs: Update README with intelligent web search, extraction architecture, and security documentation)

---

## Getting Started

### 1. Prerequisites

1. **Ollama & Qwen 3.5 9B**:
   Ensure Ollama is running and has `qwen3.5:9b` downloaded:
   ```bash
   ollama pull qwen3.5:9b
   ollama serve
   ```

2. **SearXNG (Docker)**:
   Ensure SearXNG is running locally with JSON format enabled (`http://127.0.0.1:8080`):
   ```bash
   docker run -d -p 8080:8080 -v /path/to/searxng:/etc/searxng searxng/searxng
   ```

### 2. Installation

Clone the repository and install dependencies:

```bash
cd cypher
npm install
```

### 3. Run Cypher

Launch both the Express backend and Vite frontend concurrently:

```bash
npm run dev
```

Open your browser at:
```
http://localhost:5173
```

---

## Tech Stack

<<<<<<< HEAD
- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide Icons, Custom Markdown Theme
- **Backend / Engine**: Ollama REST API (`/api/chat`, `/api/tags`) with HTTP streaming (NDJSON)
=======
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, KaTeX (`rehype-katex`, `remark-math`, `remark-gfm`).
- **Backend**: Express 5, TypeScript (`tsx`), Server-Sent Events (SSE).
- **Search & Extraction**: SearXNG, `@mozilla/readability`, `linkedom`.
- **Inference Engine**: Ollama REST API (`qwen3.5:9b`).
>>>>>>> 3da935c (docs: Update README with intelligent web search, extraction architecture, and security documentation)
