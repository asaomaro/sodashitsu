import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { runExec } from "./commands/exec.js";
import { FsSessionStore } from "./session.js";
import { withSession } from "./withSession.js";

it("runs on an agent-free delegated PC through --machine and receives stdout/stderr/exit code", async () => {
  const dir = await mkdtemp(join(tmpdir(),"soda-exec-it-")), servers: ComposedServer[] = [];
  const exitCode = process.exitCode;
  let output: ReturnType<typeof vi.spyOn> | undefined;
  try {
    const a = await composeServerOnFreePort({host:"127.0.0.1",stateDir:join(dir,"a"),origin:[]}); servers.push(a);
    const b = await composeServerOnFreePort({host:"127.0.0.1",stateDir:join(dir,"b"),origin:[]}); servers.push(b);
    const ao = {url:`http://127.0.0.1:${a.options.port}`,token:a.freshToken!,urlExplicit:true};
    const bo = {url:`http://127.0.0.1:${b.options.port}`,token:b.freshToken!,urlExplicit:true};
    const store = new FsSessionStore(join(dir,"session.json"));
    const invite = await withSession(ao,store,c=>c.request("machine.invite",{label:"agent-free"}));
    await withSession(bo,store,c=>c.request("machine.delegate",{url:ao.url,machineId:invite.machineId,token:invite.token}));
    await withSession(ao,store,async c => {
      await expect.poll(async()=> (await c.request("machine.list",{})).machines.find(m=>m.id===invite.machineId)?.state).toBe("online");
    });
    const text: string[] = [];
    output = vi.spyOn(process.stdout,"write").mockImplementation((chunk: unknown)=>{text.push(String(chunk));return true;});
    const source = Buffer.from('process.stdout.write("remote-output");process.stderr.write("remote-error");process.exitCode=7').toString("base64");
    const script = `eval(Buffer.from('${source}','base64').toString('utf8'))`;
    const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
    const command = process.platform === "win32" ? `"${process.execPath}" -e "${script}"` : `${quote(process.execPath)} -e "${script}"`;
    await runExec({kind:"exec",opts:{...ao,machine:invite.machineId},cwd:dir,timeoutMs:5000,command},store);
    const result = JSON.parse(text.join(""));
    expect(result).toMatchObject({status:"exited",stdout:"remote-output",stderr:"remote-error",exitCode:7,timedOut:false});
    expect(process.exitCode).toBe(1);
  } finally {
    output?.mockRestore(); process.exitCode=exitCode;
    for (const server of servers.reverse()) await server.close();
    await rm(dir,{recursive:true,force:true});
  }
},30000);
