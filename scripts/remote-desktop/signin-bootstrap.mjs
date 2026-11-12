// Installed code is verified and retained by the native SYSTEM host. Use Node's
// standard module loader; this trusted application is not a JavaScript sandbox.
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const failure=()=>new Error("Signin agent is unavailable");
let started=false;

export async function runInstalledSigninAgent() {
  try {
    if(started)throw failure();
    started=true;
    const filename=join(dirname(fileURLToPath(import.meta.url)),"packages","server","dist","signin","main.bundle.cjs");
    const {main}=await import(pathToFileURL(filename).href);
    if(typeof main!=="function")throw failure();
    await main();
  }catch{throw failure();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const stop=()=>{process.stderr.write("Signin agent is unavailable\n");process.exit(1);};
  process.once("uncaughtException",stop);
  process.once("unhandledRejection",stop);
  void runInstalledSigninAgent().catch(stop);
}
