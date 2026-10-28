import {desktopSigninStartup} from "../desktop/DesktopSigninStartup.js";
/** The installed bootstrap invokes this export once. No automatic import-time
 * startup and no general server/CLI entry point exists in this bundle. */
export async function main():Promise<void>{
 if(process.platform!=="win32"||process.argv.length!==4||process.argv[2]!=="--owner"||typeof process.argv[3]!=="string"||process.argv[3].length>184||!/^S-1-[0-9]+(?:-[0-9]+){1,15}$/.test(process.argv[3]))throw new Error("Signin agent is unavailable");
 const owner=process.argv[3],controller=new AbortController(),stop=()=>controller.abort();
 process.once("SIGTERM",stop);process.once("SIGINT",stop);
 try{
  await desktopSigninStartup(owner,controller.signal);
 }finally{controller.abort();process.removeListener("SIGTERM",stop);process.removeListener("SIGINT",stop);}
}
