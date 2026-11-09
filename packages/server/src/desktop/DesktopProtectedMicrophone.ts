import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { DesktopAudioPipe } from '@sodashitsu/client-core/desktop/DesktopAudioPipe.node';
import { DesktopNativeRoleBinary } from '@sodashitsu/client-core/desktop/DesktopNativeRoleBinary.node';
import { DesktopMicrophoneRequest, type DesktopMicrophoneResult } from '@sodashitsu/protocol';
import { DesktopMicrophone } from './DesktopMicrophone.js';

export interface NativeMicrophoneStats {
  readonly version: 1; readonly capacityKnown: boolean; readonly capacityFrames: number | null;
  readonly packetReadCount: number; readonly entryExpiredCount: number; readonly writeAttempts: number; readonly pcmCommitCount: number;
  readonly paddingZeroCount: number; readonly prefixFrames: number; readonly writeExpiryRejectedCount: number; readonly silentReleaseCount: number;
  readonly maxReadInterarrivalMs: number | null; readonly maxWriteMs: number | null; readonly saturated: boolean;
}
const STATS_COUNTS = ['packetReadCount', 'entryExpiredCount', 'writeAttempts', 'pcmCommitCount', 'paddingZeroCount', 'prefixFrames', 'writeExpiryRejectedCount', 'silentReleaseCount'] as const;
export function parseNativeMicrophoneStats(raw: unknown): Readonly<NativeMicrophoneStats> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== [...STATS_COUNTS, 'version', 'capacityKnown', 'capacityFrames', 'maxWriteMs', 'maxReadInterarrivalMs', 'saturated'].sort().join(',') || v.version !== 1 || typeof v.capacityKnown !== 'boolean' || typeof v.saturated !== 'boolean') return;
  if (STATS_COUNTS.some(k => !Number.isSafeInteger(v[k]) || (v[k] as number) < 0 || (v[k] as number) > 0x7fffffff)) return;
  if (v.capacityKnown ? !Number.isSafeInteger(v.capacityFrames) || (v.capacityFrames as number) < 960 || (v.capacityFrames as number) > 48000 : v.capacityFrames !== null) return;
  if (v.writeAttempts === 0 ? v.maxWriteMs !== null : typeof v.maxWriteMs !== 'number' || !Number.isFinite(v.maxWriteMs) || v.maxWriteMs < 0 || v.maxWriteMs > 100000) return;
  if ((v.packetReadCount as number) < 2 ? v.maxReadInterarrivalMs !== null : typeof v.maxReadInterarrivalMs !== 'number' || !Number.isFinite(v.maxReadInterarrivalMs) || v.maxReadInterarrivalMs < 0 || v.maxReadInterarrivalMs > 100000) return;
  return Object.freeze({ ...v }) as unknown as Readonly<NativeMicrophoneStats>;
}

// Shared with the ordinary microphone admission gate. OFF is not endpoint retirement.
let occupied = false;
export const protectedMicrophoneAvailable = () => !occupied;
export interface ProtectedMicrophoneHooks {
  endpoint: string;
  mode: 'elevated-default' | 'elevated-uac';
  allowed(): boolean;
  claim(id: string): boolean;
  release(id: string): void;
  bridge?(active: () => boolean): DesktopAudioPipe;
  send(value: DesktopMicrophoneResult): boolean;
}

/** Only fixed ordinary-user roles receive PCM. No command is sent to the SYSTEM worker. */
export class DesktopProtectedMicrophone {
  private stopped = false;
  private cancel: (() => void) | undefined;
  private microphone: DesktopMicrophone | undefined;
  private id: string | undefined;
  private retainedDiagnostics: { id: string; at: number; stats: Readonly<NativeMicrophoneStats> } | undefined;
  /** Internal owner-process diagnostics, only after all existing physical retirement work. */
  readNativeDiagnostics(expectedId: string): Readonly<NativeMicrophoneStats> | undefined {
    const value = this.retainedDiagnostics, age = value ? performance.now() - value.at : -1;
    return this.id === undefined && value?.id === expectedId && age >= 0 && age < 30000 ? value.stats : undefined;
  }
  constructor(private hooks: ProtectedMicrophoneHooks) {}
  fromViewer(raw: unknown): void {
    const message = DesktopMicrophoneRequest.parse(raw);
    if (this.stopped) return;
    if (message.type === 'microphone_stop') {
      if (message.id === this.id) this.cancel?.();
      return;
    }
    if (message.type !== 'microphone_start') {
      this.microphone?.fromViewer(message);
      return;
    }
    if (this.id || occupied || message.codec || !this.hooks.allowed() || this.stopped || occupied) {
      this.hooks.send({ type: 'microphone_status', id: message.id, state: 'unavailable' });
      return;
    }
    this.retainedDiagnostics = undefined;
    this.id = message.id;
    occupied = true;
    const binary = new DesktopNativeRoleBinary('user-microphone');
    const nonce = randomBytes(32).toString('hex'), id = message.id, deadline = performance.now() + 45000;
    let dead = false, ready = false, requested = false, receipt = false, claimed = false;
    let nativeStats: Readonly<NativeMicrophoneStats> | undefined;
    let child: ChildProcessWithoutNullStreams | undefined, closed: Promise<void> | undefined;
    let buffer = '', bytes = 0, diagnostics = 0;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const alive = () => {
      if (dead || this.stopped) return false;
      const allowed = this.hooks.allowed();
      return !dead && !this.stopped && allowed && (ready || performance.now() < deadline);
    };
    const write = (value: unknown) => {
      if (!child || child.stdin.destroyed || child.stdin.writableLength > 4096) throw Error('Microphone actor input closed');
      child.stdin.write(JSON.stringify(value) + '\n');
    };
    const retire = (state: 'stopped' | 'unavailable' = 'stopped') => {
      if (dead) return;
      dead = true;
      clearTimeout(timer); clearInterval(heartbeat);
      try { this.microphone?.stop(); } catch { /* Still retire the physical actor. */ }
      this.microphone = undefined;
      const preparationRetired = binary.retirePreparation();
      child?.stdin.end();
      const kill = child ? setTimeout(() => child?.kill(), 1500) : undefined; kill?.unref();
      if (!this.stopped) this.hooks.send({ type: 'microphone_status', id, state });
      void (async () => {
        await preparing.catch(() => {}); await preparationRetired; await closed;
        if (requested && !receipt) await new Promise<void>(() => {});
        if (kill) clearTimeout(kill);
        await binary.close();
        if (claimed) this.hooks.release(id);
        occupied = false;
        if (this.id === id) {
          this.retainedDiagnostics = nativeStats && !nativeStats.saturated ? { id, at: performance.now(), stats: nativeStats } : undefined;
          this.id = undefined; this.cancel = undefined;
        }
      })().catch(() => { /* Uncertain device retirement keeps the common microphone gate closed. */ });
    };
    const fail = () => retire('unavailable');
    const timer = setTimeout(fail, 45000); timer.unref();
    this.cancel = () => retire();
    // A microtask permits synchronous cancellation before any compiler/process is started.
    const preparing = Promise.resolve().then(async () => {
      if (!alive()) { fail(); return; }
      claimed = this.hooks.claim(id);
      if (!claimed || !alive()) { fail(); return; }
      await binary.prepare();
      if (!alive()) { fail(); return; }
      child = spawn(binary.executable, [...binary.arguments], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
      closed = new Promise<void>(resolve => child!.once('close', () => { resolve(); if (!dead) fail(); }));
      child.on('error', fail); child.stdin.on('error', fail);
      child.stderr.on('data', (data: Buffer) => { diagnostics += data.length; if (diagnostics > 8192) fail(); });
      child.stdout.on('data', (data: Buffer) => {
        bytes += data.length; if (bytes > 4096) { fail(); return; } buffer += data.toString('utf8');
        try {
          while (buffer.includes('\n')) {
            const at = buffer.indexOf('\n'), value = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
            if (value.type === 'user_microphone_closed' && value.id === id && value.nonce === nonce && (Object.keys(value).length === 3 || Object.keys(value).length === 4 && Object.hasOwn(value, 'stats'))) {
              if (!receipt) nativeStats = parseNativeMicrophoneStats(value.stats);
              receipt = true; if (!dead) fail(); continue;
            }
            if (ready || value.type !== 'user_microphone_ready' || value.id !== id || value.nonce !== nonce || Object.keys(value).length !== 3 || !alive()) throw Error('Microphone actor proof');
            ready = true; clearTimeout(timer);
            this.microphone = new DesktopMicrophone({
              ...(this.hooks.bridge ? { bridge: this.hooks.bridge } : {}),
              allowed: alive,
              write: raw => {
                const command = raw as { type: string; id: string; enabled: boolean; clientPid?: number };
                if (command.type !== 'native_microphone' || command.id !== id) throw Error('Microphone actor stream');
                if (command.enabled) { if (!alive()) throw Error('Microphone source ended'); requested = true; }
                write({ ...command, ...(command.enabled && !command.clientPid ? { clientPid: process.pid } : {}) });
              },
              release: () => retire(),
              send: result => {
                if (dead || !alive()) return false;
                if (result.type === 'microphone_status' && result.state === 'unavailable') { fail(); return true; }
                return this.hooks.send(result);
              },
            });
            this.microphone.fromViewer({ type: 'microphone_start', id });
          }
        } catch { fail(); }
      });
      write({ id, nonce, endpoint: this.hooks.endpoint, mode: this.hooks.mode });
      heartbeat = setInterval(() => { if (!alive()) { fail(); return; } try { write({ type: 'heartbeat' }); } catch { fail(); } }, 500); heartbeat.unref();
    });
    void preparing.catch(fail);
    this.hooks.send({ type: 'microphone_status', id, state: 'starting' });
  }
  stop(): void { this.stopped = true; this.cancel?.(); }
}
