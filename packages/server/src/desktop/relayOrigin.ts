import {isIP} from "node:net";
/** Only explicitly configured HTTPS origins may replace a browser's loopback callback. */
export function desktopRelayOrigin(viewerOrigin:string,publicOrigins:readonly string[]):string {
 let viewer:URL;try{viewer=new URL(viewerOrigin);}catch{return viewerOrigin;}
 if(!loopback(viewer.hostname))return viewerOrigin;
 for(const origin of publicOrigins){
  try{const url=new URL(origin);if(url.protocol==='https:'&&!loopback(url.hostname)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)return url.origin;}catch{}
 }
 return viewerOrigin;
}
function loopback(host:string){const name=host.toLowerCase().replace(/\.$/,'');return name==='localhost'||name.endsWith('.localhost')||name==='[::1]'||(isIP(name)===4&&name.startsWith('127.'));}
