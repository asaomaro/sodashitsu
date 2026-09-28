import {
  encodeSnapshotFrame,
  type MachineStatus,
  type SessionSnapshot,
} from "@sodashitsu/protocol";
import type { LinkChannel } from "../machine/MachineLink.js";
import type { RemoteMachines } from "./RemoteLinks.js";

/**
 * 試験用の偽のチャネルとマシンの一覧（20260927-agent-graph の 04）。チャネルはリモートの `/ws` の 1 接続の代わりに、送られた要求を記録し、
 * 応答・イベント・SNAPSHOT を手で返せる。
 */
export class FakeLinkChannel implements LinkChannel {
  static nextId = 1;
  readonly id = FakeLinkChannel.nextId++;
  readonly pendingBytes = 0;
  readonly sentText: string[] = [];
  closedWith: number | null = null;
  private readonly textCbs: ((s: string) => void)[] = [];
  private readonly binaryCbs: ((b: Uint8Array) => void)[] = [];
  private readonly closeCbs: ((code: number, reason: string) => void)[] = [];

  sendText(s: string): void {
    if (this.closedWith === null) this.sentText.push(s);
  }
  sendBinary(): void {
    // 使わない
  }
  close(code: number): void {
    this.finish(code);
  }
  onText(cb: (s: string) => void): void {
    this.textCbs.push(cb);
  }
  onBinary(cb: (b: Uint8Array) => void): void {
    this.binaryCbs.push(cb);
  }
  onClose(cb: (code: number, reason: string) => void): void {
    this.closeCbs.push(cb);
  }

  // --- 試験から ---

  /** 送られた要求（JSON）。 */
  requests(): { id: string; method: string; params: Record<string, unknown> }[] {
    return this.sentText.map((s) => JSON.parse(s) as never);
  }
  lastRequest(
    method: string,
  ): { id: string; method: string; params: Record<string, unknown> } | undefined {
    return this.requests()
      .filter((r) => r.method === method)
      .at(-1);
  }
  text(s: string): void {
    if (this.closedWith === null) for (const cb of this.textCbs) cb(s);
  }
  binary(b: Uint8Array): void {
    if (this.closedWith === null) for (const cb of this.binaryCbs) cb(b);
  }
  reply(id: string, result: unknown): void {
    this.text(JSON.stringify({ id, result }));
  }
  replyError(id: string, code: string, message = code): void {
    this.text(JSON.stringify({ id, error: { code, message } }));
  }
  /** hello の応答（最後の client.hello へ）。 */
  hello(snapshot: SessionSnapshot, clientId = "c1"): void {
    const req = this.lastRequest("client.hello");
    if (req === undefined) throw new Error("no client.hello");
    this.reply(req.id, { clientId, snapshot });
  }
  event(event: string, data: unknown): void {
    this.text(JSON.stringify({ event, data }));
  }
  snapshotFrame(paneId: string, text: string): void {
    this.binary(encodeSnapshotFrame(paneId, 80, 24, text));
  }
  /** リモート（ssh）側から閉じた。 */
  remoteClose(code = 1012): void {
    this.finish(code);
  }

  private finish(code: number): void {
    if (this.closedWith !== null) return;
    this.closedWith = code;
    for (const cb of this.closeCbs) cb(code, "");
  }
}

export class FakeMachines implements RemoteMachines {
  readonly channels: FakeLinkChannel[] = [];
  private readonly cbs: ((list: MachineStatus[]) => void)[] = [];
  statuses: MachineStatus[] = [];

  constructor(machines: { id: string; label: string; online?: boolean }[]) {
    this.statuses = machines.map((m) => ({
      id: m.id,
      label: m.label,
      state: m.online === false ? "reconnecting" : "online",
      message: null,
    }));
  }

  route(selector: string): ReturnType<RemoteMachines["route"]> {
    const m = this.statuses.find((s) => s.id === selector);
    if (m === undefined) return { kind: "unknown" };
    if (m.state !== "online") return { kind: "offline" };
    return {
      kind: "ok",
      link: {
        openChannel: () => {
          const ch = new FakeLinkChannel();
          this.channels.push(ch);
          return ch;
        },
      },
    };
  }
  list(): MachineStatus[] {
    return this.statuses;
  }
  onChanged(cb: (list: MachineStatus[]) => void): void {
    this.cbs.push(cb);
  }
  setOnline(id: string, online: boolean): void {
    this.statuses = this.statuses.map((s) =>
      s.id === id ? { ...s, state: online ? "online" : "reconnecting" } : s,
    );
    for (const cb of this.cbs) cb(this.statuses);
  }
  last(): FakeLinkChannel {
    const ch = this.channels.at(-1);
    if (ch === undefined) throw new Error("no channel");
    return ch;
  }
}

export function remoteSnapshot(panes: SessionSnapshot["panes"] = []): SessionSnapshot {
  return {
    protocol: 1,
    serverVersion: "test",
    host: { os: "linux", windowsBuild: null, hostname: "remote" },
    workspaces: [],
    tabs: [],
    panes,
    groups: [],
    focus: null,
    limits: { scrollbackLines: 5000 },
  };
}

/** マイクロタスク・fetch の偽の応答を片付ける。 */
export const settle = (): Promise<void> => new Promise((r) => setImmediate(r));
