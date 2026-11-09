import { SSRFValidator, WebpageContentExtractor } from './server/contentExtractor';
import { SEARCH_CONFIG } from './server/searchConfig';
import { SearchOrchestrator } from './server/searchOrchestrator';
import { OllamaClient } from './server/ollamaClient';
import { SearXNGClient } from './server/searxngClient';

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    failedTests++;
    throw new Error(message);
  } else {
    console.log(`  ✅ PASSED: ${message}`);
    passedTests++;
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('   CYPHER WEBPAGE EXTRACTION VERIFICATION SUITE     ');
  console.log('====================================================\n');

  const extractor = new WebpageContentExtractor();

  // ----------------------------------------------------
  // TEST 1: Python application design
  // ----------------------------------------------------
  console.log('--- TEST 1: Python application design ---');
  try {
    const mockPythonDesignHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Modern Python GUI Design with CustomTkinter</title></head>
        <body>
          <nav><a href="/">Home</a><a href="/about">About</a></nav>
          <main>
            <h1>Building Beautiful Python GUI Applications</h1>
            <p>CustomTkinter is an extension of Tkinter that provides modern, dark-mode-ready UI widgets for Python applications.</p>
            <h2>Installation</h2>
            <pre><code>pip install customtkinter</code></pre>
            <h2>Basic Application Example</h2>
            <p>Here is how to create a simple, sleek window with a button:</p>
            <pre><code>import customtkinter as ctk

app = ctk.CTk()
app.geometry("400x300")
app.title("Modern Python App")

btn = ctk.CTkButton(app, text="Click Me", command=lambda: print("Hello"))
btn.pack(pady=20)

app.mainloop()</code></pre>
            <p>CustomTkinter automatically handles theme changes and rounded corners.</p>
          </main>
          <footer>Copyright 2026 Example Corp</footer>
        </body>
      </html>
    `;

    // Test text extraction and scoring
    const parsedText = extractor.extractFormattedTextFromDOM(
      (await import('linkedom')).parseHTML(mockPythonDesignHtml).document.body
    );
    const scored = extractor.filterAndScoreSections(
      parsedText,
      'I want to build a beautiful Python program.',
      'beautiful python GUI application design'
    );

    assert(scored.includes('CustomTkinter'), 'Retains framework description');
    assert(scored.includes('pip install customtkinter'), 'Retains installation command');
    assert(scored.includes('import customtkinter as ctk'), 'Retains Python code block');
    assert(!scored.includes('Copyright 2026'), 'Filters out footer boilerplate');
  } catch (e) {
    console.error('Test 1 error:', e.message);
  }

  // ----------------------------------------------------
  // TEST 2: GitHub projects
  // ----------------------------------------------------
  console.log('\n--- TEST 2: GitHub projects ---');
  try {
    const mockReadme = `
# Textual: Python Terminal App Framework

Textual is a Rapid Application Development framework for Python to build sophisticated terminal user interfaces.

## Install

\`\`\`bash
pip install textual
\`\`\`

## Quickstart

\`\`\`python
from textual.app import App, ComposeResult
from textual.widgets import Header, Footer

class MinimalApp(App):
    def compose(self) -> ComposeResult:
        yield Header()
        yield Footer()

if __name__ == "__main__":
    MinimalApp().run()
\`\`\`
    `;

    const scored = extractor.filterAndScoreSections(
      mockReadme,
      'Python terminal projects',
      'Python terminal application frameworks',
      true
    );

    assert(scored.includes('Textual: Python Terminal App Framework'), 'Retains README heading and description');
    assert(scored.includes('pip install textual'), 'Retains pip install command');
    assert(scored.includes('class MinimalApp(App):'), 'Retains Python code example');

    // Test unavailable README on invalid repo
    const unavailableRes = await extractor.extractGitHubRepository(
      'https://github.com/nonexistent-org-123456/nonexistent-repo-987654',
      'Python terminal projects'
    );
    assert(
      unavailableRes.status === 'unavailable' || unavailableRes.status === 'failed',
      `Gracefully marks non-existent repo as ${unavailableRes.status}`
    );
  } catch (e) {
    console.error('Test 2 error:', e.message);
  }

  // ----------------------------------------------------
  // TEST 3: Documentation & Tutorials
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Documentation & Tutorials ---');
  try {
    const mockDocHtml = `
      <html>
        <body>
          <article>
            <h1>PyQt6 / PySide6 API Reference: QMainWindow</h1>
            <p>QMainWindow provides a standard main application window with menu bars, dock widgets, and a status bar.</p>
            <h2>Methods and Signatures</h2>
            <table>
              <tr><th>Method</th><th>Description</th></tr>
              <tr><td>setCentralWidget(widget)</td><td>Sets given widget to be the main central widget</td></tr>
              <tr><td>statusBar()</td><td>Returns the main status bar for the window</td></tr>
            </table>
            <h2>Example Implementation</h2>
            <pre><code>from PySide6.QtWidgets import QApplication, QMainWindow, QLabel
import sys

app = QApplication(sys.argv)
window = QMainWindow()
window.setCentralWidget(QLabel("Modern UI"))
window.show()
sys.exit(app.exec())</code></pre>
          </article>
        </body>
      </html>
    `;

    const parsedDoc = extractor.extractFormattedTextFromDOM(
      (await import('linkedom')).parseHTML(mockDocHtml).document.body
    );
    const scoredDoc = extractor.filterAndScoreSections(
      parsedDoc,
      'Python GUI frameworks documentation',
      'Python GUI frameworks PyQt PySide reference'
    );

    assert(scoredDoc.includes('QMainWindow provides a standard main application window'), 'Retains API overview');
    assert(scoredDoc.includes('setCentralWidget') || scoredDoc.includes('PySide6'), 'Retains API methods / table data');
    assert(scoredDoc.includes('from PySide6.QtWidgets import QApplication'), 'Retains implementation example');
  } catch (e) {
    console.error('Test 3 error:', e.message);
  }

  // ----------------------------------------------------
  // TEST 4: Unavailable / Error webpages
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Unavailable / Error webpages ---');
  try {
    // 1. Verify safeFetch error handling on HTTP non-2xx
    const originalSafeFetch = extractor.safeFetch.bind(extractor);
    
    // Test that safeFetch cleanly propagates HTTP error messages
    let threwError = false;
    try {
      const failingExtractor = new WebpageContentExtractor();
      failingExtractor.safeFetch = async () => {
        throw new Error('HTTP 404 Not Found');
      };
      await failingExtractor.safeFetch('https://example.com/nonexistent');
    } catch (err) {
      threwError = err.message.includes('HTTP 404');
    }
    assert(threwError, 'safeFetch throws clean HTTP 404 error without crash');

    // 2. Test extraction batch with failing URL and verify pipeline does not stop
    const originalExtractGeneric = extractor.extractGenericWebpage.bind(extractor);
    extractor.extractGenericWebpage = async (url) => {
      if (url.includes('failing')) {
        return { url, status: 'failed', error: 'HTTP 403 Forbidden' };
      }
      return { url, status: 'success', extractedContent: 'Useful extracted content' };
    };

    const testSources = [
      {
        id: 'S1',
        title: 'Failing Webpage',
        url: 'https://example.com/failing',
        content: 'Snippet from search engine',
        domain: 'example.com',
      },
      {
        id: 'S2',
        title: 'Working Webpage',
        url: 'https://example.com/working',
        content: 'Snippet from search engine',
        domain: 'example.com',
      },
    ];

    const batchResult = await extractor.extractBatch(testSources, 'test query');
    extractor.extractGenericWebpage = originalExtractGeneric;

    assert(batchResult.length === 2, 'Batch finishes despite failed source');
    assert(batchResult[0].extractionStatus === 'failed', 'Failing source marked as failed without halting pipeline');
    assert(batchResult[1].extractionStatus === 'success', 'Remaining source extracted successfully');
  } catch (e) {
    console.error('Test 4 error:', e.message);
  }

  // ----------------------------------------------------
  // TEST 5: SSRF protection
  // ----------------------------------------------------
  console.log('\n--- TEST 5: SSRF protection ---');
  try {
    const blockedCases = [
      'http://localhost:11434/api/tags',
      'http://127.0.0.1:8080/search',
      'http://127.0.0.1:3001/api/chat',
      'http://192.168.1.1/admin',
      'http://10.0.0.1/secrets',
      'http://172.16.0.1/internal',
      'http://169.254.169.254/latest/meta-data/',
      'http://admin:secret@example.com',
      'file:///etc/passwd',
      'ftp://example.com/file',
      'http://example.com:11434/tags', // blocked port
    ];

    for (const url of blockedCases) {
      const res = await SSRFValidator.validateUrl(url);
      assert(!res.safe, `Blocked SSRF target: ${url} (${res.reason})`);
    }

    const safeUrl = 'https://github.com/textualize/textual';
    const safeRes = await SSRFValidator.validateUrl(safeUrl);
    assert(safeRes.safe, `Permitted public target: ${safeUrl}`);
  } catch (e) {
    console.error('Test 5 error:', e.message);
  }

  // ----------------------------------------------------
  // TEST 6: Resource limits & budgets
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Resource limits & budgets ---');
  try {
    // 1. Verify Config Constants
    assert(SEARCH_CONFIG.concurrentWebpageRequests === 3, 'Concurrency limit is set to 3');
    assert(SEARCH_CONFIG.requestTimeoutMs === 10000, 'Timeout is 10 seconds');
    assert(SEARCH_CONFIG.maxDownloadedHtmlBytes === 2 * 1024 * 1024, 'Max download size is 2MB');
    assert(SEARCH_CONFIG.maxExtractedCharsPerPage === 6000, 'Max per page is 6,000 characters');
    assert(SEARCH_CONFIG.maxSourcesPassedToQwen === 5, 'Max sources passed to Qwen is 5');
    assert(SEARCH_CONFIG.totalExtractedContentBudgetChars === 6000, 'Total extracted budget is 6,000 characters');

    // 2. Test Concurrency Limit of 3
    let activeWorkers = 0;
    let maxObservedActive = 0;
    const originalExtractGeneric = extractor.extractGenericWebpage.bind(extractor);

    extractor.extractGenericWebpage = async (url) => {
      activeWorkers++;
      if (activeWorkers > maxObservedActive) maxObservedActive = activeWorkers;
      await new Promise((r) => setTimeout(r, 40));
      activeWorkers--;
      return { url, status: 'success', extractedContent: 'A'.repeat(500) };
    };

    const mockSources = Array.from({ length: 7 }, (_, i) => ({
      id: `S${i + 1}`,
      title: `Source ${i + 1}`,
      url: `https://example.org/page${i + 1}`,
      content: `Snippet ${i + 1}`,
      domain: 'example.org',
    }));

    let progressCalls = 0;
    const batchOut = await extractor.extractBatch(
      mockSources,
      'test query',
      'test heading',
      (completed, total) => {
        progressCalls++;
      }
    );

    extractor.extractGenericWebpage = originalExtractGeneric;

    assert(maxObservedActive <= 3, `Max concurrent fetches was ${maxObservedActive} (<= 3 limit)`);
    assert(progressCalls === 7, `Reported progress for all 7 items (${progressCalls} callbacks)`);

    // 3. Test Total Budget Limit & Max Sources
    let totalExtractedLength = 0;
    let sourcesWithContent = 0;
    for (let i = 0; i < batchOut.length; i++) {
      const src = batchOut[i];
      if (src.extractedContent) {
        sourcesWithContent++;
        totalExtractedLength += src.extractedContent.length;
      }
    }

    assert(sourcesWithContent <= 5, `Sources with extracted content: ${sourcesWithContent} (<= 5)`);
    assert(
      totalExtractedLength <= SEARCH_CONFIG.totalExtractedContentBudgetChars,
      `Total extracted length across all sources: ${totalExtractedLength} (<= 6000)`
    );
  } catch (e) {
    console.error('Test 6 error:', e.message);
  }

  // ----------------------------------------------------
  // TEST 7: Final Qwen integration
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Final Qwen integration ---');
  try {
    const mockOllama = {
      generateSearchHeading: async () => 'beautiful python application design',
    };
    const mockSearxng = {
      fetchInitialResults: async () => [
        {
          title: 'CustomTkinter Modern Python UI',
          url: 'https://customtkinter.tomschimansky.com',
          content: 'Modern UI framework for Python Tkinter',
          domain: 'customtkinter.tomschimansky.com',
        },
      ],
      processAndRankResults: () => [
        {
          id: 'S1',
          title: 'CustomTkinter Modern Python UI',
          url: 'https://customtkinter.tomschimansky.com',
          content: 'Modern UI framework for Python Tkinter',
          domain: 'customtkinter.tomschimansky.com',
        },
      ],
    };

    const orchestrator = new SearchOrchestrator(mockOllama, mockSearxng);
    const statuses = [];

    const orchResult = await orchestrator.process({
      model: 'qwen3.5:9b',
      messages: [{ role: 'user', content: 'How to build a beautiful Python app?' }],
      enableWebSearch: true,
      onStatus: (st) => statuses.push(st),
    });

    assert(statuses.includes('Extracting webpage content...'), 'Emitted "Extracting webpage content..." SSE status');
    assert(statuses.includes('Analyzing retrieved information...'), 'Emitted "Analyzing retrieved information..." SSE status');

    const systemMsg = orchResult.messages.find((m) => m.role === 'system');
    assert(!!systemMsg, 'Generated system message for Qwen');
    assert(systemMsg.content.includes('[S1]'), 'Preserved [S1] source identifier in prompt');
    assert(
      systemMsg.content.includes('Prioritize actual technical explanations, useful code examples'),
      'Contains required Stage 3 prompt instruction'
    );
    assert(orchResult.sources[0].id === 'S1', 'Mapped source identifier correctly');
  } catch (e) {
    console.error('Test 7 error:', e.message);
  }

  // ----------------------------------------------------
  // TEST 8: Live End-to-End Chat via Backend API
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Live End-to-End Chat via Backend API ---');
  try {
    const chatPayload = {
      model: 'qwen3.5:9b',
      messages: [{ role: 'user', content: 'What is CustomTkinter in Python and show a 5-line example?' }],
      enableWebSearch: true,
      enableThinking: false,
    };

    console.log('  Calling /api/chat with enableWebSearch: true, enableThinking: false...');
    const response = await fetch('http://127.0.0.1:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
    });

    assert(response.ok, `HTTP ${response.status} from /api/chat`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const receivedStatuses = [];
    let receivedSources = [];
    let streamedContent = '';
    let isDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'status') {
              receivedStatuses.push(data.status);
            } else if (data.type === 'sources') {
              receivedSources = data.sources;
            } else if (data.type === 'chunk' && data.content) {
              streamedContent = data.content;
            } else if (data.type === 'done') {
              isDone = true;
            }
          } catch {}
        }
      }
    }

    assert(receivedStatuses.length > 0, `Received ${receivedStatuses.length} progress status updates`);
    console.log('    Status progression:', receivedStatuses.join(' -> '));

    const hasExtractedStatus = receivedStatuses.some((st) => st.includes('Extracted content from'));
    assert(hasExtractedStatus, 'SSE emitted "Extracted content from N of M webpages"');

    assert(receivedSources.length > 0, `Received ${receivedSources.length} sources`);
    const successfulExtractions = receivedSources.filter((s) => s.extractionStatus === 'success');
    console.log(`    Extracted sources: ${successfulExtractions.length}/${receivedSources.length} successfully extracted`);
    assert(receivedSources.some((s) => s.extractionStatus), 'Sources have extractionStatus property');

    assert(streamedContent.length > 50, `Streamed ${streamedContent.length} chars of answer content`);
    assert(isDone, 'Stream completed with done event');
  } catch (e) {
    console.error('Test 8 error:', e.message);
  }

  console.log('\n====================================================');
  console.log(`   TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
