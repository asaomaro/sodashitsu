import { expect, it, vi } from "vitest";
import { DesktopInputAcks } from "./DesktopInputAcks.js";
it("accepts fragmented negotiated ACKs once, only for outstanding submitted inputs", () => {
  const ack = vi.fn(),
    pipe = new DesktopInputAcks(ack);
  pipe.submitted(1);
  pipe.push(Buffer.from("SODA_DESKTOP_INPUT_ACK 1\n"));
  expect(ack).not.toHaveBeenCalled();
  pipe.enabled = true;
  pipe.push(Buffer.from("SODA_DESKTOP_IN"));
  pipe.push(Buffer.from("PUT_ACK 1\r\nSODA_DESKTOP_INPUT_ACK 1\nSODA_DESKTOP_INPUT_ACK 2\n"));
  expect(ack.mock.calls).toEqual([[1]]);
  pipe.submitted(2);
  pipe.ack(2);
  pipe.push(Buffer.from("SODA_DESKTOP_INPUT_ACK 2\n"));
  expect(ack.mock.calls).toEqual([[1], [2]]);
});
it("discards diagnostics, oversized/non-ASCII lines and forged sequence values without forwarding contents", () => {
  const ack = vi.fn(),
    pipe = new DesktopInputAcks(ack);
  pipe.enabled = true;
  pipe.submitted(7);
  for (const line of [
    "path/window title",
    '{"type":"input_ack","seq":7}',
    "SODA_DESKTOP_INPUT_ACK 0",
    "SODA_DESKTOP_INPUT_ACK 07",
    "SODA_DESKTOP_INPUT_ACK 9007199254740992",
    "x".repeat(100000) + "SODA_DESKTOP_INPUT_ACK 7",
    "éSODA_DESKTOP_INPUT_ACK 7",
  ])
    pipe.push(Buffer.from(line + "\n"));
  expect(ack).not.toHaveBeenCalled();
  pipe.push(Buffer.from("SODA_DESKTOP_INPUT_ACK 7\n"));
  expect(ack.mock.calls).toEqual([[7]]);
});
it("keeps at most 64 outstanding inputs even when the helper never acknowledges", () => {
  const ack = vi.fn(),
    pipe = new DesktopInputAcks(ack);
  pipe.enabled = true;
  for (let seq = 1; seq <= 100; seq++) pipe.submitted(seq);
  for (let seq = 1; seq <= 100; seq++) pipe.push(Buffer.from(`SODA_DESKTOP_INPUT_ACK ${seq}\n`));
  expect(ack.mock.calls).toEqual(Array.from({ length: 64 }, (_, i) => [i + 37]));
});
const witness = {
  epoch: "11111111-1111-4111-8111-111111111111",
  x: -400,
  y: 50,
  window: 42,
  pid: 7,
};
const pointerLine = (seq: number, change: Partial<typeof witness> = {}) => {
  const p = { ...witness, ...change };
  return `SODA_DESKTOP_POINTER_ACK ${seq} ${p.epoch} ${p.x} ${p.y} ${p.window} ${p.pid}\n`;
};
it.each(["pipe", "json"])(
  "invalidates pending pointer metadata while preserving its %s input ACK",
  (mode) => {
    const ack = vi.fn(),
      point = vi.fn(),
      pipe = new DesktopInputAcks(ack, point);
    pipe.enabled = pipe.pointerEnabled = true;
    pipe.submitted(1, true);
    pipe.invalidatePointers();
    if (mode === "pipe") pipe.push(Buffer.from(pointerLine(1)));
    else pipe.ack(1, witness);
    expect(point).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledExactlyOnceWith(1);
    pipe.submitted(2, true);
    if (mode === "pipe") pipe.push(Buffer.from(pointerLine(2)));
    else pipe.ack(2, witness);
    expect(point).toHaveBeenCalledExactlyOnceWith(2, witness);
  },
);
it("accepts a fragmented negotiated pointer witness only for the submitted down before its public ACK", () => {
  const order: string[] = [],
    ack = vi.fn((seq: number) => order.push(`ack${seq}`)),
    point = vi.fn((seq: number) => order.push(`point${seq}`)),
    pipe = new DesktopInputAcks(ack, point);
  pipe.enabled = pipe.pointerEnabled = true;
  pipe.submitted(1, true);
  const line = pointerLine(1);
  pipe.push(Buffer.from(line.slice(0, 35)));
  expect(ack).not.toHaveBeenCalled();
  pipe.push(Buffer.from(line.slice(35)));
  expect(point).toHaveBeenCalledExactlyOnceWith(1, witness);
  expect(order).toEqual(["point1", "ack1"]);
  pipe.push(Buffer.from(line));
  pipe.push(Buffer.from("SODA_DESKTOP_INPUT_ACK 1\n"));
  expect(ack).toHaveBeenCalledOnce();
});
it("does not consume a pending input for malformed, unrequested or unnegotiated pointer metadata", () => {
  const ack = vi.fn(),
    point = vi.fn(),
    pipe = new DesktopInputAcks(ack, point);
  pipe.enabled = true;
  pipe.submitted(1, true);
  pipe.ack(1,witness);
  expect(ack).not.toHaveBeenCalled();
  pipe.push(Buffer.from(pointerLine(1)));
  expect(ack).not.toHaveBeenCalled();
  pipe.pointerEnabled = true;
  for (const change of [
    { epoch: "-".repeat(36) },
    { x: 2147483648 },
    { pid: 0 },
    { window: 9007199254740992 },
    { window: 0 },
  ])
    pipe.push(Buffer.from(pointerLine(1, change)));
  pipe.push(Buffer.from(pointerLine(9)));
  pipe.push(Buffer.from("é" + pointerLine(1)));
  pipe.push(Buffer.from("x".repeat(200) + pointerLine(1)));
  expect(point).not.toHaveBeenCalled();
  expect(ack).not.toHaveBeenCalled();
  pipe.push(Buffer.from(pointerLine(1)));
  expect(point).toHaveBeenCalledExactlyOnceWith(1, witness);
  expect(ack).toHaveBeenCalledExactlyOnceWith(1);
  pipe.submitted(2, false);
  pipe.push(Buffer.from(pointerLine(2)));
  expect(ack).toHaveBeenCalledTimes(1);
  pipe.push(Buffer.from("SODA_DESKTOP_INPUT_ACK 2\n"));
  expect(ack).toHaveBeenCalledTimes(2);
});
it("keeps structured witnesses private and rejects unknown fields without consuming the legitimate input", () => {
  const ack = vi.fn(),
    point = vi.fn(),
    pipe = new DesktopInputAcks(ack, point);
  pipe.pointerEnabled = true;
  pipe.submitted(4, true);
  pipe.ack(4, { ...witness, path: "unrequested" });
  expect(ack).not.toHaveBeenCalled();
  pipe.ack(4, witness);
  expect(point).toHaveBeenCalledExactlyOnceWith(4, witness);
  expect(ack).toHaveBeenCalledExactlyOnceWith(4);
});
