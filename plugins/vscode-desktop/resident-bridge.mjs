import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { CdpCapture } from './cdp-client.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secret = /^[0-9a-f]{64}$/;
export function defaultProfilePath(platform = process.platform, env = process.env, home = homedir()) {
  return platform === 'win32'
    ? join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Sodashitsu', 'vscode-cdp', 'bridge.json')
    : join(env.XDG_STATE_HOME || join(home, '.local', 'state'), 'sodashitsu', 'vscode-cdp', 'bridge.json');
}
export function sodaOrigin(value) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/' ||
      !(u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname))))
    throw new Error('SodashitsuにはHTTPSのorigin（ローカル確認はHTTP loopback）を指定してください');
  return u.origin;
}
export function validateProfile(value) {
  if (!value || value.version !== 1 || !uuid.test(value.deviceId) || !secret.test(value.secret) ||
      typeof value.targetId !== 'string' || !value.targetId || value.targetId.length > 256 ||
      typeof value.allowInput !== 'boolean' || typeof value.allowFit !== 'boolean' || (value.allowFit && !value.allowInput))
    throw new Error('保存したブリッジ設定が不正です');
  const origin = sodaOrigin(value.origin);
  const endpoint = new URL(value.endpoint);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/')
    throw new Error('保存したCDP接続先が不正です');
  return {version:1, origin, endpoint:endpoint.href, deviceId:value.deviceId, secret:value.secret,
    targetId:value.targetId, allowInput:value.allowInput, allowFit:value.allowFit};
}
export async function readProfile(path) {
  let bytes;
  try { bytes = await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (bytes.length > 16384) throw new Error('保存したブリッジ設定が大きすぎます');
  try { return validateProfile(JSON.parse(bytes.toString('utf8'))); }
  catch { throw new Error('保存したブリッジ設定が不正です。登録を解除して作り直してください'); }
}
export async function writeProfile(path, profile) {
  const value = validateProfile(profile);
  await mkdir(dirname(path), {recursive:true, mode:0o700});
  const temporary = `${path}.${randomUUID()}.tmp`;
  let file;
  try {
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(JSON.stringify(value) + '\n');
    await file.sync(); await file.close(); file = undefined;
    await rename(temporary, path);
  } finally {
    await file?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}
export async function removeProfile(path, expected) {
  if (expected) {
    const current = await readProfile(path);
    if (!current || current.deviceId !== expected.deviceId || current.secret !== expected.secret || current.origin !== expected.origin) return;
  }
  await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

/** A resident transport never owns more than one capture, including cleanup. */
export class ResidentSession {
  constructor({send, close, connectCdp, saveRegistration, allowInput, allowFit, deviceId, canRegister = true, log = () => {}, Capture = CdpCapture}) {
    Object.assign(this, {send, close, connectCdp, saveRegistration, allowInput, allowFit, deviceId, canRegister, log, Capture});
    this.registration = Promise.resolve();
  }
  message(m) {
    if (this.closed || !m || typeof m !== 'object') return;
    if (m.type === 'registered') {
      if (!this.canRegister || this.authenticated || !uuid.test(m.deviceId) || !secret.test(m.secret)) return this.fail();
      this.authenticated = true;
      this.deviceId = m.deviceId;
      this.registration = Promise.resolve().then(() => this.saveRegistration(m)).catch(() => {
        this.log('ブリッジ設定を保存できませんでした。ブラウザで登録を解除してやり直してください');
        this.fail(); throw new Error('registration save failed');
      });
      // A failure can happen before start is received; keep the rejection handled.
      void this.registration.catch(() => {});
      return;
    }
    if (m.type === 'ready') {
      if (!uuid.test(m.deviceId) || (this.deviceId && this.deviceId !== m.deviceId)) return this.fail();
      this.deviceId = m.deviceId; this.authenticated = true;
      this.log('接続済み。ブラウザから共有を開始できます'); return;
    }
    if (m.type === 'start') {
      if (!this.authenticated || !uuid.test(m.shareId) || this.active) return this.fail();
      const active = {id:m.shareId, control:false}; this.active = active;
      active.starting = this.begin(active);
      void active.starting.catch(() => {
        this.log("選択したVSCodeへの接続が終了しました。必要ならブリッジを再実行して対象を選び直してください");
        return this.finish(active, true);
      });
      return;
    }
    const active = this.active;
    if (!active || active.finishing || m.shareId !== active.id) return;
    if (m.type === 'stop') { void this.finish(active, true); return; }
    if (m.type === 'control') {
      active.control = this.allowInput && m.enabled === true;
      if (!active.control) { active.viewport = undefined; active.hasViewport = false; }
      if (active.started) void active.capture.setControl(active.control);
    } else if (m.type === 'viewport' && this.allowFit && active.control) {
      if (active.started) void active.capture.setViewport(m.size);
      else { active.viewport = m.size; active.hasViewport = true; }
    } else if (m.type === 'ack' && active.capture) active.capture.ack(m.seq);
    else if (m.type === 'input' && this.allowInput && active.started) void active.capture.input(m.input);
  }
  async begin(active) {
    await this.registration;
    if (this.closed || active.finishing) return;
    active.cdp = await this.connectCdp();
    if (this.closed || active.finishing) return;
    active.capture = new this.Capture(active.cdp, {
      frame: frame => { if (!this.closed && !active.finishing) this.send({...frame, shareId:active.id}); },
      stopped: () => { void this.finish(active, true); },
    });
    await active.capture.start();
    if (this.closed || active.finishing) return;
    active.started = true;
    const size = active.viewport, fit = active.hasViewport && active.control;
    active.viewport = undefined; active.hasViewport = false;
    // Schedule both synchronously so a newer incoming viewport cannot be
    // overtaken by an older one retained during connection setup.
    const granting = active.control ? active.capture.setControl(true) : Promise.resolve();
    const fitting = fit ? active.capture.setViewport(size) : Promise.resolve();
    await Promise.all([granting, fitting]);
  }
  finish(active, notify) {
    if (active.finishing) return active.finishing;
    // Publish the guard synchronously: another start must not race with cleanup.
    active.finishing = Promise.resolve().then(async () => {
      await active.starting?.catch(() => {});
      await active.capture?.stop();
      active.cdp?.close();
      if (this.active === active) this.active = undefined;
      if (notify && !this.closed) this.send({type:'stopped',shareId:active.id});
    }).catch(() => this.fail());
    return active.finishing;
  }
  fail() { this.close(); void this.shutdown(); }
  async shutdown() {
    this.closed = true;
    const active = this.active;
    if (active) await this.finish(active, false);
  }
}
