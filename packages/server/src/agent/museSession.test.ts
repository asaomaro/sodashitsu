import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, chmod, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { museSession } from "./museSession.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
const id = "11111111-1111-7111-8111-111111111111",
  next = "22222222-2222-7222-8222-222222222222";
async function fake() {
  const dir = await mkdtemp(join(tmpdir(), "soda-msp-test-"));
  dirs.push(dir);
  const file = join(dir, "muse"),
    log = join(dir, "methods.json");
  await writeFile(
    file,
    `#!${process.execPath}
const methods=[];let initialized=false,buffer='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\\n'))>=0){const row=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);methods.push(row.method);require('node:fs').writeFileSync(${JSON.stringify(log)},JSON.stringify(methods));if(row.method==='initialized'){initialized=true;continue;}const result=row.method==='initialize'?{}:{session:{sessionId:row.method==='session/fork'?'${next}':'${id}'},history:{mode:'inline',items:[{kind:'agentMessage',text:'日本語の応答'}]}};const error=row.id!==1&&!initialized?{code:-32600}:undefined;const text=JSON.stringify({jsonrpc:'2.0',id:row.id,result,error})+'\\n';const bytes=Buffer.from(text);const at=bytes.indexOf(Buffer.from('日本'))+1;process.stdout.write(bytes.subarray(0,Math.max(1,at)));process.stdout.write(bytes.subarray(Math.max(1,at)));}});
`,
  );
  await chmod(file, 0o755);
  return { dir, file, log };
}
it.skipIf(process.platform === "win32")(
  "initializes, reads without attaching or model turns and handles split UTF8 frames",
  async () => {
    const f = await fake(),
      value = await museSession("session/read", id, {
        executable: f.file,
        roots: { dataHome: join(f.dir, "data") },
      });
    expect(value.history.items[0].text).toBe("日本語の応答");
    expect(JSON.parse(await readFile(f.log, "utf8"))).toEqual([
      "initialize",
      "initialized",
      "session/read",
    ]);
  },
);
it.skipIf(process.platform === "win32")(
  "forks through the native API without resuming or submitting into the source",
  async () => {
    const f = await fake(),
      value = await museSession("session/fork", id, { executable: f.file });
    expect(value.session.sessionId).toBe(next);
    expect(JSON.parse(await readFile(f.log, "utf8"))).toEqual([
      "initialize",
      "initialized",
      "session/fork",
    ]);
  },
);
it("rejects non-UUID identifiers before starting a host", async () => {
  await expect(museSession("session/read", "--last")).rejects.toThrow();
});
it.skipIf(process.platform === "win32")(
  "waits for forced termination when a host ignores SIGTERM",
  async () => {
    const f = await fake();
    await writeFile(
      f.file,
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(f.log)},String(process.pid));process.on('SIGTERM',()=>{});process.stdin.resume();setInterval(()=>{},1000);`,
    );
    const result = museSession("session/read", id, { executable: f.file, timeoutMs: 500 });
    await expect(result).rejects.toThrow("応答");
    const pid = Number(await readFile(f.log, "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
  },
);
