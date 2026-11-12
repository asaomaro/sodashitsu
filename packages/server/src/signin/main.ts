import {fileURLToPath} from "node:url";
import {win32} from "node:path";
import {desktopSigninAdminCommand,desktopSigninAdminStateDirectory} from "../desktop/DesktopSigninAdminCommand.js";
import {desktopSigninEntry} from "../desktop/DesktopSigninEntry.js";
/** The installed bootstrap invokes this export once. No automatic import-time
 * startup and no general server/CLI entry point exists in this bundle. */
export async function main():Promise<void>{
 if(process.platform!=="win32"||(process.argv.length!==4&&!(process.argv.length===5&&process.argv[4]==="--admin"))||process.argv[2]!=="--owner"||typeof process.argv[3]!=="string"||process.argv[3].length>184||!/^S-1-[0-9]+(?:-[0-9]+){1,15}$/.test(process.argv[3]))throw new Error("Signin agent is unavailable");
 const owner=process.argv[3],controller=new AbortController(),stop=()=>controller.abort();
 process.once("SIGTERM",stop);process.once("SIGINT",stop);
 try{
  if(process.argv[4]==="--admin"){
   const chunks:Buffer[]=[];let count=0;
   try{
    for await(const chunk of process.stdin){const bytes=Buffer.from(chunk);count+=bytes.length;if(count>16384){bytes.fill(0);throw Error("Signin administration is unavailable");}chunks.push(bytes);}
    const input=Buffer.concat(chunks),root=win32.resolve(fileURLToPath(new URL("../../../../",import.meta.url)));
    try{const result=await desktopSigninAdminCommand(owner,desktopSigninAdminStateDirectory(owner,root),JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input)));process.stdout.write(JSON.stringify(result));}finally{input.fill(0);}
   }finally{for(const bytes of chunks)bytes.fill(0);}
  }else await desktopSigninEntry(owner,process.stdin,controller);
 }catch{
  // Fixed code only; no exception text, paths, enrollment or keys leave Node.
  // Entry has already awaited every owned teardown before rejecting.
  controller.abort();process.exit(240);
 }finally{controller.abort();process.removeListener("SIGTERM",stop);process.removeListener("SIGINT",stop);}
}
