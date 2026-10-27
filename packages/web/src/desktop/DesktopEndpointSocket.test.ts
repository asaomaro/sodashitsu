// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
const state = vi.hoisted(() => ({
  wires: [] as any[],
  ack: undefined as undefined | (() => Promise<void>),
  application: undefined as undefined | (() => Promise<void>),
}));
vi.mock("./desktopEndpointIdentity.js", () => ({
  desktopBrowserIdentity: async () => ({}),
  desktopEndpointPeer: async () => "a".repeat(64),
  desktopEndpointMode: async () => true,
  onDesktopEndpointChanged: () => () => {},
}));
vi.mock("@sodashitsu/client-core/desktop/DesktopEndpointWire", () => ({
  DesktopEndpointWire: class {
    records: Uint8Array[] = [];
    constructor(readonly options: any) {
      state.wires.push(this);
    }
    async start() {
      this.options.onReady();
    }
    send(_lane: string, bytes: Uint8Array) {
      this.records.push(bytes.slice());
      if (bytes[0] === 2)
        queueMicrotask(() => this.options.onRecord("control", new Uint8Array([3])));
      if (bytes[0] === 5 && state.ack) return state.ack();
      if ((bytes[0] === 0 || bytes[0] === 1) && state.application) return state.application();
      return Promise.resolve();
    }
    receive() {
      return Promise.resolve();
    }
    close() {}
    get bufferedAmount() {
      return 0;
    }
  },
}));
import { createDesktopSocketFactory } from "./DesktopEndpointSocket.js";
class NativeSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  bufferedAmount = 0;
  binaryType = "arraybuffer";
  onopen: ((e: Event) => void) | undefined;
  onmessage: any;
  onclose: any;
  onerror: any;
  constructor(..._args: any[]) {
    super();
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    });
  }
  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
}
function gate() {
  let release!: () => void;
  return { promise: new Promise<void>((r) => (release = r)), release: () => release() };
}
afterEach(() => {
  state.wires = [];
  state.ack = state.application = undefined;
  vi.unstubAllGlobals();
});
it.each(["blob", "seal"])(
  "drops queued application output after authenticated EOF while ACK is pending: %s",
  async (phase) => {
    vi.stubGlobal("WebSocket", NativeSocket);
    const factory = createDesktopSocketFactory("generated"),
      socket = factory.open("ws://localhost/desktop-share", ["soda-desktop-input-v1"]),
      errors = vi.fn(),
      closed = vi.fn();
    socket.onerror = errors;
    socket.onclose = closed;
    await flushPromises();
    expect(socket.readyState).toBe(WebSocket.OPEN);
    const wire = state.wires[0],
      application = gate(),
      ack = gate();
    state.ack = () => ack.promise;
    class SlowBlob extends Blob {
      override async arrayBuffer() {
        await application.promise;
        return new Uint8Array([7, 8]).buffer;
      }
    }
    if (phase === "blob") socket.send(new SlowBlob(["generated"]));
    else {
      state.application = () => application.promise;
      socket.send(JSON.stringify({type:"control",enabled:true}));
    }
    socket.send(JSON.stringify({type:"heartbeat"}));
    await flushPromises();
    wire.options.onRecord("control", new Uint8Array([4]));
    expect(socket.readyState).toBe(WebSocket.OPEN); // Public wrapper remains open until its delegate emits close.
    application.release();
    await flushPromises();
    expect(errors).not.toHaveBeenCalled();
    expect(wire.records.filter((b: Uint8Array) => b[0] === 0 || b[0] === 1)).toHaveLength(
      phase === "blob" ? 0 : 1,
    );
    expect(closed).not.toHaveBeenCalled();
    ack.release();
    await flushPromises();
    expect(errors).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed.mock.calls[0]![0].wasClean).toBe(true);
    expect(closed.mock.calls[0]![0].reason).toBe("");
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    factory.dispose();
  },
);
