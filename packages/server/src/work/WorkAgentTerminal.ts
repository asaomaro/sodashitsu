import { randomUUID } from "node:crypto";
import { RpcError } from "@sodashitsu/protocol";

export interface WorkTerminalOutput {
  seq: number;
  data: string;
  snapshot?: true | undefined;
}
export interface WorkTerminalInput {
  seq: number;
  data?: string | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
  lease?: string | undefined;
}
export type WorkTerminalDelivery =
  (WorkTerminalInput & { expiresInMs: number }) | { seq: number; discarded: true };
const CHUNK = 32768,
  OUTPUT_LIMIT = 4 * 1024 * 1024,
  INPUT_LIMIT = 65536;
function bytes(data: string): number {
  if (
    typeof data !== "string" ||
    data.length > Math.ceil(CHUNK / 3) * 4 ||
    !data.length ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
  )
    throw new RpcError("invalid_params", "Invalid terminal chunk");
  const value = Buffer.from(data, "base64");
  if (value.length > CHUNK || value.toString("base64") !== data)
    throw new RpcError("invalid_params", "Invalid terminal encoding");
  return value.length;
}
function sequence(seq: number): void {
  if (!Number.isSafeInteger(seq) || seq < 0)
    throw new RpcError("invalid_params", "Invalid terminal sequence");
}

/** Volatile duplex queue. Authority and work scope are checked by the caller.
 * Only requester reads renew its lease; an executor cannot keep an abandoned
 * requester alive. ACKs never consume data not previously delivered to that side.
 */
export class WorkAgentTerminal {
  readonly epoch = randomUUID();
  private outputs: WorkTerminalOutput[] = [];
  private inputs: WorkTerminalInput[] = [];
  private outputBytes = 0;
  private inputBytes = 0;
  private outputSeq = 0;
  private inputSeq = 0;
  private outputRead = 0;
  private inputRead = 0;
  private outputAck = 0;
  private inputAck = 0;
  private touched: number;
  private executorTouched: number;
  private readonly inputTimes = new Map<number, number>();
  private readonly leases = new Map<string, number>();
  private ended?: string;
  constructor(
    readonly owner: string,
    private readonly now = Date.now,
  ) {
    this.touched = this.executorTouched = now();
  }
  get closedReason() {
    return this.ended;
  }
  close(reason = "closed"): void {
    if (this.ended) return;
    this.ended = reason;
    this.outputs = [];
    this.inputs = [];
    this.outputBytes = this.inputBytes = 0;
    this.inputTimes.clear();
    this.leases.clear();
  }
  private live(epoch: string): void {
    if (this.now() - this.touched > 15000) this.close("requester_disconnected");
    if (this.now() - this.executorTouched > 75000) this.close("executor_disconnected");
    if (this.ended) throw new RpcError("not_found", `Terminal relay ended: ${this.ended}`);
    if (epoch !== this.epoch) throw new RpcError("unauthorized", "Terminal generation changed");
  }
  read(owner: string, p: { epoch: string; ack: number; input?: WorkTerminalInput | undefined }) {
    if (owner !== this.owner)
      throw new RpcError("unauthorized", "Terminal relay belongs to another connection");
    this.live(p.epoch);
    sequence(p.ack);
    if (p.ack < this.outputAck || p.ack > this.outputRead)
      throw new RpcError("invalid_params", "Invalid terminal output ACK");
    if (p.input) {
      const input = p.input;
      sequence(input.seq);
      if (input.seq > this.inputSeq + 1) throw new RpcError("invalid_params", "Terminal input gap");
      if (input.seq === this.inputSeq + 1) {
        let size = 0;
        if (input.data !== undefined) {
          if (input.cols !== undefined || input.rows !== undefined)
            throw new RpcError("invalid_params", "Mixed terminal input");
          size = bytes(input.data);
        } else if (
          !Number.isInteger(input.cols) ||
          !Number.isInteger(input.rows) ||
          input.cols! < 2 ||
          input.cols! > 500 ||
          input.rows! < 2 ||
          input.rows! > 300
        )
          throw new RpcError("invalid_params", "Invalid terminal size");
        if (this.inputBytes + size > INPUT_LIMIT || this.inputs.length >= 128)
          throw new RpcError("input_queue_full", "Terminal input queue is full");
        this.inputs.push({ ...input });
        this.inputTimes.set(
          input.seq,
          input.data !== undefined ? (this.leases.get(input.lease ?? "") ?? 0) - 1000 : this.now(),
        );
        this.inputSeq = input.seq;
        this.inputBytes += size;
      }
    }
    while (this.outputs[0] && this.outputs[0].seq <= p.ack)
      this.outputBytes -= Buffer.byteLength(this.outputs.shift()!.data, "base64");
    this.outputAck = p.ack;
    this.touched = this.now();
    const output = this.outputs.slice(0, 4);
    if (output.length) this.outputRead = Math.max(this.outputRead, output.at(-1)!.seq);
    const inputLease = randomUUID();
    this.leases.set(inputLease, this.now() + 1000);
    if (this.leases.size > 32) this.leases.delete(this.leases.keys().next().value!);
    return {
      epoch: this.epoch,
      inputLease,
      output: output.map((v) => ({ ...v })),
      inputAck: this.inputSeq,
      connected: this.now() - this.executorTouched <= 3000,
    };
  }
  exchange(p: { epoch: string; ack: number; output?: WorkTerminalOutput | undefined }) {
    this.live(p.epoch);
    sequence(p.ack);
    if (p.ack < this.inputAck || p.ack > this.inputRead)
      throw new RpcError("invalid_params", "Invalid terminal input ACK");
    if (p.output) {
      const output = p.output;
      sequence(output.seq);
      if (output.seq > this.outputSeq + 1)
        throw new RpcError("invalid_params", "Terminal output gap");
      if (output.seq === this.outputSeq + 1) {
        const size = bytes(output.data);
        if (this.outputBytes + size > OUTPUT_LIMIT || this.outputs.length >= 256)
          throw new RpcError("server_busy", "Terminal output queue is full");
        this.outputs.push({ ...output });
        this.outputSeq = output.seq;
        this.outputBytes += size;
      }
    }
    while (this.inputs[0] && this.inputs[0].seq <= p.ack) {
      const value = this.inputs.shift()!;
      this.inputTimes.delete(value.seq);
      if (value.data) this.inputBytes -= Buffer.byteLength(value.data, "base64");
    }
    this.inputAck = p.ack;
    this.executorTouched = this.now();
    const input = this.inputs.slice(0, 4);
    if (input.length) this.inputRead = Math.max(this.inputRead, input.at(-1)!.seq);
    return {
      epoch: this.epoch,
      input: input.map((v): WorkTerminalDelivery =>
        this.now() - this.inputTimes.get(v.seq)! >= 1000
          ? { seq: v.seq, discarded: true }
          : { ...v, expiresInMs: Math.max(0, 1000 - (this.now() - this.inputTimes.get(v.seq)!)) },
      ),
      outputAck: this.outputSeq,
    };
  }
}
