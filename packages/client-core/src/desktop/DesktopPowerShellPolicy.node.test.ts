import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {spawn} from "node:child_process";
import {afterEach,expect,it,vi} from "vitest";
import {desktopSecretProtector} from "./DesktopEndpointProtector.node.js";
import {desktopWindowsMetadata} from "./DesktopWindowsMetadata.node.js";
vi.mock("node:child_process",()=>({spawn:vi.fn()}));
vi.mock("./DesktopWindowsPowerShell.node.js",()=>({desktopWindowsPowerShell:()=>"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"}));
afterEach(()=>vi.clearAllMocks());
it.each(["protect","metadata"])("runs bundled %s scripts under the configured Windows execution policy",async operation=>{
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});
 vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
 const pending=operation==="protect"?desktopSecretProtector("win32").protect(new Uint8Array([1])):desktopWindowsMetadata("check-endpoint-acl.ps1",[],"generated_ok");
 child.stdout.emit("data",operation==="protect"?Buffer.from([2]):Buffer.from("generated_ok"));child.emit("close",0);await pending;
 const args=vi.mocked(spawn).mock.calls[0]![1];expect(args).toContain("-File");expect(args).not.toContain("-ExecutionPolicy");expect(args).not.toContain("Bypass");
});
