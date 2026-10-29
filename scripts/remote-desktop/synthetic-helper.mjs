let nativeCadence=false,nativeAdaptive=false,nativeCodecs=false,nativePointerProof=false;
/** Synthetic desktop protocol source. Never captures a screen or sends OS input. */
import { createServer } from "node:net";
import { chmodSync, unlinkSync,writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { createInterface } from "node:readline";
import { appendFileSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import {join} from "node:path";
import { pathToFileURL } from "node:url";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type),
    out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length);
  label.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}
export function reduceColor(r, g, b, mode = "full") {
  const q = (v, bits) => {
    const levels = (1 << bits) - 1;
    return Math.floor(
      (Math.floor((v * levels + 127) / 255) * 255 + Math.floor(levels / 2)) / levels,
    );
  };
  if (mode === "gray16") {
    const v = Math.floor((Math.floor((77 * r + 150 * g + 29 * b + 128) / 256) + 8) / 17) * 17;
    return [v, v, v];
  }
  if (mode === "rgb565") return [q(r, 5), q(g, 6), q(b, 5)];
  if (mode === "rgb332") return [q(r, 3), q(g, 3), q(b, 2)];
  return [r, g, b];
}
export function syntheticFrame(width, height, seq, color, mode = "full", layout) {
  const captureStart = performance.now(),
    raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (width * 3 + 1) + 1 + x * 3,
        tile = Math.imul((x >>> 3) + (y >>> 3) * 319 + seq, 2654435761) >>> 0;
      raw[i] = tile & 255;
      raw[i + 1] = (tile >>> 8) & 255;
      raw[i + 2] = (tile >>> 16) & 255;
      if (
        color &&
        ((x >= 16 && x < 48 && y >= 16 && y < 48) ||
          (x >= width - 48 && x < width - 16 && y >= height - 48 && y < height - 16))
      ) {
        raw[i] = color[0];
        raw[i + 1] = color[1];
        raw[i + 2] = color[2];
      }
      if(layout){const px=layout.bounds.x+Math.round(x*(layout.bounds.width-1)/Math.max(1,width-1)),py=layout.bounds.y+Math.round(y*(layout.bounds.height-1)/Math.max(1,height-1));const monitor=layout.monitors.find(m=>px>=m.x&&px<m.x+m.width&&py>=m.y&&py<m.y+m.height);raw[i]=monitor?.primary?255:0;raw[i+1]=0;raw[i+2]=monitor&&!monitor.primary?255:0;}
      if (mode !== "full")
        [raw[i], raw[i + 1], raw[i + 2]] = reduceColor(raw[i], raw[i + 1], raw[i + 2], mode);
    }
  const captureMs = performance.now() - captureStart,
    encodeStart = performance.now(),
    header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const image = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return {
    info: {
      seq,
      width,
      height,
      format: "image/png",
      captureMs,
      encodeMs: performance.now() - encodeStart,
      sourceCpuMs: (process.cpuUsage().user + process.cpuUsage().system) / 1000,
      sourceMemoryBytes: process.memoryUsage().rss,
    },
    data: image.toString("base64"),
  };
}
function heightOf(options) { return options.syntheticHeight ?? options.display?.height ?? Math.round(options.width * 9 / 16); }
function run() {
  const platformAt=process.argv.indexOf("--native-platform"),nativePlatform=platformAt>=0?process.argv[platformAt+1]:undefined;if(nativePlatform&&!["linux-portal","macos-sck"].includes(nativePlatform))throw Error("Fixture platform");
  const lifecycleAt=process.argv.indexOf("--lifecycle-ledger"),lifecycle=lifecycleAt>=0?process.argv[lifecycleAt+1]:undefined;
  if(lifecycle)appendFileSync(lifecycle,JSON.stringify({type:"spawn",pid:process.pid})+"\n");
  let configureDelayed=false;
  let options,monitorLayout,topologyStopped=false,
    inputAckPipe = false,
    cursorEnabled=false,cursorSeq=0,cursorShapeId=1,cursorSentShape=0,cursorX=.5,cursorY=.5,cursorVisible=true,cursorRed=false,lastCursor=-1000,
    outputBlocked = false,
    blockedSeq = 0,
    queuedOutput = [],
    pending = 0,
    seq = 0,
    next = 0,
    lastSeen = performance.now(),
    control = false,
    forceFull = true,
    version = 0,
    sentVersion = -1,
    lastReport = 0,
    clipboard="",clipboardAllowed=false,clipboardGeneration=0;
  const nativeAt=process.argv.indexOf("--native-fixture"),nativeRaw=nativeAt>=0?JSON.parse(readFileSync(process.argv[nativeAt+1],"utf8")):undefined,nativeProfiles=nativeRaw?.profiles??(nativeRaw?[nativeRaw]:[]),nativeFixture=nativeProfiles[0];
  const codecFolderAt=process.argv.indexOf("--codec-fixtures"),codecFolder=codecFolderAt>=0?process.argv[codecFolderAt+1]:undefined,codecFixtures={h264:nativeFixture};
  if(codecFolder)for(const [codec,file]of [["hevc","hevc-hardware-generated.json"],["av1","av1-software-generated.json"]])codecFixtures[codec]=JSON.parse(readFileSync(join(codecFolder,file),"utf8"));
  const codecProfiles=Object.fromEntries(Object.entries(codecFixtures).map(([name,fixture])=>[name,[fixture]]));
  const codecProfileAt=process.argv.indexOf("--codec-profile");if(codecProfileAt>=0){const value=JSON.parse(readFileSync(process.argv[codecProfileAt+1],"utf8"));codecProfiles[value.family]=value.profiles;codecFixtures[value.family]=value.profiles[0];}
  const ledgerAt=process.argv.indexOf("--input-ledger"),ledger=ledgerAt>=0?process.argv[ledgerAt+1]:undefined,held=new Set();
  const note=type=>{if(ledger)appendFileSync(ledger,JSON.stringify({type,held:[...held]})+"\n");};
  let richState,richVersion=0,richValue={text:"B generated table",html:'<table><tr><td style="color:green">B generated table</td></tr></table>',rtf:Buffer.from("{\\rtf1 generated}").toString("base64"),png:syntheticFrame(32,32,1,[0,255,0]).data};
  const clearRich=()=>{if(richState?.data)richState.data.fill(0);richState=undefined;};
  const rich=m=>{
    const reply=value=>send({type:"clipboard_rich_result",id:m.id,...value});
    if(!clipboardAllowed||secure||m.generation!==clipboardGeneration||m.expiresAt<Date.now()||!process.argv.includes("--rich-clipboard")){clearRich();reply({ok:false,stage:"done"});return;}
    const ok=m.operation==="read"||m.operation==="pull"||m.operation==="cancel"||allowInput;
    if(!ok){reply({ok:false,stage:"done"});return;}
    if(m.operation==="read"||m.operation==="begin"){
      if(richState){reply({ok:false,stage:"done"});return;}
      const data=m.operation==="read"?Buffer.from(JSON.stringify(richValue)):Buffer.alloc(m.size);
      if(data.length<1||data.length>4194304){reply({ok:false,stage:"done"});return;}
      richState={id:m.id,data,offset:0,read:m.operation==="read",gen:clipboardGeneration,version:richVersion};
      const response={ok:true,stage:"begin",size:data.length};if(process.argv.includes("--rich-delay-read")&&m.operation==="read")setTimeout(()=>reply(response),300);else reply(response);return;
    }
    const c=richState;if(!c||c.id!==m.id||c.gen!==clipboardGeneration){reply({ok:false,stage:"done"});return;}
    if(m.operation==="pull"&&c.read&&m.offset===c.offset){const end=Math.min(c.offset+16384,c.data.length),data=c.data.subarray(c.offset,end).toString("base64");c.offset=end;reply({ok:true,stage:"chunk",offset:end,data});if(end===c.data.length)clearRich();}
    else if(m.operation==="push"&&!c.read&&m.offset===c.offset){const data=Buffer.from(m.data,"base64");if(data.length<1||data.length>16384||c.offset+data.length>c.data.length)throw Error("Synthetic clipboard chunk");data.copy(c.data,c.offset);c.offset+=data.length;data.fill(0);const response={ok:true,stage:"chunk",offset:c.offset};if(process.argv.includes("--rich-delay-push"))setTimeout(()=>reply(response),300);else reply(response);}
    else if(m.operation==="commit"&&!c.read&&c.offset===c.data.length){if(process.argv.includes("--rich-mutate-on-commit"))richVersion++;if(c.version!==richVersion){clearRich();reply({ok:false,stage:"done"});return;}richValue=JSON.parse(c.data.toString());richVersion++;clearRich();reply({ok:true,stage:"done"});}
    else if(m.operation==="cancel"){clearRich();reply({ok:true,stage:"cancelled"});}
    else{clearRich();reply({ok:false,stage:"done"});}
  };
  let native, audio,nativeAcceptedInput=0;
  const stopAudio=()=>{if(!audio)return;const old=audio;audio=undefined;if(lifecycle)appendFileSync(lifecycle,JSON.stringify({type:"audio_stop",id:old.id})+"\n");clearInterval(old.timer);old.socket?.destroy();old.server.close();if(old.path&&!old.path.startsWith("\\\\")){try{unlinkSync(old.path);}catch{}}};
  const startAudio=m=>{
    stopAudio();if(!native||native.id!==m.id||secure||!process.argv.includes("--native-audio"))return;
    const path=process.platform==="win32"?"\\\\.\\pipe\\"+m.pipeName:m.pipePath;
    if(typeof path!=="string")return;
    if(lifecycle)appendFileSync(lifecycle,JSON.stringify({type:"audio_start",id:m.id})+"\n");
    const current=audio={id:m.id,path,server:undefined,socket:undefined,timer:undefined,seq:0,timestamp:Math.max(0,Math.round(native.seq*1000000/native.fps))};
    const server=current.server=createServer(socket=>{
      if(audio!==current||current.socket){socket.destroy();return;}current.socket=socket;socket.on("error",()=>{});
      if(process.argv.includes("--audio-unavailable")){socket.end();return;}
      socket.write(Buffer.from([83,68,65,80,1,2,16,0,128,187,0,0,192,3,0,0]));
      current.timer=setInterval(()=>{
        if(audio!==current||!native||native.id!==m.id)return stopAudio();
        if(socket.writableLength>8192)return;
        current.seq++;current.timestamp=Math.max(current.timestamp+20000,Math.floor((performance.now()-native.started)/20)*20000);
        const packet=Buffer.alloc(3856);packet.writeUInt32LE(3840);packet.writeUInt32LE(current.seq,4);packet.writeBigUInt64LE(BigInt(current.timestamp),8);
        for(let i=0;i<960;i++){const value=Math.round(Math.sin((i+(current.seq-1)*960)*Math.PI*2*440/48000)*12000);packet.writeInt16LE(value,16+i*4);packet.writeInt16LE(value,18+i*4);}socket.write(packet);
      },20);
    });server.on("error",()=>stopAudio());server.listen(path,()=>{if(process.platform!=="win32"){try{chmodSync(path,0o600);}catch{stopAudio();}}});
  };
  let microphone;
  const stopMicrophone=()=>{if(!microphone)return;const old=microphone;microphone=undefined;old.socket?.destroy();old.server.close();if(old.path&&!old.path.startsWith("\\\\")){try{unlinkSync(old.path);}catch{}}if(lifecycle)appendFileSync(lifecycle,JSON.stringify({type:"microphone_stop",id:old.id})+"\n");};
  const startMicrophone=m=>{
    stopMicrophone();if(secure||!process.argv.includes("--microphone-fixture"))return;
    const path=process.platform==="win32"?"\\\\.\\pipe\\"+m.pipeName:m.pipePath;
    const current=microphone={id:m.id,path,server:undefined,socket:undefined,pending:Buffer.alloc(0),seq:0};
    const server=current.server=createServer(socket=>{if(microphone!==current||current.socket){socket.destroy();return;}current.socket=socket;socket.on("error",()=>{});socket.on("close",()=>{if(microphone===current)stopMicrophone();});socket.write(new Uint8Array([83,68,77,73,1,1,16,0,128,187,0,0,192,3,0,0]));
      socket.on("data",bytes=>{if(microphone!==current)return;current.pending=Buffer.concat([current.pending,bytes]);if(current.pending.length>8192){stopMicrophone();return;}while(current.pending.length>=1932){const packet=current.pending.subarray(0,1932);current.pending=current.pending.subarray(1932);const seq=packet.readUInt32LE(),expiry=packet.readDoubleLE(4);if(seq<=current.seq||!Number.isFinite(expiry)||expiry>Date.now()+150){stopMicrophone();return;}current.seq=seq;if(expiry<Date.now())continue;let energy=0;for(let i=12;i<1932;i+=2)energy+=packet.readInt16LE(i)**2;if(lifecycle)appendFileSync(lifecycle,JSON.stringify({type:"microphone_frame",id:m.id,seq,rms:Math.sqrt(energy/960)})+"\n");packet.fill(0);}});
    });server.on("error",stopMicrophone);server.listen(path,()=>{if(process.platform!=="win32"){try{chmodSync(path,0o600);}catch{stopMicrophone();}}});if(lifecycle)appendFileSync(lifecycle,JSON.stringify({type:"microphone_start",id:m.id})+"\n");
  };
  process.on("exit",stopMicrophone);
  process.on("exit",stopAudio);
  const allowInput = process.argv.includes("--allow-input");
  const markerAt = process.argv.indexOf("--unlock-marker");
  const unlockMarker = markerAt >= 0 ? process.argv[markerAt + 1] : undefined;
  let secure = process.argv.includes("--secure") && (!unlockMarker || !existsSync(unlockMarker));
  const protectedAt=process.argv.indexOf("--protected-mode"),configuredProtected=protectedAt>=0?process.argv[protectedAt+1]:undefined;
  if(configuredProtected&&!['elevated-default','elevated-uac'].includes(configuredProtected))throw Error("Generated protected role");
  const protectedEndAt=process.argv.indexOf("--protected-end-marker"),protectedEndMarker=protectedEndAt>=0?process.argv[protectedEndAt+1]:undefined;
  let protectedMode,protectedEnded=false;
  const coverAt = process.argv.indexOf("--cover-marker"), coverMarker = coverAt >= 0 ? process.argv[coverAt + 1] : undefined;
  const lockCover = secure && process.argv.includes("--lock-cover") && (!coverMarker || !existsSync(coverMarker));
  const recordAt = process.argv.indexOf("--record"),
    record = recordAt >= 0 ? process.argv[recordAt + 1] : undefined;
  const send = (value) => { if(outputBlocked){if(queuedOutput.length<8)queuedOutput.push(value);}else process.stdout.write(JSON.stringify(value) + "\n"); };
  const cursor=()=>{
    if(!cursorEnabled)return;
    const info={type:"cursor",seq:++cursorSeq,visible:cursorVisible,x:cursorVisible?cursorX:0,y:cursorVisible?cursorY:0,shapeId:cursorVisible?cursorShapeId:0};
    if(cursorVisible&&cursorSentShape!==cursorShapeId){
      const pixels=new Uint8Array(64);for(let p=0;p<pixels.length;p+=4){pixels[p+3]=cursorRed?128:255;if(cursorRed)pixels[p+2]=255;}
      if(!cursorRed){pixels[0]=pixels[1]=pixels[2]=255;pixels[4]=0;pixels[5]=255;pixels[6]=0;pixels[7]=0;pixels[20]=pixels[21]=pixels[22]=255;pixels[23]=0;}
      info.shape={kind:cursorRed?2:4,width:4,height:4,pitch:16,hotspotX:1,hotspotY:1,premultiplied:false};info.data=Buffer.from(pixels).toString("base64");cursorSentShape=cursorShapeId;
    }
    lastCursor=performance.now();send(info);
  };
  let resourceMode=false,resourceEpochs=new Map(),resourceReleased=new Set(["control","clipboard","microphone"]),resourceFailed=false;
  process.on("exit",()=>{if(resourceMode&&!resourceFailed){held.clear();for(const epoch of resourceEpochs.values())try{writeSync(1,JSON.stringify({type:"resource_fence_ack",id:epoch,terminal:true})+"\n");}catch{}}});
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const heldPointerAcks=[];
  function acknowledgeInput(seq,pointer){
    if(inputAckPipe){if(pointer)process.stderr.write(`SODA_DESKTOP_POINTER_ACK ${seq} ${pointer.epoch} ${pointer.x} ${pointer.y} ${pointer.window} ${pointer.pid}\n`);process.stderr.write("SODA_DESKTOP_INPUT_ACK "+seq+"\n");}
    else send({type:"input_ack",seq,...(pointer?{pointer}:{})});
  }
  lines.on("close", () => process.exit(0));
  lines.on("line", (line) => {
    try {
      const m = JSON.parse(line);if(m.type==="release"||(m.type==="control"&&!m.enabled)){held.clear();note(m.type);}
      const delayAt=process.argv.indexOf("--configure-delay-ms");
      if(m.type==="configure"&&!configureDelayed&&delayAt>=0){configureDelayed=true;const delay=Number(process.argv[delayAt+1]);if(!Number.isInteger(delay)||delay<1||delay>20000)throw Error("Generated delay bound");setTimeout(()=>lines.emit("line",line),delay);return;}
      if (m.type === "configure" && !options) {
        const expectedEnvAt=process.argv.indexOf("--expect-elevated-request");if(expectedEnvAt>=0&&process.env.SODA_DESKTOP_ELEVATED_REQUEST!==process.argv[expectedEnvAt+1])throw Error("Generated source request environment mismatch");
        if(configuredProtected&&(((m.options.elevatedDesktop===true||m.allowSharedProtected===true)&&m.allowElevated===true)||process.argv.includes("--protected-unconditional"))){protectedMode=configuredProtected;secure=true;}
        resourceMode=m.resourceFences===true&&!process.argv.includes("--no-resource-fences");
        cursorEnabled=m.separateCursor===true&&process.argv.includes("--cursor")&&!secure&&m.options.image?.showCursor!==false;
        inputAckPipe=m.inputAckPipe===true&&process.argv.includes("--input-ack-pipe")&&!secure;
        nativePointerProof=m.nativePointerProof===true&&resourceMode&&!secure&&process.argv.includes("--pointer-witness-generated");
        const failureAt = process.argv.indexOf("--startup-failure");
        if (failureAt >= 0) {
          const code = process.argv[failureAt + 1], markerAt = process.argv.indexOf("--startup-marker");
          const marker = markerAt >= 0 ? process.argv[markerAt + 1] : undefined;
          if (!marker || !existsSync(marker)) {
            if (marker) writeFileSync(marker, "retry");
            send({ type: "unlock_failure", code, message: "private native exception must not escape" });
            return;
          }
        }
        nativeCodecs=m.nativeCodecs===true&&process.argv.includes("--native-codecs")&&!secure;
        nativeAdaptive=m.nativeAdaptive===true&&process.argv.includes("--native-adaptive")&&!secure;
        options = m.options;if(nativeAdaptive&&nativeFixture)options={...options,syntheticHeight:Math.round(nativeFixture.height*options.width/nativeFixture.width)};nativeCadence=m.nativeCadence===true&&process.argv.includes("--native-cadence")&&!secure;
        const virtualSource=options.virtualDisplay===true&&m.allowVirtualDisplay===true&&process.argv.includes("--virtual-display")&&!secure;
        if(process.argv.includes("--headless")&&!virtualSource)throw Error("Generated headless source requires an owned virtual monitor");
        if(virtualSource&&process.argv.includes("--virtual-missing")){send({type:"virtual_display_failure",code:"driver_missing"});setTimeout(()=>process.exit(0),25);return;}
        if(m.allowMonitors===true&&options.monitors===true&&process.argv.includes("--monitors")&&!secure){
          let monitors=[{id:"left",x:-640,y:-200,width:640,height:480,primary:false,scalePercent:125},{id:"right",x:0,y:0,width:800,height:600,primary:true,scalePercent:150}];if(process.argv.includes("--monitors-cinema"))monitors=monitors.map(v=>v.primary?{...v,height:610}:v);if(process.argv.includes("--monitors-wide"))monitors=monitors.map(v=>({...v,height:Math.round(v.width*9/16)}));if(process.argv.includes("--monitors-one"))monitors=monitors.filter(v=>v.primary);const selected=options.monitorDevice??"right",item=monitors.find(v=>v.id===selected);
          if(selected!=="all"&&!item)throw Error("Monitor missing");const lx=Math.min(...monitors.map(v=>v.x)),ly=Math.min(...monitors.map(v=>v.y)),rx=Math.max(...monitors.map(v=>v.x+v.width)),by=Math.max(...monitors.map(v=>v.y+v.height));const bounds=selected==="all"?{x:lx,y:ly,width:rx-lx,height:by-ly}:{x:item.x,y:item.y,width:item.width,height:item.height};monitorLayout={selected,bounds,allSupported:true,monitors};const width=Math.min(options.width,bounds.width);options={...options,width,syntheticHeight:Math.round(bounds.height*width/bounds.width)};
        }else if(options.monitorDevice&&!secure&&process.argv.includes("--monitors"))throw Error("Monitor not permitted");
        const modes = nativeAdaptive?[{width:nativeFixture.width,height:nativeFixture.height}]:[{width:640,height:480},{width:800,height:600},{width:1024,height:768},{width:1280,height:720},{width:1600,height:900},{width:1920,height:1080}];
        const displayAllowed = !secure && (!monitorLayout||monitorLayout.monitors.length===1) && process.argv.includes("--allow-display-resize") && m.allowDisplayResize === true;
        if (options.display) {
          if (!displayAllowed || !modes.some(mode => mode.width === options.display.width && mode.height === options.display.height)) throw Error("display not allowed");
          options = {...options, width:options.display.width};
          if(monitorLayout){const bounds={...monitorLayout.bounds,width:options.display.width,height:options.display.height};monitorLayout={...monitorLayout,bounds,monitors:monitorLayout.monitors.map(v=>({...v,width:bounds.width,height:bounds.height}))};options={...options,syntheticHeight:bounds.height};}
        }
        if (record && process.argv.includes("--dxgi")) writeFileSync(record + ".configure.json", JSON.stringify(m));
        send({
          type: "ready",
          ...(resourceMode?{resourceFences:true}:{}),
          ...(protectedMode?{protectedDesktop:protectedMode,...(m.allowSharedProtected===true&&!process.argv.includes("--no-shared-protected")?{sharedProtected:true}:{})}:{}),
          ...(virtualSource?{virtualDisplay:true}:{}),
          ...(monitorLayout?{monitorLayout}:{}),
          ...(m.richClipboard===true&&m.allowClipboard===true&&process.argv.includes("--allow-clipboard")&&process.argv.includes("--rich-clipboard")&&!secure?{richClipboard:true}:{}),
          ...(m.allowMicrophone===true&&m.microphoneEndpoint&&process.argv.includes("--microphone-fixture")&&!secure?{microphone:true}:{}),
          ...(nativeFixture&&m.allowSystemAudio===true&&process.argv.includes("--native-audio")&&!secure?{nativeAudio:true}:{}),
          ...(cursorEnabled?{cursor:true}:{}),
          ...(m.inputAckPipe===true&&process.argv.includes("--input-ack-pipe")&&!secure?{inputAckPipe:true}:{}),
          ...(nativePointerProof?{nativePointerProof:true}:{}),
          ...(nativeFixture&&m.nativeDatagrams===true&&process.argv.includes("--native-datagrams")&&!secure?{nativeDatagrams:true}:{}),
          ...(nativeFixture&&nativeCodecs?{nativeCodecs:true,nativeCodecCandidates:["h264","hevc","av1"]}:{}),
          ...(nativeFixture&&nativeAdaptive?{nativeAdaptive:true}:{}),
          ...(nativeFixture&&m.nativeCadence===true&&process.argv.includes("--native-cadence")&&!secure?{nativeCadence:true}:{}),
          ...(nativeFixture&&m.nativeMaxFps===60&&process.argv.includes("--native-60fps")&&!secure?{nativeMaxFps:60}:{}),
          ...(nativeFixture && m.allowNativeVideo===true && !secure ? {nativeVideo:true,...(m.nativeVideoWindow===3&&!process.argv.includes("--no-native-pipeline")?{nativeVideoWindow:3}:{})}:{}),
          ...(nativeFixture&&m.deferNativeSnapshots===true&&process.argv.includes("--native-input-deferral")&&!secure?{deferNativeSnapshots:true}:{}),
          ...(!process.argv.includes("--no-extended-input") && m.options.extendedInput === true ? {extendedInput:true} : {}),
          ...(!process.argv.includes("--no-ime-keys") && (m.options.imeKeys === true || process.argv.includes("--unconditional-ime-keys")) ? {imeKeys:true} : {}),
          title: virtualSource?"Generated owned virtual desktop":"Synthetic test source",
          allowInput,
          width: monitorLayout?.bounds.width??options.width,
          height: monitorLayout?.bounds.height??heightOf(options),
          backend: nativePlatform??(process.argv.includes("--dxgi") && m.captureBackends?.includes("dxgi") ? "windows-dxgi" : "synthetic"),
          ...(secure ? {secureDesktop:true} : {}),
          ...(nativePlatform?{inputCapabilities:{keys:["KeyA","ControlLeft","Space","ArrowLeft","ArrowRight"],text:true,pointerButtons:[0,1,2,3,4],wheel:true}}:{}),
          ...(lockCover ? {lockScreenCover:true} : {}),
          ...(displayAllowed ? {display:{modes}} : {}),
          image: options.image ?? { colorMode: "full", showCursor: true },
          allowClipboard: !secure && process.argv.includes("--allow-clipboard") && m.allowClipboard===true, dynamicQuality:!process.argv.includes("--native-only"),
        });
        const readyFailureAt=process.argv.indexOf("--ready-failure");
        const readyMarkerAt=process.argv.indexOf("--ready-marker"),readyMarker=readyMarkerAt>=0?process.argv[readyMarkerAt+1]:undefined;
        if(readyFailureAt>=0&&(!readyMarker||!existsSync(readyMarker))) {
          if(readyMarker)writeFileSync(readyMarker,"ended");
          // Fixed metadata only, modeling a worker that ends after its ready.
          send({type:"unlock_failure",code:process.argv[readyFailureAt+1],message:"private native failure"});
          // A parent's later transition may not overwrite the worker's fault.
          send({type:"unlock_failure",code:"source_transition"});
        }
      } else if (m.type === "heartbeat") {lastSeen = performance.now();for(const pending of heldPointerAcks.splice(0))acknowledgeInput(pending.seq,pending.pointer);}
      else if (m.type === "ack" && m.seq === pending) pending = 0;
      else if(m.type==="native_microphone"){if(m.enabled)startMicrophone(m);else if(microphone?.id===m.id)stopMicrophone();}
      else if(m.type==="native_audio"){if(m.enabled)startAudio(m);else if(native?.id===m.id)stopAudio();}
      else if(m.type==="native_video") {
        if(lifecycle)appendFileSync(lifecycle,JSON.stringify({type:m.enabled?"native_start":"native_stop",id:m.id})+"\n");
        stopAudio();
        if(m.enabled&&nativeFixture&&!secure){const requested=nativeCodecs?(m.codec??"h264"):"h264",codec=codecFixtures[requested]&&!process.argv.includes("--codec-encoder-failure")?requested:"h264";native={codec,codecFallback:codec!==requested?"unavailable":undefined,generation:1,profile:0,barrier:undefined,lastTimestamp:-1,id:m.id,started:performance.now(),seq:0,pending:[],next:0,index:0,fps:m.fps,maxFps:m.fps,maxBitrate:m.bitrateKbps,window:m.window===3?3:1};}
        else native=undefined;
      }
      else if(m.type==="native_profile"&&native&&m.id===native.id){
        const profiles=native.codec!=="h264"?codecProfiles[native.codec]:nativeProfiles,profile=profiles.findIndex(p=>p.width===m.width&&p.height===m.height);
        if(!nativeAdaptive||native.barrier||profile<0||m.generation!==native.generation+1)throw Error("Native profile gate");
        native.barrier={...m,profile,stage:"drain"};
      }
      else if(m.type==="native_profile_resume"&&native&&m.id===native.id){const b=native.barrier;if(!b||b.stage!=="prepared"||m.generation!==b.generation||m.baseSeq!==native.seq)throw Error("Native resume fence");native.generation=b.generation;native.profile=b.profile;native.index=0;native.fps=b.fps;b.stage="resumed";}
      else if(m.type==="native_keyframe"&&native&&m.id===native.id)native.index=0;
      else if(m.type==="resource_epoch"){if(!resourceMode||!resourceReleased.has(m.resource))throw Error("Generated resource epoch");resourceEpochs.set(m.resource,m.id);resourceReleased.delete(m.resource);}
      else if(m.type==="resource_fence"){
        if(!resourceMode||m.epoch!==resourceEpochs.get(m.resource))throw Error("Generated resource fence");
        if(process.argv.includes("--fail-resource-cleanup")){resourceFailed=true;process.exit(1);}
        if(!process.argv.includes("--stall-resource-fence")){if(m.resource==="control"){control=false;held.clear();}if(m.resource==="clipboard"){clipboardAllowed=false;clearRich();}if(m.resource==="microphone")stopMicrophone();resourceReleased.add(m.resource);send({type:"resource_fence_ack",id:m.id});}
      }
      else if(m.type==="native_rate"&&native&&m.id===native.id){if(native.barrier)return;if(!nativeCadence||!process.argv.includes("--native-cadence")||m.fps<1||m.fps>native.maxFps||m.kbps<128||m.kbps>native.maxBitrate)throw Error("Native rate ceiling");native.fps=m.fps;if(lifecycle)appendFileSync(lifecycle,JSON.stringify({type:"native_rate",id:m.id,fps:m.fps,kbps:m.kbps})+"\n");}
      else if(m.type==="native_bitrate"&&native&&m.id===native.id){}
      else if(m.type==="native_video_ack"&&native&&m.id===native.id&&m.seq===native.pending[0])native.pending.shift();
      else if (m.type === "keyframe") {forceFull = true;next=0;}
      else if(m.type==="policy" && options){options={...options,fps:m.fps,quality:m.quality};next=0;}
      else if(m.type==="clipboard_rich"){rich(m);}
      else if(m.type==="clipboard_control"){clearRich();clipboardAllowed=m.enabled && process.argv.includes("--allow-clipboard");clipboardGeneration=m.generation;}
      else if(m.type==="clipboard"){
        let ok=clipboardAllowed && m.generation===clipboardGeneration && m.expiresAt>=Date.now();
        if(m.operation==="write"){ok=ok&&allowInput;if(ok)clipboard=m.text;send({type:"clipboard_result",id:m.id,ok});}
        else send({type:"clipboard_result",id:m.id,ok,...(ok?{text:clipboard}:{})});
      }
      else if (m.type === "release" && outputBlocked) {
        process.stdout.write(blockedSeq+'}\n');outputBlocked=false;
        for(const value of queuedOutput)send(value);queuedOutput=[];
      }
      else if (m.type === "control") {
        control = (!resourceMode||resourceEpochs.has("control")&&!resourceReleased.has("control"))&&m.enabled && allowInput;
      } else if (m.type === "dismiss_lock_screen" && lockCover && control) {
        if (coverMarker) writeFileSync(coverMarker,"dismissed");
        send({type:"lock_screen_changed"});
        process.exit(0);
      } else if (m.type === "sas" && secure && !protectedMode && control) {
        if (unlockMarker) writeFileSync(unlockMarker,"unlocked");
        send({type:"session_unlocked"});
        process.exit(0);
      } else if (m.type === "input" && control && m.expiresAt >= Date.now()) {
        if(m.input.kind==="key"){if(m.input.down)held.add(m.input.code);else held.delete(m.input.code);note(m.input.down?"key-down":"key-up");}
        if(cursorEnabled){
          if(m.input.kind==="pointer"){
            if(!process.argv.includes("--cursor-no-echo")){cursorX=m.input.x;cursorY=m.input.y;}
            if(m.input.event!=="move"){cursorRed=m.input.event==="down";cursorShapeId++;}cursor();
          }else if(m.input.kind==="key"&&m.input.code==="F13"&&m.input.down){cursorVisible=!cursorVisible;cursor();}
        }
        if (process.argv.includes("--delta-test") && m.input.kind === "text") version++;
        if (record) appendFileSync(record, JSON.stringify(m.input) + "\n");
        if(nativePlatform)nativeAcceptedInput=m.seq;
        if(process.argv.includes("--block-stdout-on-input")&&!blockedSeq) { blockedSeq=m.seq;outputBlocked=true;process.stdout.write('{"type":"input_ack","seq":'); }
        if (!process.argv.includes("--stall-input")) {
          const pointer=nativePointerProof&&m.input.kind==="pointer"&&m.input.event==="down"&&m.input.button===0?{epoch:resourceEpochs.get("control"),x:-400,y:50,window:42,pid:7}:undefined;
          if(pointer&&process.argv.includes("--hold-pointer-witness-generated")){if(heldPointerAcks.length>=64)heldPointerAcks.shift();heldPointerAcks.push({seq:m.seq,pointer});}
          else acknowledgeInput(m.seq,pointer);
        }
      } else if (m.type === "stop") process.exit(0);
    } catch {
      process.exit(1);
    }
  });
  setInterval(() => {
    if(protectedMode&&protectedEndMarker&&existsSync(protectedEndMarker)&&!protectedEnded){protectedEnded=true;control=false;held.clear();note("scope-ended");send({type:"protected_desktop_failure",code:"source_changed"});setTimeout(()=>process.exit(0),20);return;}
    if(protectedEnded)return;
    const topologyAt=process.argv.indexOf("--topology-marker");if(!topologyStopped&&monitorLayout&&topologyAt>=0&&existsSync(process.argv[topologyAt+1])){topologyStopped=true;send({type:"monitor_topology_changed"});setTimeout(()=>process.exit(0),50);}
    if (performance.now() - lastSeen > 8000) process.exit(0);
    if(options&&cursorEnabled&&performance.now()-lastCursor>=500)cursor();
    if(native?.barrier?.stage==="drain"&&!native.pending.length){const b=native.barrier,p=(native.codec!=="h264"?codecProfiles[native.codec]:nativeProfiles)[b.profile],packet=p.packets[0];b.stage="prepared";b.timestamp=Math.max(native.lastTimestamp+1,Math.round((performance.now()-native.started)*1000));send({type:"native_profile_applied",id:native.id,generation:b.generation,baseSeq:native.seq,width:p.width,height:p.height,codec:packet.codec});}
    if(options&&native&&(!native.barrier||native.barrier.stage==="resumed")&&native.pending.length<native.window&&performance.now()>=native.next) {
      const fixture=native.codec!=="h264"?codecProfiles[native.codec][native.profile]:nativeProfiles[native.profile],packet=fixture.packets[native.index++%fixture.packets.length];
      native.pending.push(++native.seq);native.next=performance.now()+1000/native.fps;
      native.lastTimestamp=native.barrier?.stage==="resumed"?native.barrier.timestamp:Math.max(native.lastTimestamp+1,Math.round((performance.now()-native.started)*1000));native.barrier=undefined;
      send({type:"native_frame",...(nativeCodecs?{codecName:native.codec,...(native.codecFallback?{codecFallback:native.codecFallback}:{})}:{}),...(nativeAdaptive?{generation:native.generation,captureMs:native.profile===0?55:5}:{}),...(process.argv.includes("--native-test-cost")?{captureMs:80}:{}),id:native.id,seq:native.seq,timestamp:native.lastTimestamp,key:packet.key,...(packet.codec?{codec:packet.codec}:{}),width:fixture.width,height:fixture.height,data:packet.data});
    }
    if(native&&process.argv.includes("--stall-images-during-native"))return;
    if (!options || lockCover || pending || performance.now() < next) return;
    const deltaTest = process.argv.includes("--delta-test"),
      stable = deltaTest || process.argv.includes("--static");
    const optimized = options.deltas && stable;
    if (optimized && !forceFull && sentVersion === version && performance.now() - lastReport < 1000)
      return;
    const baseSeq = seq;
    pending = ++seq;
    const color = reduceColor(
      ...(version % 2 ? [255, 0, 0] : [0, 255, 0]),
      options.image?.colorMode,
    );
    let frame;
    if (optimized && !forceFull && sentVersion !== version) {
      const patch = syntheticFrame(32, 32, 1, color); // Solid payload is generated explicitly below.
      const raw = Buffer.alloc((32 * 3 + 1) * 32);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++)
          for (let k = 0; k < 3; k++) raw[y * 97 + 1 + x * 3 + k] = color[k];
      const header = Buffer.alloc(13);
      header.writeUInt32BE(32);
      header.writeUInt32BE(32, 4);
      header[8] = 8;
      header[9] = 2;
      const image = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
      ]);
      frame = {
        info: {
          ...patch.info,
          width: options.width,
          height: heightOf(options),
          update: {
            kind: "patch",
            baseSeq,
            patches: [
              { x: 16, y: 16, width: 32, height: 32, offset: 0, length: image.length },
              {
                x: options.width - 48,
                y: heightOf(options) - 48,
                width: 32,
                height: 32,
                offset: image.length,
                length: image.length,
              },
            ],
          },
        },
        data: Buffer.concat([image, image]).toString("base64"),
      };
    } else if (optimized && !forceFull && sentVersion === version) {
      frame = {
        info: {
          seq,
          width: options.width,
          height: heightOf(options),
          format: "image/png",
          captureMs: 0,
          encodeMs: 0,
          update: { kind: "unchanged", baseSeq },
        },
        data: "",
      };
    } else
      frame = syntheticFrame(
        options.width,
        heightOf(options),
        stable ? 1 : seq,
        deltaTest ? color : undefined,
        options.image?.colorMode,
        monitorLayout,
      );
    if (optimized)
      frame.info.contentId = createHash("sha256")
        .update("static-" + version)
        .digest("hex");
    if(nativePlatform){frame.info.timing="unavailable";frame.info.sourceInputSeq=nativeAcceptedInput;}
    frame.info.seq = seq;
    forceFull = false;
    sentVersion = version;
    lastReport = performance.now();
    send({ type: "frame", ...frame });
    next = performance.now() + 1000 / options.fps;
  }, 2);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
