import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {connect, type Socket} from 'node:net';
import type {Readable, Writable} from 'node:stream';
/** The Windows GUI receives a private native pipe, never a network listener or executable path. */
export async function managedChannel(argv:readonly string[], platform:NodeJS.Platform=process.platform, env:NodeJS.ProcessEnv=process.env, connector:typeof connect=connect):Promise<{input:Readable;output:Writable;close():void}>{
 const args=argv.filter(x=>x.startsWith('--soda-managed-channel='));
 if(!args.length)return{input:process.stdin,output:process.stdout,close:()=>{}};
 if(platform!=='win32'||args.length!==1)throw Error('アシスタントの起動経路が不正です');
 const match=/^--soda-managed-channel=([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(args[0]!);
 const token=env.SODA_ASSISTANT_CHANNEL_TOKEN;delete env.SODA_ASSISTANT_CHANNEL_TOKEN;
 if(!match||!token||!/^[0-9a-f]{64}$/.test(token))throw Error('アシスタントの起動経路が不正です');
 const socket:Socket=connector('\\\\.\\pipe\\soda-assistant-'+match[1]);
 await new Promise<void>((resolve,reject)=>{
  const challenge=randomBytes(32).toString('hex');let buffer=Buffer.alloc(0),settled=false;
  const timer=setTimeout(()=>failed(Error('アシスタントの接続が時間切れです')),5000);
  const closed=()=>failed(Error('アシスタントの接続が終了しました'));
  const cleanup=()=>{clearTimeout(timer);socket.off('end',closed);socket.off('close',closed);};
  const failed=(error:Error)=>{if(settled)return;settled=true;cleanup();socket.destroy();reject(error);};
  socket.once('end',closed);socket.once('close',closed);
  socket.once('error',failed);
  const received=(data:Buffer)=>{
   buffer=Buffer.concat([buffer,data]);if(buffer.length>130)return failed(Error('アシスタントの接続認証に失敗しました'));
   if(buffer.length<130)return;
   const text=buffer.toString(),proof=/^([0-9a-f]{64})\.([0-9a-f]{64})\n$/.exec(text);
   const hmac=(role:string)=>createHmac('sha256',token).update(role+':'+match[1]+':'+challenge+':'+proof?.[1]).digest('hex');
   if(!proof||!timingSafeEqual(Buffer.from(proof[2]!),Buffer.from(hmac('server'))))return failed(Error('アシスタントの接続認証に失敗しました'));
   if(settled)return;settled=true;cleanup();socket.off('data',received);socket.off('error',failed);socket.on('error',()=>{});socket.pause();socket.write(hmac('client')+'\n');resolve();
  };
  socket.on('data',received);socket.once('connect',()=>socket.write(challenge+'\n'));
 });
 return{input:socket,output:socket,close:()=>socket.destroy()};
}
