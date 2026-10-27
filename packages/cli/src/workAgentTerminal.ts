import { StringDecoder } from "node:string_decoder";
import { AttachKeyFilter } from "./attachKeys.js";
import { TerminalQueryFilter } from "./attachOutput.js";
import {
  ENTER_SCREEN,
  RESTORE_SCREEN,
  processTerminal,
  type AttachTerminal,
} from "./commands/attach.js";
import type { SodaClient } from "./wsClient.js";
import type { ParamsOf } from "@sodashitsu/protocol";
type TerminalInput = NonNullable<ParamsOf<"work.agent_terminal_read">["input"]>;

/** The same authenticated requester connection that created the launch stays open. */
export async function relayWorkAgentTerminal(
  client: SodaClient,
  id: string,
  term: AttachTerminal = processTerminal(),
  outputBacklog = () => process.stdout.writableLength,
) {
  if (!term.isTTY) throw Error("Terminal relay needs a TTY");
  const keys = new AttachKeyFilter(),
    filter = new TerminalQueryFilter();
  let decoder = new StringDecoder("utf8");
  let ended = false,
    failure: Error | undefined,
    wake: (() => void) | undefined,
    epoch: string | undefined,
    ack = 0,
    inputSeq = 0,
    connected = false,
    inputLease: string | undefined;
  const queue: { at: number; value: Omit<TerminalInput, "seq"> }[] = [];
  let pending: TerminalInput | undefined;
  const dispose: (() => void)[] = [];
  const notify = () => wake?.();
  const size = () => {
    const value = term.size();
    const previous = queue.at(-1);
    if (previous && previous.value.data === undefined) queue.pop();
    queue.push({
      at: Date.now(),
      value: {
        cols: Math.max(2, Math.min(500, value.cols)),
        rows: Math.max(2, Math.min(300, value.rows)),
      },
    });
    notify();
  };
  const finish = (error?: Error) => {
    ended = true;
    failure = error;
    notify();
  };
  const pause = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(done, 100);
      function done() {
        clearTimeout(timer);
        wake = undefined;
        resolve();
      }
      wake = done;
    });
  try {
    term.setRawMode(true);
    term.write(ENTER_SCREEN);
    dispose.push(
      term.onInput((bytes) => {
        const { forward, detach } = keys.feed(bytes);
        if (forward.length && connected && !ended) {
          if (
            forward.length > 65536 ||
            queue.length >= 128 ||
            queue.reduce(
              (n, item) => n + (item.value.data ? Buffer.byteLength(item.value.data, "base64") : 0),
              0,
            ) +
              forward.length >
              65536
          )
            return finish(Error("Terminal input queue is full"));
          for (let at = 0; at < forward.length; at += 32768)
            queue.push({
              at: Date.now(),
              value: {
                data: Buffer.from(forward.subarray(at, at + 32768)).toString("base64"),
                ...(inputLease ? { lease: inputLease } : {}),
              },
            });
          notify();
        }
        if (detach) finish();
      }),
      term.onResize(size),
      term.onSignal(() => finish()),
    );
    size();
    while (!ended) {
      if (outputBacklog() > 262144) {
        await pause();
        continue;
      }
      if (!pending && epoch && connected) {
        while (queue[0] && Date.now() - queue[0].at > 1000) queue.shift();
        const next = queue.shift();
        if (next) pending = { seq: ++inputSeq, ...next.value };
      }
      const result = await client.request("work.agent_terminal_read", {
        id,
        ack,
        ...(epoch ? { epoch } : {}),
        ...(pending ? { input: pending } : {}),
      });
      if (ended) break;
      if (result.state === "closed") break;
      if (result.state === "waiting") {
        await pause();
        continue;
      }
      if (epoch && epoch !== result.epoch) throw Error("Terminal generation changed");
      epoch = result.epoch;
      connected = result.connected;
      inputLease = result.inputLease;
      if (!connected) {
        queue.splice(0);
      }
      if (pending) {
        if (result.inputAck !== pending.seq) throw Error("Terminal input ACK changed");
        pending = undefined;
      }
      for (const output of result.output) {
        if (output.seq <= ack) continue;
        if (output.seq !== ack + 1) throw Error("Terminal output gap");
        if (output.snapshot) {
          filter.reset();
          decoder = new StringDecoder("utf8");
        }
        term.write(filter.filter(decoder.write(Buffer.from(output.data, "base64"))));
        ack = output.seq;
      }
      if (!result.output.length && !queue.length) await pause();
    }
    if (failure) throw failure;
  } finally {
    ended = true;
    for (const stop of dispose) stop();
    try {
      term.write(RESTORE_SCREEN);
    } finally {
      term.setRawMode(false);
    }
    await client.request("work.agent_terminal_close", { id }).catch(() => {});
  }
}
