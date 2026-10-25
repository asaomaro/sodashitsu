/** Explicit native helper benchmark. Keeps screen images in memory only; no OS input. */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const command = JSON.parse(process.env.SODA_DESKTOP_BENCH_COMMAND ?? 'null');
if (!Array.isArray(command) || !command.length || command.some(v => typeof v !== 'string')) throw new Error('Set SODA_DESKTOP_BENCH_COMMAND to an explicitly trusted helper command JSON array.');
const args = process.argv.slice(2), options = { width: '1280', fps: '30', frames: '60', backend: 'auto' };
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace(/^--/, '');
  if (!Object.hasOwn(options, key) || args[i + 1] === undefined) throw new Error('Use --width 320..1920 --fps 1..30 --frames 20..900 --backend auto|gdi');
  options[key] = args[i + 1];
}
const width = Number(options.width), fps = Number(options.fps), count = Number(options.frames);
if (!Number.isInteger(width) || width < 320 || width > 1920 || !Number.isInteger(fps) || fps < 1 || fps > 30 || !Number.isInteger(count) || count < 20 || count > 900 || !['auto', 'gdi'].includes(options.backend)) throw new Error('Invalid benchmark options');
const child = spawn(command[0], command.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
const frames = [], arrivals = [];
let ready, buffer = '', failure, finished = false;
const send = value => { if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(value) + '\n'); };
child.stdin.on('error', () => {});
child.stderr.resume(); // Do not persist native errors, paths or window titles.
const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 1000);
const timeout = setTimeout(() => { failure = new Error('Native capture timed out'); child.kill(); }, 60000 + count * 1000);
child.on('error', error => { failure = error; });
child.stdout.setEncoding('utf8');
child.stdout.on('data', data => {
  if (finished) return;
  buffer += data;
  if (buffer.length > 4 * 1024 * 1024) { failure = new Error('Helper line limit'); finished = true; child.kill(); return; }
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0 && !finished) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    try {
      const value = JSON.parse(line);
      if (value.type === 'ready') ready = { backend: value.backend, width: value.width, height: value.height };
      if (value.type === 'frame') {
        frames.push(value.info); arrivals.push(performance.now());
        send({ type: 'ack', seq: value.info.seq });
        if (frames.length === count) { finished = true; buffer = ''; send({ type: 'stop' }); }
      }
    } catch { failure = new Error('Invalid helper output'); finished = true; child.kill(); }
  }
});
send({ type: 'configure', ...(options.backend === 'auto' ? { captureBackends: ['dxgi'] } : {}), options: { width, fps, quality: 65, image: { colorMode: 'full', showCursor: false } }, allowInput: false, allowClipboard: false, allowDisplayResize: false });
await new Promise(resolve => child.once('close', resolve));
clearInterval(heartbeat); clearTimeout(timeout);
if (failure) throw failure;
if (!ready || frames.length !== count) throw new Error('Native helper ended before the requested frames');
const p95 = key => frames.map(f => f[key]).sort((a, b) => a - b)[Math.ceil(count * .95) - 1];
const span = arrivals.at(-1) - arrivals[0];
const report = { kind: 'native-helper-capture-and-encode-only', requestedBackend: options.backend, initialHelperBackend: ready.backend, sourceWidth: ready.width, sourceHeight: ready.height, frameWidth: frames[0].width, frameHeight: frames[0].height, targetFps: fps, frames: count, achievedFps: (count - 1) * 1000 / span, captureP95Ms: p95('captureMs'), encodeP95Ms: p95('encodeMs'), sourceCpuOneCorePercent: (frames.at(-1).sourceCpuMs - frames[0].sourceCpuMs) * 100 / span, sourcePeakRssMiB: Math.max(...frames.map(f => f.sourceMemoryBytes)) / 1048576, limitations: 'Explicit trusted native command; no input requested, image data discarded. Initial backend does not prove continued DXGI use after fallback. Immediate ACK; no product servers, browser, WAN, GPU utilization or input latency measured. Screen contents are uncontrolled.' };
const out = join(process.env.SODA_DESKTOP_BENCH_OUT ?? tmpdir(), 'soda-desktop-capture.json');
await writeFile(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
