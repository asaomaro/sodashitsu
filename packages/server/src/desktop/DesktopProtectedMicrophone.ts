import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { DesktopAudioPipe } from '@sodashitsu/client-core/desktop/DesktopAudioPipe.node';
import { DesktopNativeRoleBinary } from '@sodashitsu/client-core/desktop/DesktopNativeRoleBinary.node';
import { DesktopMicrophoneRequest, type DesktopMicrophoneResult } from '@sodashitsu/protocol';
import { DesktopMicrophone } from './DesktopMicrophone.js';

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
    this.id = message.id;
    occupied = true;
    const binary = new DesktopNativeRoleBinary('user-microphone');
    const nonce = randomBytes(32).toString('hex'), id = message.id, deadline = performance.now() + 45000;
    let dead = false, ready = false, requested = false, receipt = false, claimed = false;
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
        if (this.id === id) { this.id = undefined; this.cancel = undefined; }
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
            if (value.type === 'user_microphone_closed' && value.id === id && value.nonce === nonce && Object.keys(value).length === 3) { receipt = true; if (!dead) fail(); continue; }
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
