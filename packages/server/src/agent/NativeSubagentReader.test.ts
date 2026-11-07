import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm, symlink } from "node:fs/promises";
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
  it("uses only newline-committed rows and rejects malformed/oversized records and symlinks", async () => {
    const f = await setup(), reader = new NativeSubagentReader({ codexHome: f.home });
    await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n" + JSON.stringify(f.rows[1]));
    expect((await reader.read(f.source))?.count).toBe(1);
    await appendFile(f.file, "\n"); expect((await reader.read(f.source))?.count).toBe(0);
    await appendFile(f.file, "not-json\n"); expect(await reader.read(f.source)).toBeUndefined();
    await writeFile(f.file, "x".repeat(300000)); expect(await reader.read(f.source)).toBeUndefined();
    await rm(f.file); const outside = join(f.home, "outside"); await writeFile(outside, f.text); await symlink(outside, f.file);
    expect(await reader.read(f.source)).toBeUndefined(); reader.close();
  });
});
