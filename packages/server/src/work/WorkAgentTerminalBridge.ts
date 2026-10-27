import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { WorkAgentReconnect } from "./WorkAgentReconnect.js";

/** An executor-owned, fixed-pane sink. The requester never receives pane APIs. */
export class WorkAgentTerminalBridge {
  private readonly sinkId = `work-terminal-${crypto.randomUUID()}`;
  private output: { seq: number; data: string; snapshot?: true }[] = [];
  private queued = 0;
  private seq = 0;
  private ack = 0;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private readonly host: TerminalHost,
    private readonly remote: WorkAgentReconnect,
    private readonly request: { id: string; claim: string; epoch: string },
    private readonly guard: () => void,
    private readonly resize: (cols: number, rows: number) => void,
    private readonly failed: () => void,
  ) {
    const bridge = this;
    host.fanout.subscribe(
      {
        clientId: this.sinkId,
        get bufferedAmount() {
          return bridge.queued;
        },
        sendOutput: (_id, chunk) => this.push(chunk),
        sendSnapshot: (_id, _cols, _rows, text) =>
          this.push(Buffer.from("\x1b[2J\x1b[H" + text), true),
      },
      0,
    );
    this.schedule(0);
  }
  private push(bytes: Uint8Array, snapshot = false) {
    if (this.stopped) return;
    if (this.queued + bytes.byteLength > 4 * 1024 * 1024) {
      this.dispose();
      this.failed();
      return;
    }
    for (let at = 0; at < bytes.byteLength; at += 32768) {
      const data = Buffer.from(bytes.subarray(at, at + 32768));
      this.output.push({
        seq: ++this.seq,
        data: data.toString("base64"),
        ...(snapshot && at === 0 ? { snapshot: true as const } : {}),
      });
      this.queued += data.length;
    }
  }
  private schedule(ms: number) {
    if (!this.stopped) this.timer = setTimeout(() => void this.pump(), ms);
  }
  private async pump() {
    try {
      this.guard();
      await this.remote.ready();
      this.guard();
      if (this.stopped) return;
      const output = this.output[0],
        started = performance.now();
      const response = await this.remote.request("work.agent_terminal_exchange", {
        ...this.request,
        ack: this.ack,
        ...(output ? { output } : {}),
      });
      if (this.stopped) return;
      this.guard();
      if (response.epoch !== this.request.epoch) throw Error("Terminal generation changed");
      if (output) {
        if (response.outputAck !== output.seq) throw Error("Terminal output ACK changed");
        this.output.shift();
        this.queued -= Buffer.byteLength(output.data, "base64");
      }
      const previousAck = this.ack;
      for (const input of response.input) {
        if (input.seq <= this.ack) continue;
        if (input.seq !== this.ack + 1) throw Error("Terminal input gap");
        if (!("discarded" in input) && performance.now() - started < input.expiresInMs) {
          this.guard();
          if (input.data !== undefined) {
            if (Buffer.from(input.data, "base64").includes(0x1a))
              throw Error("Job suspension is not supported by this agent terminal");
            if (!this.host.writeInput?.(Buffer.from(input.data, "base64")))
              throw Error("Terminal input queue full");
          } else if (input.cols !== undefined && input.rows !== undefined)
            this.resize(input.cols, input.rows);
          else throw Error("Invalid terminal input");
        }
        this.ack = input.seq;
      }
      this.host.fanout.retryStale();
      this.schedule(this.output.length || this.ack !== previousAck ? 0 : 100);
    } catch {
      if (this.stopped) return;
      if (!this.remote.valid()) {
        this.schedule(500);
        return;
      }
      this.dispose();
      this.failed();
    }
  }
  dispose() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    this.host.fanout.unsubscribe(this.sinkId);
    this.output = [];
    this.queued = 0;
  }
}
