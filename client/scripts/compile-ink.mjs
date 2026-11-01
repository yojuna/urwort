// Compile src/story/main.ink to src/story/main.json (fails the build on ink errors).
import { readFileSync, writeFileSync } from 'node:fs';
import { Compiler, CompilerOptions } from 'inkjs/full';

const src = readFileSync('src/story/main.ink', 'utf8');
const messages = [];
let story = null;
try {
  story = new Compiler(src, new CompilerOptions(null, [], false, (m) => messages.push(m))).Compile();
} catch (e) {
  messages.push(String(e));
}
messages.forEach((m) => console.error(m));
if (!story || messages.some((m) => !m.startsWith('WARNING'))) process.exit(1);
writeFileSync('src/story/main.json', story.ToJson());
console.log('ink compiled:', src.split('\n').length, 'lines');
