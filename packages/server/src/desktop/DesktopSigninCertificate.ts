import {X509Certificate} from "node:crypto";
import {z} from "zod";
/** One explicit public CA for this enrollment only. No private key, global
 * trust changes, hostname bypass, or environment-based trust configuration. */
export const DesktopSigninCertificate=z.string().max(8192).refine(value=>{
 try{
  if(!/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----\r?\n?$/.test(value))return false;
  const certificate=new X509Certificate(value);
  const der=Buffer.from(value.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g,""),"base64");
  return certificate.ca&&certificate.raw.equals(der);
 }catch{return false;}
});
