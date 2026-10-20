import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Pane, WorkKind, WorkTransferMeta } from "@sodashitsu/protocol";
import { WorkContext } from "./WorkContext.js";
import { SessionTransfer } from "./SessionTransfer.js";
import { digest } from "./files.js";
vi.mock("node:fs/promises", async original => { const fs = await original<typeof import("node:fs/promises")>(); return { ...fs, link: vi.fn(fs.link) }; });

let dir: string, folder: string, home: string, source: string, work: WorkContext, transfers: SessionTransfer;
const paneId = randomUUID(), sessionId = randomUUID(), workspaceId = randomUUID();
let kind: WorkKind = "codex";
const meta = (bytes: Buffer): WorkTransferMeta => ({ kind, sessionId, sourcePaneId: paneId, bytes: bytes.length, sha256: digest(bytes), memories: [], warnings: [] });
const scope = () => ({ workspaceId, expectedFolder: folder, agentKind: kind });
const transcript = () => Buffer.from(kind === "codex"
  ? JSON.stringify({ timestamp: "2026-10-19T00:00:00Z", type: "session_meta", payload: { id: sessionId, cwd: "/source", originator: "codex-tui", cli_version: "0.162.0", source: "cli", model_provider: "openai" } }) + "\n" + JSON.stringify({ timestamp: "2026-10-19T00:00:01Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "remote task" }] } }) + "\n"
  : JSON.stringify({ type: "user", sessionId, cwd: "/source", uuid: randomUUID(), parentUuid: null, message: { role: "user", content: "task" } }) + "\n");
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "soda-transfer-")); folder = join(dir, "project"); home = join(dir, "target-home"); source = join(dir, "source.jsonl");
  await Promise.all([folder, home].map(d => mkdir(d)));
  kind = "codex";
  work = new WorkContext(dir, () => ({ id: paneId, agentSession: { kind, sessionId } }) as Pane, () => folder);
  transfers = new SessionTransfer(work, { source: () => ({ kind, sessionId, pane: {} as Pane }), locate: async () => source }, { home, env: {} });
});
afterEach(async () => { transfers.dispose(); vi.useRealTimers(); vi.mocked(link).mockRestore(); await rm(dir, { recursive: true, force: true }); });
async function upload(data = transcript(), custom = meta(data)) {
  const { id } = await transfers.importStart("receiver", { ...scope(), meta: custom });
  for (let offset = 0; offset < data.length; offset += 65536) transfers.importChunk("receiver", id, offset, data.subarray(offset, offset + 65536).toString("base64"));
  return id;
}
it.each(["claude", "codex"] as const)("exports and installs %s history with a target cwd and a non-destructive memory archive", async agent => {
  kind = agent;
  if (kind === "claude") { await mkdir(join(dir, "memory")); await writeFile(join(dir, "memory/MEMORY.md"), "keep tests focused"); }
  await writeFile(source, transcript());
  await work.memory({ ...scope(), sourcePaneId: paneId, action: "write", name: "DECISIONS.md", content: "important remote decisions" });
  const exported = await transfers.exportStart("sender", paneId), chunks: Buffer[] = [];
  let offset = 0;
  for (;;) { const chunk = transfers.exportRead("sender", exported.id, offset); const bytes = Buffer.from(chunk.data, "base64"); chunks.push(bytes); offset += bytes.length; if (chunk.done) break; }
  const data = Buffer.concat(chunks), id = await upload(data, exported.meta), result = await transfers.importFinish("receiver", id);
  expect(result.nativePath).not.toBeNull();
  expect(await readFile(result.nativePath!, "utf8")).toContain(folder.replaceAll("\\", "\\\\"));
  expect(result.resumeArgv?.slice(0, 3)).toEqual(kind === "claude" ? ["claude", "--resume", sessionId] : ["codex", "resume", sessionId]);
  expect(await readFile(join(result.directory, "transcript.jsonl"), "utf8")).toBe(data.toString());
  expect(await readFile(join(result.directory, "SODASHITSU-HANDOFF.md"), "utf8")).toContain("DECISIONS.md");
  expect(await readFile(join(result.directory, "SODASHITSU-HANDOFF.md"), "utf8")).toContain(dirname(result.directory));
  if (kind === "codex") expect(result.nativePath).toMatch(/rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-f0-9-]{36}\.jsonl$/);
  else expect(await readFile(join(result.directory, "MEMORY.md"), "utf8")).toBe("keep tests focused");
  const old = await readFile(result.nativePath!, "utf8"), again = await transfers.importFinish("receiver", await upload());
  expect(again.nativePath).toBeNull(); expect(again.resumeArgv).toBeNull();
  expect(await readFile(result.nativePath!, "utf8")).toBe(old);
});
it("rejects wrong owner, chunk order, corrupted content and incomplete uploads", async () => {
  const bytes = transcript(), id = await upload();
  expect(() => transfers.importChunk("stranger", id, bytes.length, "YQ==")).toThrow();
  expect(() => transfers.importChunk("receiver", id, 0, "YQ==")).toThrow();
  const corrupt = await upload(bytes, { ...meta(bytes), sha256: "0".repeat(64) });
  await expect(transfers.importFinish("receiver", corrupt)).rejects.toThrow(/ハッシュ/);
  const incomplete = await transfers.importStart("receiver", { ...scope(), meta: meta(bytes) });
  await expect(transfers.importFinish("receiver", incomplete.id)).rejects.toThrow(/サイズ/);
  transfers.clientGone("receiver");
  await expect(transfers.importFinish("receiver", id)).rejects.toThrow(/転送/);
});
it("does not register an export or import whose socket closes during its initial async lookup", async () => {
  await writeFile(source, transcript());
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const other = new SessionTransfer(work, { source: () => ({ kind, sessionId, pane: {} as Pane }), locate: async () => { await gate; return source; } }, { home, env: {} });
  const pending = other.exportStart("lost", paneId); other.clientGone("lost"); release();
  await expect(pending).rejects.toThrow(/接続/); other.dispose();
  let finish!: () => void; const barrier = new Promise<void>(resolve => { finish = resolve; });
  const original = work.scope.bind(work); vi.spyOn(work, "scope").mockImplementationOnce(async p => { await barrier; return original(p); });
  const importing = transfers.importStart("lost", { ...scope(), meta: meta(transcript()) });
  transfers.clientGone("lost"); finish();
  await expect(importing).rejects.toThrow(/接続/);
});
it("rolls back native history and archive if the socket closes while publishing the native file", async () => {
  let arrived!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { arrived = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const original = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).link;
  vi.mocked(link).mockImplementationOnce(async (a, b) => { arrived(); await gate; return original(a, b); });
  const id = await upload(), finish = transfers.importFinish("receiver", id);
  await entered; transfers.clientGone("receiver"); release();
  await expect(finish).rejects.toThrow(/接続/);
  const files = await readdir(home, { recursive: true });
  expect(files.some(f => String(f).endsWith(".jsonl"))).toBe(false);
  expect(await readdir(join(folder, ".soda/agent-memory", paneId))).toEqual([]);
});
it("only one concurrent transfer with the same session ID registers native history", async () => {
  const a = await upload(), b = await upload();
  const results = await Promise.all([transfers.importFinish("receiver", a), transfers.importFinish("receiver", b)]);
  expect(results.filter(r => r.nativePath !== null)).toHaveLength(1);
});
it("rolls back a transfer whose lifetime expires during native publication", async () => {
  vi.useFakeTimers();
  let arrived!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { arrived = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const original = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).link;
  vi.mocked(link).mockImplementationOnce(async (a, b) => { arrived(); await gate; return original(a, b); });
  const id = await upload(), finish = transfers.importFinish("receiver", id);
  await entered; await vi.advanceTimersByTimeAsync(300001); release();
  await expect(finish).rejects.toThrow(/有効期限/);
  expect((await readdir(home, { recursive: true })).some(f => String(f).endsWith(".jsonl"))).toBe(false);
});
it("rolls back an archive and native history if the workspace changes during publication", async () => {
  let arrived!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { arrived = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const original = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).link;
  vi.mocked(link).mockImplementationOnce(async (a, b) => { arrived(); await gate; return original(a, b); });
  const old = folder, id = await upload(), finish = transfers.importFinish("receiver", id);
  await entered; folder = home; release();
  await expect(finish).rejects.toThrow(/PJ/);
  expect((await readdir(home, { recursive: true })).some(f => String(f).endsWith(".jsonl"))).toBe(false);
  expect(await readdir(join(old, ".soda/agent-memory", paneId))).toEqual([]);
});
it("protects old and archived Codex sessions instead of treating the bounded recent scan as absence", async () => {
  const archive = join(home, ".codex/archived_sessions"); await mkdir(archive, { recursive: true });
  await writeFile(join(archive, `rollout-2001-01-01T00-00-00-${sessionId}.jsonl`), "old");
  const result = await transfers.importFinish("receiver", await upload());
  expect(result.nativePath).toBeNull(); expect(await readFile(join(archive, `rollout-2001-01-01T00-00-00-${sessionId}.jsonl`), "utf8")).toBe("old");
});
