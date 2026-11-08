import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm, symlink, rename, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("publishes interrupted children after exact-parent successful followup, while keeping namespace reset isolated", async () => {
    const f = await setup();
    const start = f.rows[0];
    const event = (kind: string, id: string) => ({ ...start, payload: { ...start.payload, item: { ...start.payload.item, kind, id } } });
    const reader = new NativeSubagentReader({ codexHome: f.home }, async () => new Map());
    try {
      await writeFile(f.file, [start, event("interrupted", "interruption")].map(row => JSON.stringify(row)).join("\n") + "\n");
      expect(await reader.read(f.source)).toEqual({ count: 0, items: [] });
      await appendFile(f.file, JSON.stringify(event("interacted", "followup")) + "\n");
      expect(await reader.read(f.source)).toMatchObject({ count: 1, countBasis: "alive", items: [{ state: "unknown" }] });
      reader.forget(f.source.paneId);
      await writeFile(f.file, JSON.stringify(event("interacted", "fresh-namespace-unowned")) + "\n");
      expect(await reader.read({ ...f.source, instanceId: "instance-2" })).toBeUndefined();
    } finally { reader.close(); }
  });
  it("refines only EOF-proven Codex members with working/idle/unknown runtime states", async () => {
    const f = await setup();
    const rows = (await readFile(new URL("./fixtures/native-subagents/codex-referenced-members.jsonl", import.meta.url), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const text = rows.map(r => JSON.stringify({ ...r, payload: { ...r.payload, thread_id: f.source.sessionId } })).join("\n");
    const status = vi.fn(async (target: import("./CodexControlStatus.js").CodexControlTarget) => new Map(target.childIds.map((id, index) => [id, (["working", "idle", "unknown"] as const)[index]!] as const)));
    const reader = new NativeSubagentReader({ codexHome: f.home }, status);
    await writeFile(f.file, text); expect(await reader.read(f.source)).toBeUndefined(); expect(status).not.toHaveBeenCalled();
    await appendFile(f.file, "\n");
    expect(await reader.read(f.source)).toMatchObject({ count: 3, countBasis: "alive", items: [{ state: "working" }, { state: "idle" }, { state: "unknown" }] });
    expect(status).toHaveBeenCalledOnce(); reader.close();
  });
  it.each(["append", "replace", "same-size", "forget", "close"])("rejects stale live status after %s during the request", async mode => {
    const f = await setup(); await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n");
    let reader: NativeSubagentReader;
    const status = vi.fn(async (target: import("./CodexControlStatus.js").CodexControlTarget) => {
      if (mode === "append") await appendFile(f.file, JSON.stringify(f.rows[1]) + "\n");
      if (mode === "replace") { await rename(f.file, f.file + ".old"); await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n"); }
      if (mode === "same-size") { await writeFile(f.file, (JSON.stringify(f.rows[0]) + "\n").replace("started", "invalid")); await utimes(f.file, new Date(0), new Date(0)); }
      if (mode === "forget") reader.forget(f.source.paneId);
      if (mode === "close") reader.close();
      return new Map(target.childIds.map(id => [id, "working" as const]));
    });
    reader = new NativeSubagentReader({ codexHome: f.home }, status);
    expect(await reader.read(f.source)).toBeUndefined();
    if (mode === "append") { expect((await reader.read(f.source))?.count).toBe(0); expect(status).toHaveBeenCalledOnce(); }
    reader.close();
  });
  it("keeps membership unknown on failed status and aborts status work when forgotten", async () => {
    const f = await setup(); await writeFile(f.file, JSON.stringify(f.rows[0]) + "\n");
    const reader = new NativeSubagentReader({ codexHome: f.home }, async () => { throw Error("unavailable"); });
    expect(await reader.read(f.source)).toMatchObject({ count: 1, countBasis: "alive", items: [{ state: "unknown" }] }); reader.close();
    let signal: AbortSignal | undefined, release: (() => void) | undefined;
    const delayed = new NativeSubagentReader({ codexHome: f.home }, async target => { signal = target.signal; await new Promise<void>(resolve => { release = resolve; }); return new Map(); });
    const pending = delayed.read(f.source); await vi.waitFor(() => expect(release).toBeDefined()); delayed.forget(f.source.paneId);
    expect(signal?.aborted).toBe(true); release!(); expect(await pending).toBeUndefined(); delayed.close();
  });

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
  it("publishes owned unknown membership only after the complete exact-parent record, and clears it on scope changes", async () => {
    const f = await setup(), rows = (await readFile(new URL("./fixtures/native-subagents/codex-referenced-members.jsonl", import.meta.url), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const reader = new NativeSubagentReader({ codexHome: f.home });
    const text = rows.map(r => JSON.stringify({ ...r, payload: { ...r.payload, thread_id: f.source.sessionId } })).join("\n");
    await writeFile(f.file, text); expect(await reader.read(f.source)).toBeUndefined(); await appendFile(f.file, "\n");
    expect(await reader.read(f.source)).toMatchObject({ count: 3, countBasis: "alive", items: [{ state: "unknown" }, { state: "unknown" }, { state: "unknown" }] });
    expect(await reader.read({ ...f.source, sessionId: "33333333-3333-4333-8333-333333333333" })).toBeUndefined();
    reader.close();
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

it("reports only owned advancing unread bytes for catchup and never loops at partial EOF or invalid data",async()=>{
 const f=await setup(),reader=new NativeSubagentReader({codexHome:f.home});
 const filler=JSON.stringify({type:"response_item",payload:{text:"x".repeat(5*1024*1024)}});
 await writeFile(f.file,JSON.stringify(f.rows[0])+"\n"+filler+"\n");
 expect(reader.progress(f.source)).toBeUndefined();expect(await reader.read(f.source)).toBeUndefined();
 expect(reader.progress(f.source)).toMatchObject({offset:4*1024*1024,pending:true});expect(reader.progress({...f.source,instanceId:"other"})).toBeUndefined();
 expect((await reader.read(f.source))?.count).toBe(1);expect(reader.progress(f.source)?.pending).toBe(false);
 await appendFile(f.file,'{"type":"response_item","payload":');expect(await reader.read(f.source)).toBeUndefined();expect(reader.progress(f.source)?.pending).toBe(false);
 await appendFile(f.file,'not-json\n');expect(await reader.read(f.source)).toBeUndefined();expect(reader.progress(f.source)).toBeUndefined();
 reader.forget(f.source.paneId);expect(reader.progress(f.source)).toBeUndefined();reader.close();
});


it("clears continuation on unavailable paths and changes private generation on replacement",async()=>{
 const f=await setup(),reader=new NativeSubagentReader({codexHome:f.home});
 const large=JSON.stringify(f.rows[0])+"\n"+JSON.stringify({type:"response_item",payload:{text:"x".repeat(5*1024*1024)}})+"\n";
 await writeFile(f.file,large);await reader.read(f.source);const first=reader.progress(f.source)!;expect(first.pending).toBe(true);
 await rename(f.file,f.file+".old");expect(await reader.read(f.source)).toBeUndefined();expect(reader.progress(f.source)?.pending).toBe(false);
 await writeFile(f.file,large);expect(await reader.read(f.source)).toBeUndefined();const replaced=reader.progress(f.source)!;expect(replaced.generation).not.toBe(first.generation);expect(replaced.offset).toBe(first.offset);reader.close();
});

it("clears a pending hint when refresh rejects after actual progress",async()=>{
 const f=await setup(),reader=new NativeSubagentReader({codexHome:f.home});await writeFile(f.file,JSON.stringify(f.rows[0])+"\n"+JSON.stringify({type:"response_item",payload:{text:"x".repeat(5*1024*1024)}})+"\n");
 const internal=reader as unknown as {refresh:(source:NativeSubagentSource,state:unknown)=>Promise<unknown>},original=internal.refresh.bind(reader);
 internal.refresh=async(source,state)=>{await original(source,state);throw Error("generated failure after read/parse/close");};
 expect(await reader.read(f.source)).toBeUndefined();expect(reader.progress(f.source)).toMatchObject({offset:4*1024*1024,pending:false});reader.close();
});


it("publishes verified Codex child transcript and latest-turn metadata without creation fallback",async()=>{
 const f=await setup(),start=f.rows[0],child=start.payload.item.agent_thread_id;
 await writeFile(f.file,JSON.stringify(start)+"\n");
 const file=join(f.home,"sessions","2026","11","07",`rollout-child-${child}.jsonl`);
 const meta=JSON.stringify({type:"session_meta",payload:{id:child,source:{subagent:{thread_spawn:{parent_thread_id:f.source.sessionId}}}}})+"\n";
 const context=(model:string,effort?:string)=>JSON.stringify({type:"turn_context",timestamp:new Date(Date.parse(start.timestamp)+1000).toISOString(),payload:{model,effort}})+"\n";
 await writeFile(file,meta+context("changed-model","high"));
 const reader=new NativeSubagentReader({codexHome:f.home},async()=>new Map());
 try{
  expect((await reader.read(f.source))?.items?.[0]).toMatchObject({hasTranscript:true,model:"changed-model",modelBasis:"turn",reasoningEffort:"high",reasoningEffortBasis:"turn"});
  await appendFile(file,context("newer-model"));
  const item=(await reader.read(f.source))?.items?.[0];expect(item?.model).toBe("newer-model");expect(item).not.toHaveProperty("reasoningEffort");
 }finally{reader.close();}
});


it("catches up a Codex child turn outside the tail window through the public reader",async()=>{
 const f=await setup(),start=f.rows[0],child=start.payload.item.agent_thread_id;await writeFile(f.file,JSON.stringify(start)+"\n");
 const childFile=join(f.home,"sessions","2026","11","07",`rollout-long-child-${child}.jsonl`);
 const meta=JSON.stringify({type:"session_meta",payload:{id:child,source:{subagent:{thread_spawn:{parent_thread_id:f.source.sessionId}}}}})+"\n";
 const context=JSON.stringify({type:"turn_context",timestamp:new Date(Date.parse(start.timestamp)+1000).toISOString(),payload:{model:"observed-long-child",effort:"medium"}})+"\n";
 const huge=JSON.stringify({type:"response_item",payload:{type:"message",content:[{type:"output_text",text:"x".repeat(12*1024*1024)}]}})+"\n";
 await writeFile(childFile,meta+context+huge);
 const reader=new NativeSubagentReader({codexHome:f.home},async()=>new Map());
 try{let value;for(let n=0;n<6;n++){value=await reader.read(f.source);if(value?.items[0]?.model)break;}expect(value?.items[0]).toMatchObject({model:"observed-long-child",reasoningEffort:"medium",hasTranscript:true});}
 finally{reader.close();}
});


it("never erases proven membership when a child metadata body read fails",async()=>{
 const f=await setup(),start=f.rows[0],child=start.payload.item.agent_thread_id;await writeFile(f.file,JSON.stringify(start)+"\n");
 const file=join(f.home,"sessions","2026","11","07",`rollout-iofail-child-${child}.jsonl`),meta=JSON.stringify({type:"session_meta",payload:{id:child,source:{subagent:{thread_spawn:{parent_thread_id:f.source.sessionId}}}}})+"\n";
 await writeFile(file,meta+JSON.stringify({type:"response_item",payload:{type:"message",content:[{type:"output_text",text:"x".repeat(1024*1024)}]}})+"\n");
 const safe=await import("./safeFile.js"),original=safe.readRange,spy=vi.spyOn(safe,"readRange").mockImplementation((fd,offset,length)=>offset>0?Promise.reject(Error("generated child metadata IO failure")):original(fd,offset,length));
 const reader=new NativeSubagentReader({codexHome:f.home},async()=>new Map());
 try{const value=await reader.read(f.source);expect(value?.count).toBe(1);expect(value?.items[0]?.model).toBeUndefined();}
 finally{spy.mockRestore();reader.close();}
});
