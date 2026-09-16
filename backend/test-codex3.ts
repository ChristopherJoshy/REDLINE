import { withCodexPrimary } from './src/llm/primary.js';
async function run() {
  const gen = withCodexPrimary('r1', [], [], undefined, async function* fallback() { yield { kind: 'delta', delta: 'fallback!' }; });
  for await (const chunk of gen) {
    console.log('Chunk:', chunk);
  }
}
run().catch(console.error);
