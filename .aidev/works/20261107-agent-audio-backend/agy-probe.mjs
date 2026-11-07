// Run after building packages/server, with Node 24. Creates its own isolated CLI only.
// No model turn is submitted; Enter is used only before the prompt is displayed.
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const { isolatedAntigravity } = await import(join(root, 'packages/server/dist/conversation/AgentIsolation.js'));
const require = createRequire(join(root, 'packages/server/package.json'));
const pty = require('node-pty');
const dir = await mkdtemp(join(tmpdir(), 'soda-agy-audio-fixture-'));
const workspace = join(dir, 'fixture');
await mkdir(workspace);
const wav = Buffer.alloc(44 + 32000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(32000, 40);
const audio = join(workspace, 'generated.wav'), image = join(workspace, 'positive.png');
await writeFile(audio, wav);
await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1kAAAAASUVORK5CYII=', 'base64'));
const env = { ...process.env, TERM: 'xterm-256color' };
for (const key of Object.keys(env)) if (/^(SODA|SODACTL|CODEX)/.test(key)) delete env[key];
let child, output = '';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(value, start = 0) {
  for (let i = 0; i < 150; i++) {
    if (output.slice(start).includes(value)) return;
    await sleep(200);
  }
  throw Error('Isolated CLI did not reach expected setup/prompt stage: ' + value);
}
try {
  const isolated = await isolatedAntigravity(dir, env);
  child = pty.spawn(isolated.file, [...isolated.prefix, '--mode', 'plan'], {
    name: 'xterm-256color', cols: 120, rows: 35, cwd: workspace, env,
  });
  child.onData(data => output += data);
  await waitFor('Choose your color scheme:');
  child.write('\r');
  await waitFor('Terms of Service & Data Use');
  child.write(' '); // opt out of interaction collection in this private fixture
  await sleep(300);
  child.write('\t\t\r');
  await waitFor('Do you trust the contents of this project?');
  child.write('\r'); // trust only the freshly generated fixture directory
  await waitFor('Plan mode: research & plan only');
  for (const value of [audio, '@' + audio, JSON.stringify(audio), image]) {
    child.write('\x1b'); child.write('\x15');
    const start = output.length;
    child.write('\x1b[200~' + value + '\x1b[201~');
    await sleep(3000);
    // Keep exact attachment-stage bytes; omit startup/authentication/account display.
    process.stdout.write(JSON.stringify({ value, terminal: output.slice(start) }) + '\n');
  }
} finally {
  child?.kill();
  await sleep(500);
  await rm(dir, { recursive: true, force: true });
}
