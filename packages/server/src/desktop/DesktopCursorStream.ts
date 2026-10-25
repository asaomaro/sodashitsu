import {encodeDesktopCursor,parseDesktopCursor,type DesktopCursorPacket} from "@sodashitsu/protocol";
/** One current shape, one peer shape id. Dropped positions never lose the shape. */
export class DesktopCursorStream {
 private last=0;
 private shape:DesktopCursorPacket|undefined;
 private peerShape=0;
 constructor(private send:(bytes:Uint8Array)=>boolean,private buffered:()=>number){}
 accept(packet:{info:unknown;data:Uint8Array}){
  const {info,data}=parseDesktopCursor(packet.info,packet.data);if(info.seq<=this.last)return;this.last=info.seq;
  if(info.shape)this.shape={info,data:data.slice()};
  if(info.visible&&this.buffered()>64*1024){this.peerShape=0;return;}
  const shape=this.shape;
  if(info.visible&&shape?.info.shapeId!==info.shapeId)return;
  const attach=!!info.visible&&this.peerShape!==info.shapeId&&shape?.info.shapeId===info.shapeId;
  const {shape:_shape,...pose}=info;
  if(!this.send(encodeDesktopCursor(attach?{...pose,shape:shape!.info.shape}:pose,attach?shape!.data:new Uint8Array()))){this.peerShape=0;return;}
  if(attach)this.peerShape=info.shapeId;
 }
}
