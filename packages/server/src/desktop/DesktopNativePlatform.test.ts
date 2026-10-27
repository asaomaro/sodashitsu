import {expect,it,vi} from "vitest";
import {nativeDesktopCommand,nativePlatformFor} from "./DesktopNativePlatform.js";
import type {spawnSync} from "node:child_process";
it("detects native platforms while leaving WSL on the Windows path",()=>{
 expect(nativePlatformFor("linux",{})).toBe("linux-portal");expect(nativePlatformFor("darwin",{})).toBe("macos-sck");expect(nativePlatformFor("linux",{WSL_DISTRO_NAME:"Ubuntu"})).toBeUndefined();expect(nativePlatformFor("win32",{})).toBeUndefined();
});
it("probes imports only and requires matching dependency proof",()=>{
 const probe=vi.fn(()=>({status:0,stdout:JSON.stringify({backend:"linux-portal",dependencies:true})}));expect(nativeDesktopCommand("linux",{SODA_DESKTOP_LINUX_PORTAL:"1"},probe as unknown as typeof spawnSync)).toEqual(["/usr/bin/python3","-I",expect.stringContaining("linux-portal-helper.py")]);expect(probe).toHaveBeenCalledWith("/usr/bin/python3",["-I",expect.stringContaining("linux-portal-helper.py"),"--probe"],expect.objectContaining({timeout:3000,maxBuffer:8192}));probe.mockReturnValue({status:0,stdout:'{"backend":"synthetic","dependencies":true}'});expect(nativeDesktopCommand("linux",{SODA_DESKTOP_LINUX_PORTAL:"1"},probe as unknown as typeof spawnSync)).toBeUndefined();
});

it("keeps unverified Linux Portal capture disabled without an explicit local opt-in",()=>{const probe=vi.fn();expect(nativeDesktopCommand("linux",{},probe)).toBeUndefined();expect(probe).not.toHaveBeenCalled();});
