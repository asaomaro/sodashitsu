import { expect, it } from "vitest";
import { WorkAgentTerminal } from "./WorkAgentTerminal.js";
const data = (s: string) => Buffer.from(s).toString("base64");
it("deduplicates lost replies in both directions without replaying input or terminal output", () => {
  const terminal = new WorkAgentTerminal("requester"),
    epoch = terminal.epoch;
  const lease = terminal.read("requester", { epoch, ack: 0 }).inputLease;
  const input = { seq: 1, data: data("hello\r"), lease },
    output = { seq: 1, data: data("screen") };
  terminal.read("requester", { epoch, ack: 0, input });
  terminal.read("requester", { epoch, ack: 0, input });
  expect(terminal.exchange({ epoch, ack: 0, output }).input).toMatchObject([input]);
  expect(terminal.exchange({ epoch, ack: 0, output }).input).toMatchObject([input]);
  expect(terminal.read("requester", { epoch, ack: 0 }).output).toEqual([output]);
  expect(terminal.exchange({ epoch, ack: 1 }).input).toEqual([]);
  expect(terminal.read("requester", { epoch, ack: 1 }).output).toEqual([]);
});
it("rejects another requester, a stale epoch, a sequence gap and an ACK of undelivered data", () => {
  const terminal = new WorkAgentTerminal("requester"),
    epoch = terminal.epoch;
  expect(() => terminal.read("other", { epoch, ack: 0 })).toThrow(/another/);
  expect(() => terminal.exchange({ epoch: "stale", ack: 0 })).toThrow(/generation/);
  expect(() => terminal.exchange({ epoch, ack: 0, output: { seq: 2, data: data("bad") } })).toThrow(
    /gap/,
  );
  terminal.read("requester", { epoch, ack: 0, input: { seq: 1, data: data("x") } });
  expect(() => terminal.exchange({ epoch, ack: 1 })).toThrow(/ACK/);
  terminal.exchange({ epoch, ack: 0, output: { seq: 1, data: data("x") } });
  expect(() => terminal.read("requester", { epoch, ack: 1 })).toThrow(/ACK/);
});
it("discards old keys after a connection interruption while retaining their sequence ACK", () => {
  let now = 0;
  const terminal = new WorkAgentTerminal("r", () => now),
    epoch = terminal.epoch;
  const lease = terminal.read("r", { epoch, ack: 0 }).inputLease;
  terminal.read("r", { epoch, ack: 0, input: { seq: 1, data: data("dangerous\r"), lease } });
  now = 1001;
  expect(terminal.exchange({ epoch, ack: 0 }).input).toEqual([{ seq: 1, discarded: true }]);
  expect(terminal.exchange({ epoch, ack: 1 }).input).toEqual([]);
});
it("bounds input and output memory and releases all queues after closure", () => {
  const terminal = new WorkAgentTerminal("r"),
    epoch = terminal.epoch,
    chunk = data("x".repeat(32768));
  for (let seq = 1; seq <= 2; seq++)
    terminal.read("r", { epoch, ack: 0, input: { seq, data: chunk } });
  expect(() => terminal.read("r", { epoch, ack: 0, input: { seq: 3, data: chunk } })).toThrow(
    /full/,
  );
  for (let seq = 1; seq <= 128; seq++)
    terminal.exchange({ epoch, ack: 0, output: { seq, data: chunk } });
  expect(() => terminal.exchange({ epoch, ack: 0, output: { seq: 129, data: chunk } })).toThrow(
    /full/,
  );
  terminal.close();
  expect(() => terminal.read("r", { epoch, ack: 0 })).toThrow(/ended/);
});
it("does not let an executor keep an abandoned requester alive or vice versa", () => {
  let now = 0;
  const t = new WorkAgentTerminal("r", () => now);
  now = 15001;
  expect(() => t.exchange({ epoch: t.epoch, ack: 0 })).toThrow(/requester_disconnected/);
  now = 0;
  const s = new WorkAgentTerminal("r", () => now);
  for (now = 10000; now <= 70000; now += 10000) s.read("r", { epoch: s.epoch, ack: 0 });
  now = 75001;
  expect(() => s.read("r", { epoch: s.epoch, ack: 0 })).toThrow(/executor_disconnected/);
});
it.each(["Zg=", "Zh==", "", data("x".repeat(32769))])(
  "rejects noncanonical or oversized terminal bytes",
  (value) => {
    const t = new WorkAgentTerminal("r");
    expect(() => t.read("r", { epoch: t.epoch, ack: 0, input: { seq: 1, data: value } })).toThrow();
  },
);

it("includes admission/validation delay in a server-issued input lease", () => {
  let now = 0;
  const t = new WorkAgentTerminal("r", () => now),
    epoch = t.epoch,
    lease = t.read("r", { epoch, ack: 0 }).inputLease;
  now = 2000;
  t.read("r", { epoch, ack: 0, input: { seq: 1, data: data("old enter\r"), lease } });
  expect(t.exchange({ epoch, ack: 0 }).input).toEqual([{ seq: 1, discarded: true }]);
});
