import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, appendFile, rm, symlink, link, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { readAssistantConversation, assistantRecord } from "./AssistantConversation.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(kind: "copilot" | "agy" = "copilot") {
  const home = await mkdtemp(join(tmpdir(), "soda-assistant-record-")), id = randomUUID(); roots.push(home);
  const directory = kind === "copilot" ? join(home, ".copilot", "session-state", id) : join(home, ".gemini", "antigravity-cli", "brain", id, ".system_generated", "logs");
  await mkdir(directory, { recursive: true }); const file = join(directory, kind === "copilot" ? "events.jsonl" : "transcript.jsonl");
  const row = (role: "user" | "assistant", content: string) => kind === "copilot"
    ? { type: role === "user" ? "user.message" : "assistant.message", data: { content }, timestamp: "2026-11-01T00:00:00Z" }
    : { type: role === "user" ? "USER_INPUT" : "PLANNER_RESPONSE", content, created_at: "2026-11-01T00:00:00Z", thinking: "private reasoning", tool_calls: [{ result: "private tool output" }] };
  const save = async (...rows: unknown[]) => writeFile(file, rows.map(row => JSON.stringify(row) + "\n").join(""));
  const read = () => readAssistantConversation(kind, id, { home, copilotHome: join(home, ".copilot") });
  return { home, id, file, directory, row, save, read };
}
it.each(["copilot", "agy"] as const)("reads only the pinned %s human/model text without tool content", async kind => {
  const f = await fixture(kind); await f.save(f.row("user", "こんにちは"), { type: "tool.execution_complete", content: "private tool" }, f.row("assistant", "船長です"));
  const page = await f.read(); expect(page.kind).toBe(kind); expect(page.sessionId).toBe(f.id); expect(page.reset).toBe(true);
  expect(page.messages.map(m => [m.role, m.text])).toEqual([["user", "こんにちは"], ["assistant", "船長です"]]); expect(JSON.stringify(page)).not.toContain("private");
});
it("excludes Copilot subagent, deltas, reasoning and non-text payloads", () => {
  for (const row of [{type:"assistant.message",data:{content:"private",parentToolCallId:"tool"}}, {type:"assistant.message_delta",data:{deltaContent:"private"}}, {type:"assistant.reasoning",data:{content:"private"}}, {type:"user.message",data:{content:{text:"not text"}}}]) expect(assistantRecord(row,"copilot")).toBeNull();
});
it.each(["copilot", "agy"] as const)("continues append-only %s records and resets after same-file rewrite", async kind => {
  const f = await fixture(kind); const header={type:"session.start"}; await f.save(header,f.row("user","old prompt"),f.row("assistant","old answer")); await f.read();
  await appendFile(f.file,JSON.stringify(f.row("user","next prompt"))+"\n"); const next=await f.read();
  expect(next.reset).toBe(true);expect(next.messages.map(m=>m.text)).toEqual(["old prompt","old answer","next prompt"]);
  await f.save(header,f.row("user","replacement prompt longer"),f.row("assistant","new answer long enough to exceed the old byte offset"));const replaced=await f.read();
  expect(replaced.reset).toBe(true);expect(replaced.messages.map(m=>m.text)).toEqual(["replacement prompt longer","new answer long enough to exceed the old byte offset"]);
});
it("replaces the snapshot after file replacement",async()=>{const f=await fixture();await f.save(f.row("user","first"));await f.read();await rename(f.file,f.file+'.old');await f.save(f.row("user","fresh"));expect(await f.read()).toMatchObject({reset:true,messages:[{text:"fresh"}]});});
it("keeps partial UTF8 lines pending and bounds message count/text",async()=>{const f=await fixture();await writeFile(f.file,JSON.stringify(f.row("user","日本語")));const partial=await f.read();expect(partial.endOffset).toBe(0);expect(partial.messages).toEqual([]);await appendFile(f.file,"\n");expect((await f.read()).messages[0]?.text).toBe("日本語");await f.save(...Array.from({length:101},(_,i)=>f.row("assistant",String(i))));const page=await f.read();expect(page.messages).toHaveLength(100);expect(page.messages.at(-1)?.text).toBe("100");expect(page.messages[0]?.text).toBe("1");expect(assistantRecord(f.row("assistant","a".repeat(9000)),"copilot")?.text).toHaveLength(8192);});
it("skips a partial oversized non-chat row at the tail window boundary",async()=>{const f=await fixture();await f.save({type:"tool.execution_complete",data:"x".repeat(2*1024*1024)},f.row("assistant","visible"));const page=await f.read();expect(page.messages.map(m=>m.text)).toEqual(["visible"]);expect(page.partial).toBe(true);});
it.runIf(process.platform!=="win32")("rejects file and intermediate-directory symlinks",async()=>{const f=await fixture();const external=join(f.home,"external");await writeFile(external,JSON.stringify(f.row("user","private"))+"\n");await symlink(external,f.file);await expect(f.read()).rejects.toMatchObject({code:"not_found"});await rm(f.file);await rm(f.directory,{recursive:true});const outside=join(f.home,"outside");await mkdir(outside);await writeFile(join(outside,"events.jsonl"),"private");await symlink(outside,f.directory,"dir");await expect(f.read()).rejects.toMatchObject({code:"not_found"});});
it("rejects hardlinked records and path traversal without exposing filesystem details",async()=>{const f=await fixture();const external=join(f.home,"external");await writeFile(external,"private");await link(external,f.file);await expect(f.read()).rejects.toMatchObject({code:"not_found"});await expect(readAssistantConversation("copilot","../private")).rejects.toMatchObject({code:"invalid_params"});await expect(readAssistantConversation("agy",randomUUID(),{home:f.home})).rejects.toThrow("会話記録を確認できません");});
