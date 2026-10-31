// Windows GUI Electron does not retain stdin. A native Node owner carries the lease.
const net = require('node:net');
const {spawn} = require('node:child_process');
const {randomBytes, randomUUID, timingSafeEqual, createHmac} = require('node:crypto');
const {dirname} = require('node:path');
if (process.platform !== 'win32' || !process.argv.includes('--soda-managed')) process.exit(1);
const id = randomUUID(), token = randomBytes(32).toString('hex');
const pipe = '\\\\.\\pipe\\soda-assistant-' + id;
let child, channel, closing = false, candidates = 0;
const peers = new Set();
let force, boot="", bootReady=false;
process.stdin.setEncoding("utf8");
process.stdin.on("data",data=>{
 if(closing||bootReady)return stop();
 boot+=data;if(Buffer.byteLength(boot)>4096)return stop();
 if(boot.includes("\n")){bootReady=true;if(channel)channel.write(boot);}
});
const deadline = setTimeout(stop, 10000);
function stop() {
 if (closing) return; closing = true;
 clearTimeout(deadline); server.close();
 for (const peer of peers) peer.destroy();
 if (!child) return process.exit(1);
 force = setTimeout(() => child.kill(), 1500);
}
const server = net.createServer(socket => {
 if (closing || channel || ++candidates > 4) {socket.destroy(); return;}
 peers.add(socket); socket.on('error', ()=>{if(socket===channel)stop();else socket.destroy();}); socket.on('close',()=>{peers.delete(socket);if(socket===channel)stop();});
 let prefix = Buffer.alloc(0), challenge, nonce;
 const proof=role=>createHmac("sha256",token).update(role+":"+id+":"+challenge+":"+nonce).digest("hex");
 socket.setTimeout(2000,()=>socket.destroy());
 function authenticate(data) {
  prefix = Buffer.concat([prefix,data]);
  if(prefix.length>65){socket.destroy();return;}
  if(prefix.length<65)return;
  socket.off('data',authenticate);
  if(prefix[64]!==10 || !/^[0-9a-f]{64}$/.test(prefix.subarray(0,64).toString())) {socket.destroy();return;}
  if(!challenge){challenge=prefix.subarray(0,64).toString();nonce=randomBytes(32).toString('hex');prefix=Buffer.alloc(0);socket.on('data',authenticate);socket.write(nonce+'.'+proof('server')+'\n');return;}
  if(!timingSafeEqual(prefix.subarray(0,64),Buffer.from(proof('client')))){socket.destroy();return;}
  if(channel || closing){socket.destroy();return;}
  channel=socket;socket.setTimeout(0);
  // Stop listening without unlinking a pipe still owned by its accepted socket.
  server.close(); for(const other of peers)if(other!==socket)other.destroy();
  let output="";socket.setEncoding("utf8");socket.on("data",data=>{
   output+=data;if(Buffer.byteLength(output)>4096)return stop();
   while(output.includes("\n")){const end=output.indexOf("\n"),line=output.slice(0,end);output=output.slice(end+1);
    try{const record=JSON.parse(line);
     if(record?.type==="attached"&&Object.keys(record).sort().join(",")==="deviceId,type"&&typeof record.deviceId==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.deviceId)){clearTimeout(deadline);}
     else if(record?.type==="disabled"&&Object.keys(record).join(",")==="type"){}else return stop();
     if(!process.stdout.write(JSON.stringify(record)+"\n")){socket.pause();process.stdout.once("drain",()=>{if(!closing)socket.resume();});}
    }catch{return stop();}
   }
  });if(bootReady)socket.write(boot);
 }
 socket.on('data',authenticate);
});
server.on('error',stop);
process.stdin.on('end',stop);process.stdin.on('error',stop);
process.stdout.on('error',stop);
server.listen(pipe,()=>{
 const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','NODE_OPTIONS','NODE_PATH'])delete env[key];
 env.SODA_ASSISTANT_CHANNEL_TOKEN=token;
 child=spawn(process.execPath,[dirname(__dirname),'--soda-managed','--soda-managed-channel='+id],{env,windowsHide:true,stdio:'ignore'});
 child.on('error',stop);child.on('close',code=>{clearTimeout(force);clearTimeout(deadline);for(const peer of peers)peer.destroy();server.close();process.stdout.write('{"type":"retired"}\n',()=>process.exit(code??1));});
 if(closing)child.kill();
});
