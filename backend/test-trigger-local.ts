import { streamCodexChat } from './src/llm/codex/codexChat.js';
import { BOT_TOOLS, toolsForCharacter } from './src/bots/tools.js';
async function run() {
  try {
    const dynamicTools = toolsForCharacter(BOT_TOOLS, ['pistol', 'reload'], false);
    const gen = streamCodexChat({ phase: 'r1', messages: [{ role: 'user', content: 'hello' }], tools: dynamicTools }, 'anon', 'wick');
    for await (const chunk of gen) {
      console.log(chunk);
    }
  } catch (err) {
    console.error(err);
  }
}
run();
