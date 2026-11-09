import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ prepare: vi.fn(), retire: vi.fn(), close: vi.fn(), spawn: vi.fn(), microphones: [] as any[] }));
vi.mock('@sodashitsu/client-core/desktop/DesktopNativeRoleBinary.node', () => ({ DesktopNativeRoleBinary: class {
  executable = 'fixed-user-host'; arguments = ['--role', 'user-microphone'];
  prepare = f.prepare; retirePreparation = f.retire; close = f.close;
} }));
vi.mock('node:child_process', () => ({ spawn: f.spawn }));
vi.mock('./DesktopMicrophone.js', () => ({ DesktopMicrophone: class {
  fromViewer = vi.fn(); stop = vi.fn();
  constructor(public hooks: any) { f.microphones.push(this); }
} }));
async function setup() {
  vi.resetModules();
  const module = await import('./DesktopProtectedMicrophone.js');
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  const commands: any[] = []; let pending = '';
  child.stdin.on('data', bytes => { pending += bytes; while (pending.includes('\n')) { const at = pending.indexOf('\n'); commands.push(JSON.parse(pending.slice(0, at))); pending = pending.slice(at + 1); } });
  f.prepare.mockResolvedValue(undefined); f.retire.mockResolvedValue(undefined); f.close.mockResolvedValue(undefined); f.spawn.mockReturnValue(child);
  let active = true;
  const id = '22222222-2222-4222-8222-222222222222';
  const hooks = { endpoint: 'locally-configured-virtual-render', mode: 'elevated-uac' as const, allowed: () => active, claim: vi.fn(() => true), release: vi.fn(), send: vi.fn(() => true) };
  const microphone = new module.DesktopProtectedMicrophone(hooks);
  const ready = async () => { await expect.poll(() => commands.length).toBeGreaterThan(0); child.stdout.write(JSON.stringify({ type: 'user_microphone_ready', id, nonce: commands[0].nonce }) + '\n'); };
  const close = (stats?: unknown) => { child.stdout.write(JSON.stringify({ type: 'user_microphone_closed', id, nonce: commands[0]?.nonce, ...(stats === undefined ? {} : { stats }) }) + '\n'); child.emit('close', 0, null); };
  return { ...module, child, commands, id, hooks, microphone, ready, close, revoke: () => active = false };
}
afterEach(() => { vi.restoreAllMocks(); f.prepare.mockReset(); f.retire.mockReset(); f.close.mockReset(); f.spawn.mockReset(); f.microphones = []; });
it('starts no compiler or audio device until explicit microphone start and actor proof', async () => {
  const x = await setup(); expect(f.prepare).not.toHaveBeenCalled();
  x.microphone.fromViewer({ type: 'microphone_start', id: x.id });
  await expect.poll(() => x.commands.length).toBe(1); expect(f.microphones).toHaveLength(0);
  expect(x.commands[0]).toMatchObject({ id: x.id, endpoint: x.hooks.endpoint, mode: 'elevated-uac' });
  await x.ready(); expect(f.microphones).toHaveLength(1);
  expect(f.microphones[0].fromViewer).toHaveBeenCalledWith({ type: 'microphone_start', id: x.id });
  f.microphones[0].hooks.write({ type: 'native_microphone', id: x.id, enabled: true, pipeName: 'SodaDesktopMicrophone-' + 'a'.repeat(32) });
  expect(x.commands.at(-1)).toMatchObject({ clientPid: process.pid });
  x.microphone.stop(); x.close(); await expect.poll(() => x.hooks.release.mock.calls.length).toBe(1);
});
it('keeps the common microphone gate through OFF, actor close and physical retirement receipt', async () => {
  const x = await setup(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); await x.ready();
  f.microphones[0].hooks.write({ type: 'native_microphone', id: x.id, enabled: true, pipeName: 'SodaDesktopMicrophone-' + 'b'.repeat(32) });
  x.microphone.fromViewer({ type: 'microphone_stop', id: x.id });
  expect(x.protectedMicrophoneAvailable()).toBe(false); expect(x.hooks.release).not.toHaveBeenCalled();
  const other = new x.DesktopProtectedMicrophone(x.hooks); other.fromViewer({ type: 'microphone_start', id: x.id }); expect(f.spawn).toHaveBeenCalledOnce();
  x.close(); await expect.poll(() => x.protectedMicrophoneAvailable()).toBe(true); expect(x.hooks.release).toHaveBeenCalledOnce(); other.stop();
});
it('does not release an activated endpoint slot on physical close without a retirement receipt', async () => {
  const x = await setup(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); await x.ready();
  f.microphones[0].hooks.write({ type: 'native_microphone', id: x.id, enabled: true, pipeName: 'SodaDesktopMicrophone-' + 'c'.repeat(32) });
  x.microphone.stop(); x.child.emit('close', 1, null); await new Promise(resolve => setImmediate(resolve));
  expect(x.protectedMicrophoneAvailable()).toBe(false); expect(x.hooks.release).not.toHaveBeenCalled(); expect(f.close).not.toHaveBeenCalled();
});
it('cancels delayed preparation and never spawns after the source changes', async () => {
  const x = await setup(); let release!: () => void; f.prepare.mockImplementation(() => new Promise<void>(resolve => release = resolve));
  x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); await expect.poll(() => f.prepare.mock.calls.length).toBe(1);
  x.revoke(); x.microphone.stop(); release();
  await expect.poll(() => x.protectedMicrophoneAvailable()).toBe(true); expect(f.spawn).not.toHaveBeenCalled(); expect(x.hooks.release).toHaveBeenCalledOnce();
});
it('rejects wrong actor nonce and late proof before constructing a PCM sink', async () => {
  const x = await setup(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); await expect.poll(() => x.commands.length).toBe(1);
  x.child.stdout.write(JSON.stringify({ type: 'user_microphone_ready', id: x.id, nonce: '0'.repeat(64) }) + '\n');
  expect(f.microphones).toHaveLength(0); x.child.emit('close', 1, null); await expect.poll(() => x.protectedMicrophoneAvailable()).toBe(true);
});
it('rejects revoked source before activation and forwarding any further PCM', async () => {
  const x = await setup(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); await x.ready(); const hooks = f.microphones[0].hooks;
  x.revoke(); expect(hooks.allowed()).toBe(false); expect(() => hooks.write({ type: 'native_microphone', id: x.id, enabled: true })).toThrow('source ended');
  expect(hooks.send({ type: 'microphone_ack', id: x.id, seq: 1 })).toBe(false);
  x.microphone.stop(); x.close(); await expect.poll(() => x.protectedMicrophoneAvailable()).toBe(true);
});
it('rejects codec expansion, denied permission and exclusive claim before preparing any actor', async () => {
  const x = await setup(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id, codec: 'opus' }); expect(f.prepare).not.toHaveBeenCalled();
  x.revoke(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); expect(f.prepare).not.toHaveBeenCalled();
  const denied = new x.DesktopProtectedMicrophone({ ...x.hooks, allowed: () => true, claim: () => false }); denied.fromViewer({ type: 'microphone_start', id: x.id });
  await expect.poll(() => x.protectedMicrophoneAvailable()).toBe(true); expect(f.prepare).not.toHaveBeenCalled(); denied.stop();
});
it('permits synchronous OFF from the starting notification without late compilation', async () => {
  const x = await setup(); let microphone: InstanceType<typeof x.DesktopProtectedMicrophone>;
  microphone = new x.DesktopProtectedMicrophone({ ...x.hooks, send: () => { microphone.stop(); return true; } });
  microphone.fromViewer({ type: 'microphone_start', id: x.id }); await expect.poll(() => x.protectedMicrophoneAvailable()).toBe(true); expect(f.prepare).not.toHaveBeenCalled(); expect(f.spawn).not.toHaveBeenCalled();
});

const validStats = () => ({ version: 1, capacityKnown: true, capacityFrames: 2880, packetReadCount: 600, entryExpiredCount: 2, writeAttempts: 598, pcmCommitCount: 597, paddingZeroCount: 3, prefixFrames: 2880, writeExpiryRejectedCount: 1, silentReleaseCount: 0, maxWriteMs: 12.5, maxReadInterarrivalMs: 21.5, saturated: false });
it('returns exact final stats only after physical close and binary retirement, then expires and clears on a new start', async () => {
  const x = await setup(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); await x.ready();
  f.microphones[0].hooks.write({ type: 'native_microphone', id: x.id, enabled: true, pipeName: 'SodaDesktopMicrophone-' + 'd'.repeat(32) });
  let finish!: () => void; f.close.mockImplementation(() => new Promise<void>(resolve => finish = resolve));
  const time = vi.spyOn(performance, 'now').mockReturnValue(1000);
  x.microphone.fromViewer({ type: 'microphone_stop', id: x.id });
  x.close(validStats()); await expect.poll(() => f.close.mock.calls.length).toBe(1);
  expect(x.microphone.readNativeDiagnostics(x.id)).toBeUndefined(); finish();
  await expect.poll(() => x.hooks.release.mock.calls.length).toBe(1);
  const stats = x.microphone.readNativeDiagnostics(x.id); expect(stats).toEqual(validStats()); expect(Object.isFrozen(stats)).toBe(true);
  expect(x.microphone.readNativeDiagnostics('33333333-3333-4333-8333-333333333333')).toBeUndefined();
  time.mockReturnValue(31000); expect(x.microphone.readNativeDiagnostics(x.id)).toBeUndefined();
  f.close.mockResolvedValue(undefined); time.mockReturnValue(1001); x.microphone.fromViewer({ type: 'microphone_start', id: '33333333-3333-4333-8333-333333333333' });
  expect(x.microphone.readNativeDiagnostics(x.id)).toBeUndefined(); x.microphone.stop();
  await expect.poll(() => x.protectedMicrophoneAvailable()).toBe(true);
});
it('invalid or saturated diagnostics are unknown and do not change exact closed retirement proof', async () => {
  for (const stats of [null, { ...validStats(), version: 99 }, { ...validStats(), packetReadCount: -1 }, { ...validStats(), raw: 'generated-secret' }, { ...validStats(), saturated: true }]) {
    const x = await setup(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); await x.ready();
    x.microphone.stop(); x.close(stats); await expect.poll(() => x.protectedMicrophoneAvailable()).toBe(true);
    expect(x.microphone.readNativeDiagnostics(x.id)).toBeUndefined(); expect(x.hooks.release).toHaveBeenCalledOnce();
  }
});
it('stats validator preserves explicit unknown capacity and zero-write timing without inventing values', async () => {
  const { parseNativeMicrophoneStats: parse } = await import('./DesktopProtectedMicrophone.js');
  const unknown = { ...validStats(), capacityKnown: false, capacityFrames: null, writeAttempts: 0, maxWriteMs: null };
  expect(parse(unknown)).toEqual(unknown);
  for (const bad of [{ ...unknown, capacityFrames: 0 }, { ...validStats(), capacityFrames: 959 }, { ...validStats(), maxWriteMs: NaN }, { ...unknown, maxWriteMs: 0 }, { ...validStats(), prefixFrames: 0x80000000 }, { ...validStats(), writeAttempts: 1.5 }]) expect(parse(bad)).toBeUndefined();
});
it('foreign closed nonce and unknown envelope keys cannot authorize diagnostics or retirement', async () => {
  for (const extra of [{ nonce: '0'.repeat(64), stats: validStats() }, { stats: validStats(), unknown: true }]) {
    const x = await setup(); x.microphone.fromViewer({ type: 'microphone_start', id: x.id }); await x.ready();
    f.microphones.at(-1).hooks.write({ type: 'native_microphone', id: x.id, enabled: true, pipeName: 'SodaDesktopMicrophone-' + 'e'.repeat(32) });
    x.microphone.stop(); x.child.stdout.write(JSON.stringify({ type: 'user_microphone_closed', id: x.id, nonce: x.commands[0].nonce, ...extra }) + '\n'); x.child.emit('close', 0, null);
    await new Promise(resolve => setImmediate(resolve)); expect(x.microphone.readNativeDiagnostics(x.id)).toBeUndefined(); expect(x.protectedMicrophoneAvailable()).toBe(false);
  }
});
