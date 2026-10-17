/** Opt-in, fake-source benchmark. Never starts the Windows desktop helper. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2), options = { width: '1280', fps: '10', frames: '100' };
for (let i = 0; i < args.length; i += 2) {
  const name = args[i]?.replace(/^--/, '');
  if (!Object.hasOwn(options, name) || !/^\d+$/.test(args[i + 1] ?? '')) throw new Error('Usage: node scripts/remote-desktop/benchmark.mjs [--width 640|1280|1920] [--fps 5|10|20|30] [--frames 20..900]');
  options[name] = args[i + 1];
}
const child = spawn('pnpm', ['--filter', '@sodashitsu/e2e', 'exec', 'playwright', 'test', 'remote-desktop-performance.spec.ts'], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'inherit', shell: false,
  env: { ...process.env, SODA_DESKTOP_BENCH: '1', SODA_DESKTOP_BENCH_WIDTH: options.width, SODA_DESKTOP_BENCH_FPS: options.fps, SODA_DESKTOP_BENCH_FRAMES: options.frames },
});
child.on('error', (e) => { console.error(e.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
