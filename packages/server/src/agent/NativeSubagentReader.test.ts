import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NativeSubagentReader, type NativeSubagentSource } from "./NativeSubagentReader.js";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function setup() {
  const home = await mkdtemp(join(tmpdir(), "soda-native-subagents-")); dirs.push(home);
  const text = await readFile(new URL("./fixtures/native-subagents/codex.jsonl", import.meta.url), "utf8");
  const rows = text.trim().split("\n").map(line => JSON.parse(line));
  const id = rows[0].payload.thread_id, dir = join(home, "sessions", "2026", "11", "07");
  await mkdir(dir, { recursive: true });
  return { home, text, rows, file: join(dir, `rollout-fixture-${id}.jsonl`), source: { paneId: "pane", instanceId: "instance-1", kind: "codex", sessionId: id } as NativeSubagentSource };
}
describe("owned native records reader", () => {
  it("reads the real Muse parent-stream fixture through its UUIDv7 exact path", async () => {
    const f = await setup(), rows = (await readFile(new URL("./fixtures/native-subagents/muse.jsonl", import.meta.url), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const id = rows[0].stream.id, dataHome = join(f.home, "data");
    const date = new Date(parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toISOString().slice(0, 10).split("-");
    const dir = join(dataHome, "muse", "sessions", ...date, id); await mkdir(dir, { recursive: true });
    const file = join(dir, "session.jsonl"), result = rows.find(row => row.payload_type === "subagent.control.result_ready");
    await writeFile(file, rows.filter(row => row !== result).map(row => JSON.stringify(row) + "\n").join(""));
    const reader = new NativeSubagentReader({ dataHome });
    const source: NativeSubagentSource = { ...f.source, kind: "muse", sessionId: id };
    expect((await reader.read(source))?.count).toBe(1);
    await appendFile(file, JSON.stringify(result) + "\n"); expect((await reader.read(source))?.count).toBe(0); reader.close();
  });
  it("reads exact session, follows append/truncation, and does not count replayed history twice", async () => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    expect(await reader.read(f.source)).toBeUndefined();
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n");
    expect((await reader.read(f.source))?.count).toBe(1);
    await appendFile(f.file, f.rows.slice(1).map(row => JSON.stringify(row) + "\n").join(""));
    expect((await reader.read(f.source))?.count).toBe(0);
    await appendFile(f.file, JSON.stringify(f.rows[0]) + "\n");
    expect((await reader.read(f.source))?.count).toBe(0);
    expect((await reader.read({ ...f.source, instanceId: "resumed-instance" }))?.count).toBe(0);
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n");
    expect((await reader.read(f.source))?.count).toBe(1);
    reader.close(); expect(await reader.read(f.source)).toBeUndefined();
  });
  it("does not publish historical active when a completion lies just beyond the 4MiB chunk", async () => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    let text = JSON.stringify(f.rows[0]) + "\n";
    while (Buffer.byteLength(text) < 4 * 1024 * 1024) {
      const remaining = 4 * 1024 * 1024 - Buffer.byteLength(text);
      if (remaining < 12) { text += "\n".repeat(remaining); break; }
      const length = Math.min(128 * 1024, remaining);
      text += JSON.stringify({ pad: "x".repeat(length - 11) }) + "\n";
    }
    expect(Buffer.byteLength(text)).toBe(4 * 1024 * 1024);
    await writeFile(f.file, text + JSON.stringify(f.rows[1]) + "\n");
    expect(await reader.read(f.source)).toBeUndefined();
    expect((await reader.read(f.source))?.count).toBe(0);
    reader.close();
  });
  it.each([300000, 4 * 1024 * 1024 + 33, 9 * 1024 * 1024])("skips a validated irrelevant %s-byte Codex row and reaches current lifecycle", async size => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    const unrelated = JSON.stringify({ timestamp: "2026-11-07", type: "response_item", payload: { type: "message", content: [{ type: "input_image", image_url: "data:image/png;base64," + "A".repeat(size) }] } });
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n" + unrelated + "\n" + JSON.stringify(f.rows[1]) + "\n");
    const calls = Math.ceil(Buffer.byteLength(unrelated) / (4 * 1024 * 1024)) + 1;
    let value; for (let n = 0; n < calls; n++) value = await reader.read(f.source);
    expect(value?.count).toBe(0);
    const next = structuredClone(f.rows[0]); next.payload.item.id = "second-start"; next.payload.item.agent_thread_id = "new-child";
    await appendFile(f.file, JSON.stringify(next) + "\n"); expect((await reader.read(f.source))?.count).toBe(1); reader.close();
  });
  it.each(["user_message", "agent_message", "token_count"])("skips a known non-lifecycle event_msg/%s oversized envelope", async type => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    const unrelated = JSON.stringify({ type: "event_msg", payload: { type, message: "猫".repeat(100000) } });
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n" + unrelated + "\n" + JSON.stringify(f.rows[1]) + "\n");
    expect((await reader.read(f.source))?.count).toBe(0); reader.close();
  });
  it("never publishes a historical start across an unfinished huge line and follows completion after newline", async () => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    const text = JSON.stringify({ type: "compacted", payload: { message: "x".repeat(5 * 1024 * 1024) } });
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n" + text);
    expect(await reader.read(f.source)).toBeUndefined(); expect(await reader.read(f.source)).toBeUndefined(); expect(await reader.read(f.source)).toBeUndefined();
    await appendFile(f.file, "\n" + JSON.stringify(f.rows[1]) + "\n"); expect((await reader.read(f.source))?.count).toBe(0);
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n"); expect((await reader.read(f.source))?.count).toBe(1); reader.close();
  });
  it("handles a record header and UTF8 codepoint split at the 4MiB boundary", async () => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home }), chunk = 4 * 1024 * 1024;
    const start = JSON.stringify(f.rows[0]) + "\n";
    const huge = JSON.stringify({ type: "response_item", payload: { text: "猫🙂" + "a".repeat(400000) } });
    await writeFile(f.file, start + "\n".repeat(chunk - 7 - Buffer.byteLength(start)) + huge + "\n" + JSON.stringify(f.rows[1]) + "\n");
    expect(await reader.read(f.source)).toBeUndefined(); expect((await reader.read(f.source))?.count).toBe(0);
    const prefix = '{"type":"response_item","payload":{"text":"';
    const text = prefix + "a".repeat(chunk - Buffer.byteLength(start) - Buffer.byteLength(prefix) - 1) + '🙂tail"}}';
    await writeFile(f.file, start + text + "\n" + JSON.stringify(f.rows[1]) + "\n");
    // Explicit new instance also discards any old line decoder state on same-size replacements.
    const source = { ...f.source, instanceId: "utf8-instance" };
    expect(await reader.read(source)).toBeUndefined(); expect((await reader.read(source))?.count).toBe(0); reader.close();
  });
  it("discards partial oversized scanner state on file replacement and scope invalidation", async () => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    const huge = JSON.stringify({ type: "response_item", payload: { text: "x".repeat(5 * 1024 * 1024) } });
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n" + huge);
    expect(await reader.read(f.source)).toBeUndefined();
    const replacement = f.file + ".new"; await writeFile(replacement, JSON.stringify(f.rows[0]) + "\n" + JSON.stringify(f.rows[1]) + "\n"); await rename(replacement, f.file);
    expect((await reader.read(f.source))?.count).toBe(0);
    for (const change of ["forget", "close", "instance", "session", "kind"]) {
      const next = new NativeSubagentReader({ codexHome: f.home, home: f.home });
      const pending = next.read(f.source);
      if (change === "forget") next.forget(f.source.paneId);
      if (change === "close") next.close();
      if (change === "instance") await next.read({ ...f.source, instanceId: "new-instance" });
      if (change === "session") await next.read({ ...f.source, sessionId: "33333333-3333-4333-8333-333333333333" });
      if (change === "kind") await next.read({ ...f.source, kind: "agy" });
      expect(await pending).toBeUndefined(); next.close();
    }
    reader.close();
  });
  it("keeps oversized child-related CollabAgentToolCall records unknown", async () => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    const related = JSON.stringify({ type: "event_msg", payload: { type: "item_completed", item: { type: "CollabAgentToolCall", sender_thread_id: f.source.sessionId, receiver_thread_ids: ["child"], agents_states: { child: { status: "running", message: "x".repeat(300000) } } } } });
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n" + related + "\n" + JSON.stringify(f.rows[1]) + "\n");
    expect(await reader.read(f.source)).toBeUndefined(); reader.close();
  });
  it.each(["unknown", "important", "duplicate", "broken"])("keeps oversized %s rows unknown", async kind => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    let text = JSON.stringify({ type: kind === "unknown" ? "future" : "event_msg", payload: { type: "item_completed", item: { type: "SubAgentActivity", pad: "x".repeat(300000) } } });
    if (kind === "duplicate") text = '{"type":"response_item","payload":{"text":"' + "x".repeat(300000) + '"},"type":"event_msg"}';
    if (kind === "broken") text = '{"type":"response_item","payload":{"text":"' + "x".repeat(300000) + '"},BAD}';
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n" + text + "\n" + JSON.stringify(f.rows[1]) + "\n");
    expect(await reader.read(f.source)).toBeUndefined(); reader.close();
  });
  it("uses only newline-committed rows and rejects malformed/oversized records and symlinks", async () => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n" + JSON.stringify(f.rows[1]));
    expect(await reader.read(f.source)).toBeUndefined();
    await appendFile(f.file, "\n"); expect((await reader.read(f.source))?.count).toBe(0);
    await appendFile(f.file, "not-json\n"); expect(await reader.read(f.source)).toBeUndefined();
    await writeFile(f.file, "x".repeat(300000)); expect(await reader.read(f.source)).toBeUndefined();
    await rm(f.file); const outside = join(f.home, "outside"); await writeFile(outside, f.text); await symlink(outside, f.file);
    expect(await reader.read(f.source)).toBeUndefined(); reader.close();
  });
});
