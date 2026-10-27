import {win32} from "node:path";
/** SystemRoot belongs to the trusted server-launch environment. Never accept it
 * from a project, remote request or endpoint settings; never search PATH/CWD. */
export function desktopWindowsPowerShell(systemRoot=process.env.SystemRoot):string {
 if(!systemRoot||!/^[a-z]:\\[^"\x00-\x1f]*$/i.test(systemRoot)||systemRoot.split(/[\\/]/).some(part=>part==="..")||win32.normalize(systemRoot)!==systemRoot.replace(/\\$/,""))throw Error("Windows system directory is unavailable");
 return win32.join(systemRoot,"System32","WindowsPowerShell","v1.0","powershell.exe");
}
