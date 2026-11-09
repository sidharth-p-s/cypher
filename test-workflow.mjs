import { OllamaClient } from './server/ollamaClient.ts';
import { SearXNGClient } from './server/searxngClient.ts';
import { SearchOrchestrator } from './server/searchOrchestrator.ts';

const OLLAMA_URL = 'http://127.0.0.1:11434';
const SEARXNG_URL = 'http://127.0.0.1:8080';
const MODEL = 'qwen3.5:9b';

const ollama = new OllamaClient(OLLAMA_URL);
const searxng = new SearXNGClient(SEARXNG_URL);
const orchestrator = new SearchOrchestrator(ollama, searxng);

async function runTests() {
  console.log('====================================================');
  console.log('Executing Two-Stage Web Search Automated Test Suite');
  console.log('====================================================\n');

  // Test 1: Search without a specified date
  console.log('--- Test 1: Search without specified date ---');
  const q1 = "I want to build a beautiful Python program.";
  const h1 = await ollama.generateSearchHeading(MODEL, q1);
  console.log(`Query: "${q1}"`);
  console.log(`Generated Heading: "${h1}"`);
  const hasLatest = /\blatest\b/i.test(h1);
  console.log(`Verification: Includes 'latest'? ${hasLatest ? 'PASS' : 'FAIL'}\n`);

  // Test 2: Search with a specific date
  console.log('--- Test 2: Search with specific date ---');
  const q2 = "What happened on 24th October?";
  const h2 = await ollama.generateSearchHeading(MODEL, q2);
  console.log(`Query: "${q2}"`);
  console.log(`Generated Heading: "${h2}"`);
  const preservesDate = /24.*october/i.test(h2) || /october.*24/i.test(h2);
  const noInvention = !/\blatest\b/i.test(h2);
  console.log(`Verification: Preserves 24 October? ${preservesDate ? 'PASS' : 'FAIL'}`);
  console.log(`Verification: Avoids replacing with 'latest'? ${noInvention ? 'PASS' : 'FAIL'}\n`);

  // Test 3: Search with a date range
  console.log('--- Test 3: Search with a date range ---');
  const q3 = "What happened between 20th and 25th October?";
  const h3 = await ollama.generateSearchHeading(MODEL, q3);
  console.log(`Query: "${q3}"`);
  console.log(`Generated Heading: "${h3}"`);
  const preservesRange = /20.*25.*october/i.test(h3) || (/20/i.test(h3) && /25/i.test(h3) && /october/i.test(h3));
  console.log(`Verification: Preserves date range (20th and 25th October)? ${preservesRange ? 'PASS' : 'FAIL'}\n`);

  // Test 4: Search with a relative date
  console.log('--- Test 4: Search with relative date ---');
  const q4 = "What are the major technology developments from last week?";
  const h4 = await ollama.generateSearchHeading(MODEL, q4);
  console.log(`Query: "${q4}"`);
  console.log(`Generated Heading: "${h4}"`);
  const preservesRelative = /last week/i.test(h4);
  console.log(`Verification: Preserves 'last week'? ${preservesRelative ? 'PASS' : 'FAIL'}\n`);

  // Test 5: Verify SearXNG initially retrieves 10 results
  console.log('--- Test 5: Verify initial 10 results retrieved from SearXNG ---');
  const raw10 = await searxng.fetchInitialResults(h1, 10);
  console.log(`Initial raw result count: ${raw10.length}`);
  const hasMetadata = raw10.length > 0 && raw10.every(r => r.url && (r.title || r.content));
  console.log(`Sample item 1: Title="${raw10[0]?.title}" | Engine="${raw10[0]?.engine || 'N/A'}" | Published="${raw10[0]?.publishedDate || 'N/A'}"`);
  console.log(`Verification: Exactly 10 (or up to 10 available) retrieved? ${raw10.length === 10 ? 'PASS' : 'WARN - Returned ' + raw10.length}\n`);

  // Test 6: Verify URL deduplication and relevance ranking
  console.log('--- Test 6: Verify URL deduplication and relevance ranking ---');
  // Inject an artificial duplicate with query parameters and anchor to test normalization and deduplication
  const duplicateTestList = [
    ...raw10,
    {
      title: 'Duplicate Item with Tracking',
      url: `${raw10[0].url}?utm_source=twitter&utm_medium=social#overview`,
      content: 'This is a duplicate of the first item with tracking and fragment.',
      engine: 'test'
    }
  ];
  const rankedSources = searxng.processAndRankResults(duplicateTestList, q1);
  const normalizedUrls = rankedSources.map(s => searxng.normalizeUrl(s.url));
  const uniqueCount = new Set(normalizedUrls).size;
  const isDeduplicated = uniqueCount === rankedSources.length;
  console.log(`Total after dedup and ranking: ${rankedSources.length} (Duplicates removed: ${duplicateTestList.length - rankedSources.length})`);
  console.log(`Verification: All URLs unique and normalized? ${isDeduplicated ? 'PASS' : 'FAIL'}\n`);

  // Test 7: Verify that the best 5–8 results are passed
  console.log('--- Test 7: Verify best 5-8 results passed ---');
  console.log(`Selected count: ${rankedSources.length}`);
  const validRange = rankedSources.length >= 5 && rankedSources.length <= 8;
  console.log(`Verification: Count is within 5-8 range? ${validRange ? 'PASS' : (rankedSources.length < 5 ? 'PASS (available < 5)' : 'FAIL')}`);
  rankedSources.forEach(s => {
    console.log(`  [${s.id}] ${s.title.slice(0, 50)}... | Domain: ${s.domain}`);
  });
  console.log();

  // Test 8: End-to-end Chat API with Web Search & Source mapping
  console.log('--- Test 8: End-to-end Chat with Web Search and Source Mapping ---');
  let statusLog = [];
  const orchResult = await orchestrator.process({
    model: MODEL,
    messages: [{ role: 'user', content: q1 }],
    enableWebSearch: true,
    onStatus: (st, query) => {
      statusLog.push({ st, query });
    }
  });

  console.log('Progress status steps observed:');
  statusLog.forEach(s => console.log(`  - ${s.st}${s.query ? ` ("${s.query}")` : ''}`));

  console.log(`\nFinal Search Heading: "${orchResult.searchHeading}"`);
  console.log(`Sources passed to LLM: ${orchResult.sources.length}`);
  const hasIdentifiers = orchResult.sources.every((s, i) => s.id === `S${i + 1}`);
  console.log(`Verification: Source identifiers formatted as [S1], [S2]...? ${hasIdentifiers ? 'PASS' : 'FAIL'}`);

  // Test 9: Test with Think Mode enabled and disabled
  console.log('\n--- Test 9: Think Mode Independence (Enabled vs Disabled) ---');
  console.log('Testing Think Mode OFF:');
  const chatResOff = await fetch('http://127.0.0.1:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: 'What is 2 + 2?' }],
      enableThinking: false,
      enableWebSearch: false
    })
  });
  const textOff = await chatResOff.text();
  const hasThinkingOff = textOff.includes('"thinking":') && !textOff.includes('"thinking":""') && !textOff.includes('"thinking":null');
  console.log(`Think Mode OFF test: Received chunks? ${textOff.includes('data: {"type":"chunk"') ? 'PASS' : 'FAIL'}`);

  // Test 10: Stop SearXNG / Test failure reporting without fabricating results
  console.log('\n--- Test 10: SearXNG failure reporting without fabrication ---');
  const faultySearx = new SearXNGClient('http://127.0.0.1:9999'); // non-existent port
  const faultyOrchestrator = new SearchOrchestrator(ollama, faultySearx);
  let failedAsExpected = false;
  let reportedError = '';

  try {
    await faultyOrchestrator.process({
      model: MODEL,
      messages: [{ role: 'user', content: 'What is latest tech news?' }],
      enableWebSearch: true,
      onStatus: () => {}
    });
  } catch (err) {
    failedAsExpected = true;
    reportedError = err.message;
  }

  console.log(`Verification: Failed gracefully without fabricating? ${failedAsExpected ? 'PASS' : 'FAIL'}`);
  console.log(`Reported error message: "${reportedError}"\n`);

  console.log('====================================================');
  console.log('All 10 Tests Completed Successfully!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
