import {
  DESKTOP_ENDPOINT_PROTOCOL,
  DESKTOP_ENDPOINT_CHILDREN,
  desktopEndpointLane,
} from "@sodashitsu/protocol";
import { DesktopEndpointWire } from "@sodashitsu/client-core/desktop/DesktopEndpointWire";
import { desktopEndpointChildProof } from "@sodashitsu/client-core/desktop/DesktopEndpointBinding";
import type {
  DesktopEndpointIdentity,
  DesktopE2eHello,
} from "@sodashitsu/client-core/desktop/DesktopE2e";
import {
  desktopBrowserIdentity,
  desktopEndpointPeer,
  desktopEndpointMode,
  onDesktopEndpointChanged,
} from "./desktopEndpointIdentity.js";
type Invite = { id: string; parent: string; protocol: string; ticket: string };
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
const childProtocols = new Set(DESKTOP_ENDPOINT_CHILDREN.values());
const unavailable = "暗号化接続の鍵・指紋・接続先の許可を確認してください";
class BrowserRoot {
  readonly session = crypto.randomUUID();
  readonly credentials: Promise<{ identity: DesktopEndpointIdentity; fingerprint: string }>;
  readonly invites = new Map<string, Invite>();
  readonly sockets = new Set<DesktopEndpointSocket>();
  closed = false;
  private readonly unsubscribe: () => void;
  constructor(readonly machine: string) {
    this.unsubscribe = onDesktopEndpointChanged(machine, () => this.close());
    this.credentials = Promise.all([desktopBrowserIdentity(), desktopEndpointPeer(machine)]).then(
      ([identity, fingerprint]) => {
        if (this.closed) throw Error(unavailable);
        return { identity, fingerprint };
      },
    );
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    this.invites.clear();
    for (const socket of [...this.sockets]) socket.close();
    this.sockets.clear();
  }
}
/** WebSocket API at the existing viewer boundary. The native socket is created
 * only after local keys/pin have loaded. Its messages are exclusively public
 * handshakes or ciphertext; onopen waits for B's encrypted private-lane ACK. */
class DesktopEndpointSocket extends EventTarget implements WebSocket {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly extensions = "";
  readonly url: string;
  protocol = "";
  private outputType: BinaryType = "blob";
  get binaryType(): BinaryType {
    return this.outputType;
  }
  set binaryType(value: BinaryType) {
    this.outputType = value;
    if (this.delegate) this.delegate.binaryType = value;
  }
  readyState = 0;
  private native: WebSocket | undefined;
  private delegate: WebSocket | undefined;
  private wire: DesktopEndpointWire | undefined;
  private opening = false;
  private stopped = false;
  private stopReason = "";
  private readonly session: string;
  private pending = 0;
  private pendingBytes = 0;
  private sending = Promise.resolve();
  private handlers = new Map<string, EventListener>();
  constructor(
    url: string | URL,
    private readonly protocols: readonly string[],
    private readonly root: BrowserRoot | undefined,
    private readonly invite?: Invite,
    private readonly initialError?: boolean,
    private readonly select?: () => Promise<WebSocket>,
  ) {
    super();
    this.url = new URL(url, location.href).href;
    this.session = invite ? crypto.randomUUID() : (root?.session ?? "");
    root?.sockets.add(this);
    void this.connect().catch(() => this.fail());
  }
  get bufferedAmount(): number {
    return (
      this.delegate?.bufferedAmount ??
      this.pendingBytes + (this.native?.bufferedAmount ?? 0) + (this.wire?.bufferedAmount ?? 0)
    );
  }
  private handler(type: string): EventListener | null {
    return this.handlers.get(type) ?? null;
  }
  private setHandler(type: string, value: EventListener | null): void {
    const old = this.handlers.get(type);
    if (old) this.removeEventListener(type, old);
    this.handlers.delete(type);
    if (value) {
      this.handlers.set(type, value);
      this.addEventListener(type, value);
    }
  }
  get onopen(): WebSocket["onopen"] {
    return this.handler("open") as WebSocket["onopen"];
  }
  set onopen(value: WebSocket["onopen"]) {
    this.setHandler("open", value as EventListener | null);
  }
  get onmessage(): WebSocket["onmessage"] {
    return this.handler("message") as WebSocket["onmessage"];
  }
  set onmessage(value: WebSocket["onmessage"]) {
    this.setHandler("message", value as EventListener | null);
  }
  get onclose(): WebSocket["onclose"] {
    return this.handler("close") as WebSocket["onclose"];
  }
  set onclose(value: WebSocket["onclose"]) {
    this.setHandler("close", value as EventListener | null);
  }
  get onerror(): WebSocket["onerror"] {
    return this.handler("error") as WebSocket["onerror"];
  }
  set onerror(value: WebSocket["onerror"]) {
    this.setHandler("error", value as EventListener | null);
  }
  addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: WebSocket, event: WebSocketEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener, options);
  }
  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: WebSocket, event: WebSocketEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener, options);
  }
  private active(): boolean {
    return !this.stopped && !!this.root && !this.root.closed;
  }
  private async connect(): Promise<void> {
    if (this.select) {
      const selected = await this.select();
      if (this.stopped) {
        selected.close();
        return;
      }
      this.delegate = selected;
      selected.binaryType = this.binaryType;
      selected.onopen = () => {
        if (this.stopped) return;
        this.readyState = WebSocket.OPEN;
        this.protocol = selected.protocol;
        this.dispatchEvent(new Event("open"));
      };
      selected.onmessage = (event) => {
        if (!this.stopped)
          this.dispatchEvent(
            new MessageEvent("message", { data: event.data, origin: event.origin }),
          );
      };
      selected.onerror = () => {
        if (!this.stopped) this.dispatchEvent(new Event("error"));
      };
      selected.onclose = (event) => {
        this.stopReason = event.reason;
        this.finish(event.wasClean, event.code);
      };
      if (selected.readyState === WebSocket.OPEN) selected.onopen.call(selected, new Event("open"));
      else if (selected.readyState >= WebSocket.CLOSING) this.fail();
      return;
    }
    if (this.initialError || !this.root) throw Error(unavailable);
    const { identity, fingerprint } = await this.root.credentials;
    if (!this.active()) throw Error(unavailable);
    const address = new URL("/desktop-e2e", this.url);
    this.native = new WebSocket(address, DESKTOP_ENDPOINT_PROTOCOL);
    this.native.binaryType = "arraybuffer";
    const socket = this.native;
    this.wire = new DesktopEndpointWire({
      crypto,
      identity,
      session: this.session,
      role: "viewer",
      peerRole: "provider",
      expectedFingerprint: fingerprint,
      active: () => this.active(),
      sendRaw: (raw) => {
        if (
          !this.active() ||
          socket.readyState !== WebSocket.OPEN ||
          socket.bufferedAmount > 8 * 1024 * 1024
        )
          throw Error(unavailable);
        if (typeof raw === "string") {
          const message = JSON.parse(raw) as { type: string; hello?: DesktopE2eHello };
          if (message.type === "hello" && message.hello?.generation === 1 && !this.opening) {
            this.opening = true;
            const hello = message.hello;
            if (this.invite) {
              const invite = this.invite;
              void desktopEndpointChildProof(
                crypto,
                invite.ticket,
                invite.parent,
                invite.id,
                invite.protocol,
                hello,
              )
                .then((binding) => {
                  if (!this.active() || socket.readyState !== WebSocket.OPEN)
                    throw Error(unavailable);
                  socket.send(
                    JSON.stringify({
                      type: "viewer",
                      machineId: this.root!.machine,
                      session: this.session,
                      hello,
                      parent: invite.parent,
                      attachment: invite.id,
                      binding,
                    }),
                  );
                })
                .catch(() => this.fail());
            } else
              socket.send(
                JSON.stringify({
                  type: "viewer",
                  machineId: this.root!.machine,
                  session: this.session,
                  hello,
                }),
              );
            return;
          }
        }
        socket.send(typeof raw === "string" ? raw : new Uint8Array(raw));
      },
      onReady: () => {
        const request = encoder.encode(
            JSON.stringify({ type: "connect", protocols: this.protocols }),
          ),
          record = new Uint8Array(request.length + 1);
        record[0] = 2;
        record.set(request, 1);
        void this.wire!.send("control", record).catch(() => this.fail());
      },
      onRecord: (lane, borrowed) => {
        if (!this.active() || !borrowed.length) throw Error(unavailable);
        const kind = borrowed[0],
          payload = new Uint8Array(borrowed.subarray(1));
        if (kind === 3) {
          if (lane !== "control" || payload.length || this.readyState !== WebSocket.CONNECTING)
            throw Error(unavailable);
          this.protocol = this.protocols[0] ?? "";
          this.readyState = WebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          return;
        }
        if (
          this.readyState !== WebSocket.OPEN ||
          (kind !== 0 && kind !== 1) ||
          lane !== desktopEndpointLane(this.invite?.protocol, payload, kind === 0)
        )
          throw Error(unavailable);
        let data: string | ArrayBuffer | Blob;
        if (kind === 1) {
          const message = JSON.parse(decoder.decode(payload)) as {
            type: string;
            ticket?: string;
            e2eAttach?: { parent: string; id: string; protocol: string };
          };
          if (message.e2eAttach) {
            const info = message.e2eAttach,
              protocol = DESKTOP_ENDPOINT_CHILDREN.get(message.type);
            if (
              this.invite ||
              info.parent !== this.root!.session ||
              info.protocol !== protocol ||
              typeof info.id !== "string" ||
              !/^[a-f0-9-]{36}$/.test(info.id) ||
              !message.ticket ||
              !/^[A-Za-z0-9_-]{43}$/.test(message.ticket)
            )
              throw Error(unavailable);
            this.root!.invites.set(info.protocol, { ...info, ticket: message.ticket });
            delete message.e2eAttach;
          }
          data = JSON.stringify(message);
        } else data = this.binaryType === "arraybuffer" ? payload.buffer : new Blob([payload]);
        this.dispatchEvent(new MessageEvent("message", { data, origin: new URL(this.url).origin }));
      },
      onClose: () => this.fail(),
    });
    socket.onmessage = (event) => {
      void this.wire!.receive(
        typeof event.data === "string" ? event.data : new Uint8Array(event.data),
      ).catch(() => this.fail());
    };
    socket.onerror = () => this.fail();
    socket.onclose = () => this.fail();
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.addEventListener("close", () => reject(Error(unavailable)), { once: true });
      socket.addEventListener("error", () => reject(Error(unavailable)), { once: true });
    });
    if (!this.active()) throw Error(unavailable);
    await this.wire.start();
  }
  send(data: Parameters<WebSocket["send"]>[0]): void {
    if (this.readyState === WebSocket.CONNECTING)
      throw new DOMException("Socket is connecting", "InvalidStateError");
    if (this.readyState !== WebSocket.OPEN) return;
    if (this.delegate) {
      this.delegate.send(data);
      return;
    }
    const size =
      typeof data === "string"
        ? data.length * 3
        : data instanceof Blob
          ? data.size
          : data.byteLength;
    if (
      size > 4 * 1024 * 1024 - 64 ||
      this.pending >= 32 ||
      this.pendingBytes + size > 16 * 1024 * 1024
    ) {
      this.fail();
      return;
    }
    const snapshot =
      typeof data === "string"
        ? encoder.encode(data)
        : data instanceof Blob
          ? data
          : ArrayBuffer.isView(data)
            ? new Uint8Array(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
            : new Uint8Array(new Uint8Array(data));
    this.pending++;
    this.pendingBytes += size;
    const task = this.sending.then(async () => {
      if (!this.active() || this.readyState !== WebSocket.OPEN) throw Error(unavailable);
      const raw =
        snapshot instanceof Blob ? new Uint8Array(await snapshot.arrayBuffer()) : snapshot;
      try {
        if (!this.active()) throw Error(unavailable);
        const binary = typeof data !== "string",
          record = new Uint8Array(raw.length + 1);
        record[0] = binary ? 0 : 1;
        record.set(raw, 1);
        await this.wire!.send(desktopEndpointLane(this.invite?.protocol, raw, binary), record);
      } finally {
        raw.fill(0);
      }
    });
    this.sending = task
      .catch(() => this.fail())
      .finally(() => {
        if (snapshot instanceof Uint8Array) snapshot.fill(0);
        this.pending--;
        this.pendingBytes -= size;
      });
  }
  close(code = 1000, reason = ""): void {
    if (code !== 1000 && (code < 3000 || code > 4999))
      throw new DOMException("Invalid close code", "InvalidAccessError");
    if (encoder.encode(reason).length > 123)
      throw new DOMException("Close reason too long", "SyntaxError");
    if (this.stopped) return;
    this.stopReason = reason;
    this.finish();
  }
  private fail(): void {
    if (this.stopped) return;
    this.stopReason = unavailable;
    this.dispatchEvent(new Event("error"));
    this.finish(false);
  }
  private finish(clean = true, code = clean ? 1000 : 1008): void {
    if (this.stopped) return;
    const reason = this.stopReason;
    this.stopped = true;
    this.readyState = WebSocket.CLOSING;
    this.delegate?.close();
    this.wire?.close();
    this.native?.close();
    this.root?.sockets.delete(this);
    if (!this.invite) this.root?.close();
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code, reason, wasClean: clean }));
  }
}
export function createDesktopSocketFactory(machine: string): {
  open(url: string | URL, protocols?: string | string[]): WebSocket;
  readonly encrypted: boolean;
  dispose(): void;
} {
  let root: BrowserRoot | undefined,
    sticky = false,
    disposed = false,
    revision = 0;
  const legacy = new Set<WebSocket>(),
    selectors = new Set<WebSocket>();
  const close = (keep?: WebSocket) => {
    root?.close();
    for (const socket of legacy) socket.close();
    legacy.clear();
    for (const socket of [...selectors]) if (socket !== keep) socket.close();
  };
  let unsubscribe = () => {};
  try {
    unsubscribe = onDesktopEndpointChanged(machine, () => {
      revision++;
      close();
    });
  } catch {
    /* Legacy mode remains usable when pairing APIs are unsupported. */
  }
  return {
    get encrypted() {
      return sticky;
    },
    dispose: () => {
      disposed = true;
      revision++;
      unsubscribe();
      close();
    },
    open: (url, rawProtocols = []) => {
      const protocols = typeof rawProtocols === "string" ? [rawProtocols] : rawProtocols,
        child = protocols.length === 1 && childProtocols.has(protocols[0]!);
      const epoch = revision;
      let selector: DesktopEndpointSocket;
      selector = new DesktopEndpointSocket(
        url,
        protocols,
        undefined,
        undefined,
        false,
        async () => {
          try {
            const encrypted = sticky || (await desktopEndpointMode(machine));
            if (disposed || epoch !== revision) throw Error(unavailable);
            if (!encrypted) {
              const socket = new WebSocket(url, protocols);
              legacy.add(socket);
              socket.addEventListener?.("close", () => legacy.delete(socket), { once: true });
              return socket;
            }
            sticky = true;
            if (child) {
              const invite = root?.invites.get(protocols[0]!);
              if (!root || !invite) throw Error(unavailable);
              root.invites.delete(protocols[0]!);
              return new DesktopEndpointSocket(url, protocols, root, invite);
            }
            close(selector);
            root = new BrowserRoot(machine);
            return new DesktopEndpointSocket(url, protocols, root);
          } catch {
            sticky = true;
            throw Error(unavailable);
          }
        },
      );
      selectors.add(selector);
      selector.addEventListener("close", () => selectors.delete(selector), { once: true });
      return selector;
    },
  };
}
