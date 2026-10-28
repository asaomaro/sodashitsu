import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {DesktopSigninCertificate} from "./DesktopSigninCertificate.js";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
const caPem=readFileSync(new URL("../../../tui/src/testing/tls/cert.pem",import.meta.url),"utf8");
const ownerSid="S-1-5-21-1-2-3-1001";
const data={version:1,purpose:"desktop-signin",revision:"11111111-1111-4111-8111-111111111111",ownerSid,origin:"https://root.example",machineId:"a".repeat(32),token:"t".repeat(43),provider:"b".repeat(64),allowSignin:true,peers:[{fingerprint:"c".repeat(64),label:"generated"}],caPem};
it("retains only explicit public CA bytes in the private delegation",()=>{expect(DesktopSigninCertificate.parse(caPem)).toBe(caPem);const e=DesktopSigninEnrollment.decode(Buffer.from(JSON.stringify(data)),ownerSid);expect(e.delegation().caPem).toBe(caPem);expect(JSON.stringify(e)).not.toContain(caPem);expect(e.publicStatus()).not.toHaveProperty("caPem");});
it.each(["", "invalid", caPem+caPem, caPem+"private extra", caPem.replace("CERTIFICATE","PRIVATE KEY")])("refuses malformed/bundled/private CA material",value=>{expect(DesktopSigninCertificate.safeParse(value).success).toBe(false);expect(()=>DesktopSigninEnrollment.decode(Buffer.from(JSON.stringify({...data,caPem:value})),ownerSid)).toThrow();});
