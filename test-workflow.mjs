import { OllamaClient } from './server/ollamaClient.ts';
import { SearXNGClient } from './server/searxngClient.ts';
import { SearchOrchestrator } from './server/searchOrchestrator.ts';

const OLLAMA_URL = 'http://127.0.0.1:11434';
const SEARXNG_URL = 'http://127.0.0.1:8080';
const MODEL = 'qwen3.5:9b';

const ollama = new OllamaClient(OLLAMA_URL);
const searxng = new SearXNGClient(SEARXNG_URL);
const orchestrator = new SearchOrchestrator(ollama, searxng);

async function testRelevanceQuery(query) {
  console.log(`\n======================================================`);
  console.log(`Query: "${query}"`);
  
  // Stage 1: Generate search heading
  const heading = await ollama.generateSearchHeading(MODEL, query);
  console.log(`Generated Search Heading: "${heading}"`);

  // Stage 2: Retrieve initial 10 results from SearXNG
  const raw10 = await searxng.fetchInitialResults(heading, 10);
  
  // Stage 3: Process and rank results
  const processed = searxng.processAndRankResultsDetailed(raw10, query, heading);

  console.log(`- Original result count: ${processed.metrics.originalCount}`);
  console.log(`- Number of duplicate URLs removed: ${processed.metrics.duplicatesRemoved}`);
  console.log(`- Number of results rejected as irrelevant: ${processed.metrics.rejectedIrrelevant}`);
  console.log(`- Final selected result count: ${processed.metrics.finalSelectedCount}`);
  console.log(`- Selected titles and domains:`);
  processed.sources.forEach(s => {
    console.log(`    [${s.id}] ${s.title}`);
    console.log(`         Domain: ${s.domain} | URL: ${s.url}`);
  });

  return processed;
}

async function run() {
  console.log('======================================================');
  console.log('Testing Improved Relevance and Precision Processing');
  console.log('======================================================');

  await testRelevanceQuery('I want to build a beautiful Python program.');
  await testRelevanceQuery('Latest NVIDIA GPU developments.');
  await testRelevanceQuery('What happened on 24 October?');
  await testRelevanceQuery('Find creative Python terminal applications.');
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
