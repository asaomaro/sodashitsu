import {EventEmitter} from "node:events";
import {PassThrough,Writable} from "node:stream";
import {afterEach,expect,it,vi} from "vitest";
vi.mock("node:child_process",()=>({spawn:vi.fn()}));
import {spawn} from "node:child_process";
import {desktopSecretProtector} from "./DesktopEndpointProtector.js";
import {desktopWindowsPowerShell} from "./DesktopWindowsPowerShell.js";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});
function child(output=Buffer.from([17,18,19]),close=true){
 const process=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:undefined as unknown as Writable,kill:vi.fn()});const input:Buffer[]=[];
 process.stdin=new Writable({write:(chunk,_encoding,done)=>{input.push(Buffer.from(chunk));done();},final:done=>{done();if(close)queueMicrotask(()=>{process.stdout.write(output);process.emit("close",0);});}});vi.mocked(spawn).mockReturnValue(process as unknown as ReturnType<typeof spawn>);return {process,input};
}
it("uses only the absolute system PowerShell and fixed cwd/module path for private bytes",async()=>{
 vi.stubEnv("SystemRoot","C:\\Windows");vi.stubEnv("PATH","C:\\untrusted-project");const f=child(),secret=Uint8Array.from([0,42,255,0,7]);const result=await desktopSecretProtector("win32").protect(secret);expect(result).toEqual(Uint8Array.from([17,18,19]));expect(Buffer.concat(f.input)).toEqual(Buffer.from(secret));const call=vi.mocked(spawn).mock.calls[0]!;expect(call[0]).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");expect(call[1]).not.toContain(Buffer.from(secret).toString("base64"));expect(call[2]).toMatchObject({cwd:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0",env:{PSModulePath:"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules"}});
});
it.each([undefined,"powershell.exe","..\\Windows","C:\\Windows\\..\\evil",'C:\\Windows" -Command evil'])("does not fall back to program search for invalid system root %s",root=>{if(root===undefined)vi.stubEnv("SystemRoot",undefined);expect(()=>desktopWindowsPowerShell(root)).toThrow();});
it("fails closed and discards output on native error or timeout",async()=>{
 vi.stubEnv("SystemRoot","C:\\Windows");const f=child(Buffer.alloc(65537)),failed=desktopSecretProtector("win32").protect(Uint8Array.of(1));await expect(failed).rejects.toThrow("protection failed");expect(f.process.kill).toHaveBeenCalled();
 vi.useFakeTimers();const stalled=child(Buffer.alloc(0),false),pending=desktopSecretProtector("win32").protect(Uint8Array.of(1)),rejected=expect(pending).rejects.toThrow("protection failed");await vi.advanceTimersByTimeAsync(5001);await rejected;expect(stalled.process.kill).toHaveBeenCalled();
});

it("copies Buffer-backed input in owner-file mode before the caller clears it",async()=>{
 const protector=desktopSecretProtector("linux"),value=Buffer.from([1,2,3]),protectedBytes=await protector.protect(value),clear=await protector.unprotect(value);value.fill(0);expect(protectedBytes).toEqual(Uint8Array.from([1,2,3]));expect(clear).toEqual(Uint8Array.from([1,2,3]));
});
