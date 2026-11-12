import type {WsConnection} from "../ws/WsServer.js";
import {BridgeFrameDecoder,BRIDGE_FRAME as F,encodeBridgeFrame,encodeJson,markerBytes,parseClosePayload} from "../machine/bridgeFrames.js";

const reason="Signin connection is unavailable", encoder=new TextEncoder(),decoder=new TextDecoder("utf-8",{fatal:true});
const quiet=(fn:()=>void)=>{try{fn();}catch{}};
interface Channel {connection:WsConnection;text(value:string):void;close(code:number,remote?:boolean):void;}
/** Minimal bridge for the dedicated service. No listener, generic gateway,
 * binary lane, terminal, files, extension host or command execution is loaded. */
export class DesktopSigninBridge {
  readonly #channels=new Map<number,Channel>();
  #decoder:BridgeFrameDecoder|undefined=new BridgeFrameDecoder({role:"endpoint",maxMessageBytes:16384,allowBinary:false});
  #closed=false;
  readonly #abort=()=>this.close();
  constructor(private readonly options:{
    accept(connection:WsConnection):void;send(bytes:Uint8Array):void;
    bufferedAmount():number;active():boolean;signal:AbortSignal;end():void;
  }) {
    options.signal.addEventListener("abort",this.#abort,{once:true});
    if(!this.live()){this.close();return;}
    try{
      this.write(markerBytes());
      this.write(encodeBridgeFrame(F.HELLO,0,encodeJson({bridge:1,protocol:1,version:"desktop-signin-v1",hostname:"Signin",sessionName:null})));
    }catch{this.close();}
  }
  private live():boolean {
    try{return !this.#closed&&!this.options.signal.aborted&&this.options.active()&&!this.#closed&&!this.options.signal.aborted;}catch{return false;}
  }
  private write(bytes:Uint8Array):void {
    if(!this.live())throw new Error(reason);
    const pending=this.options.bufferedAmount();
    if(!Number.isFinite(pending)||pending<0||bytes.length+pending>65536||!this.live())throw new Error(reason);
    this.options.send(bytes);
    if(!this.live())throw new Error(reason);
  }
  /** Consumes arbitrary stream fragments without retaining an unchecked body. */
  receive(bytes:Uint8Array):void {
    if(!this.live()){this.close();return;}
    try{
      if(!(bytes instanceof Uint8Array)||bytes.length>32768)throw new Error(reason);
      for(const frame of this.#decoder!.push(bytes)) {
        if(!this.live())break;
        this.frame(frame.type,frame.channel,frame.payload);
      }
      if(!this.live())this.close();
    }catch{this.close();}
  }
  private frame(kind:number,id:number,body:Uint8Array):void {
    if(kind===F.PING){this.write(encodeBridgeFrame(F.PONG,0,body));return;}
    if(kind===F.OPEN){
      if(this.#channels.has(id)||this.#channels.size>=16)throw new Error(reason);
      let closed=false,text=(_value:string)=>{};
      const closes:((code:number)=>void)[]=[];
      const channel:Channel={text:value=>{if(!closed)text(value);},close:(code,remote=false)=>{
        if(closed)return;closed=true;this.#channels.delete(id);
        for(const fn of closes)quiet(()=>fn(code));
        if(!remote&&this.live())quiet(()=>this.write(encodeBridgeFrame(F.CLOSE,id,encodeJson({code:1008,reason}))));
      },connection:{
        get bufferedAmount(){return Math.max(0,options.bufferedAmount());},
        sendText:json=>{if(closed||!this.live())throw new Error(reason);const data=encoder.encode(json);this.write(encodeBridgeFrame(F.TEXT,id,data));},
        sendBinary:()=>channel.close(1008),onText:cb=>{text=cb;},onBinary:()=>{},onDrain:()=>{},onClose:cb=>{if(closed)quiet(()=>cb(1008));else closes.push(cb);},close:code=>channel.close(code),
      }};
      const options=this.options;
      this.#channels.set(id,channel);
      try{this.options.accept(channel.connection);}catch{channel.close(1008);}
      if(!this.live())this.close();
      return;
    }
    const channel=this.#channels.get(id);
    if(kind===F.CLOSE){const value=parseClosePayload(body);channel?.close(value.code,true);return;}
    if(kind===F.TEXT){if(!channel)throw new Error(reason);channel.text(decoder.decode(body));return;}
    throw new Error(reason);
  }
  close():void {
    if(this.#closed)return;this.#closed=true;
    this.options.signal.removeEventListener("abort",this.#abort);
    for(const channel of [...this.#channels.values()])channel.close(1008,true);
    this.#channels.clear();this.#decoder=undefined;
    quiet(this.options.end);
  }
}
