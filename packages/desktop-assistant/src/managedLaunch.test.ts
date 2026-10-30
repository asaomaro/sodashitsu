import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { managedLaunch } from "./managedLaunch.js";
it("accepts only an origin and ends the lease on parent EOF", async () => {
 const pipe=new PassThrough(), stop=vi.fn(); const ready=managedLaunch(pipe,stop);
 pipe.write('{"version":1,"server'); pipe.write('Origin":"http://127.0.0.1:7780"}\n');
 expect(await ready).toEqual({serverOrigin:"http://127.0.0.1:7780"});
 expect(stop).not.toHaveBeenCalled(); pipe.end();
 await vi.waitFor(()=>expect(stop).toHaveBeenCalledOnce());
});
it("rejects unknown fields, credentials, remote HTTP and oversized input", async () => {
 for(const input of ['{"version":1,"serverOrigin":"http://remote.test"}\n','{"version":1,"serverOrigin":"https://u:p@example.test"}\n','{"version":1,"serverOrigin":"https://example.test","enabled":true}\n','x'.repeat(4097)]) {
  const pipe=new PassThrough(),stop=vi.fn(); const ready=managedLaunch(pipe,stop);
  pipe.write(input); await expect(ready).rejects.toThrow(); expect(stop).toHaveBeenCalled(); pipe.destroy();
 }
});
it("fails closed if the parent dies before bootstrap", async () => {
 const pipe=new PassThrough(),stop=vi.fn(); const ready=managedLaunch(pipe,stop);pipe.end();
 await expect(ready).rejects.toThrow();expect(stop).toHaveBeenCalledOnce();
});

it("rejects expired bootstrap even if the timeout callback has not run", async () => {
 const now=vi.spyOn(performance,"now").mockReturnValue(100);
 const pipe=new PassThrough(),stop=vi.fn();
 try { const ready=managedLaunch(pipe,stop);now.mockReturnValue(6100);
  pipe.write('{"version":1,"serverOrigin":"http://127.0.0.1:7780"}\n');
  await expect(ready).rejects.toThrow();expect(stop).toHaveBeenCalledOnce();
 } finally {now.mockRestore();pipe.destroy();}
});
