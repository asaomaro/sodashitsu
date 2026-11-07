import { describe, expect, it } from "vitest";
import { CodexRecordEnvelope } from "./CodexRecordEnvelope.js";
function scan(text: string | Buffer, chunk = 7): boolean {
  const scanner = new CodexRecordEnvelope(), bytes = Buffer.isBuffer(text) ? text : Buffer.from(text);
  for (let at = 0; at < bytes.length; at += chunk) if (!scanner.feed(bytes.subarray(at, at + chunk))) return false;
  return scanner.finish();
}
describe("bounded Codex oversized envelope validator", () => {
  it.each([1, 2, 3, 7, 64, 4096])("validates UTF8, escapes, numbers, arrays and split headers with %s-byte chunks", chunk => {
    const values = [null, true, false, 0, -1, 1.25e-10, "猫🙂\\\"\n\t", [], {}, [null, { x: [1, "a"] }], { content: [{ type: "input_image", image_url: "data:image/png;base64," + "A".repeat(600) }] }];
    for (const value of values) {
      const text = JSON.stringify({ timestamp: "2026-11-07", type: "response_item", payload: { type: "message", content: value }, metadata: {} });
      expect(() => JSON.parse(text)).not.toThrow(); expect(scan(text, chunk)).toBe(true);
    }
    for (const type of ["user_message", "agent_message", "token_count"]) expect(scan(JSON.stringify({ type: "event_msg", payload: { type, message: "猫🙂" } }), chunk)).toBe(true);
    expect(scan('{"type":"compacted","payload":{"message":"x"}}', chunk)).toBe(true);
    expect(scan('{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Extension","result":"x"}}}', chunk)).toBe(true);
  });
  it.each([
    '{"type":"response_item","payload":[1,]}',
    '{"type":"response_item","payload":{"x":}}',
    '{"type":"response_item","payload":{"x":true false}}',
    '{"type":"response_item","payload":"bad\\q"}',
    '{"type":"response_item","payload":"bad\\u00xy"}',
    '{"type":"response_item","payload":"bad\u0001"}',
    '{"type":"response_item","payload":01}',
    '{"type":"response_item","payload":1e}',
    '{"type":"response_item","payload":}',
    '{"type":"response_item","payload":[}',
    '{"type":"response_item","payload":{}',
    '{"type":"response_item"} {}',
  ])("rejects JSON syntax errors across byte splits", text => {
    expect(() => JSON.parse(text)).toThrow(); expect(scan(text, 1)).toBe(false);
  });
  it("rejects important/unknown envelopes and duplicate/replaced discriminators including escaped keys", () => {
    for (const text of [
      '{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"SubAgentActivity"}}}',
      '{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"FutureKind"}}}',
      '{"type":"future","payload":{}}',
      '{"type":"response_item","type":"event_msg"}',
      '{"type":"response_item","\\u0074ype":"event_msg"}',
      '{"type":"event_msg","payload":{"type":"item_completed","type":"other","item":{"type":"Extension"}}}',
      '{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"Extension","type":"SubAgentActivity"}}}',
      '{"type":"response_item","payload":{},"payload":{"type":"item_completed"}}',
      '{"type":{},"payload":{}}',
    ]) expect(scan(text, 1)).toBe(false);
  });
  it("bounds header positions, nesting, token retention and validates split invalid UTF8", () => {
    expect(scan(JSON.stringify({ padding: "x".repeat(4096), type: "response_item" }))).toBe(false);
    expect(scan('{"type":"response_item","payload":' + '['.repeat(65) + '0' + ']'.repeat(65) + '}')).toBe(false);
    expect(scan('{"type":"response_item","payload":' + '1'.repeat(100) + '}')).toBe(false);
    expect(scan(Buffer.concat([Buffer.from('{"type":"response_item","payload":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]), 1)).toBe(false);
    expect(scan(Buffer.concat([Buffer.from('{"type":"response_item","payload":"'), Buffer.from([0xf0, 0x9f]), Buffer.from('"}')]), 1)).toBe(false);
  });
});
