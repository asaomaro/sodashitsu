import type {DesktopCursorInfo,DesktopCursorPacket} from "@sodashitsu/protocol";
type Shape=NonNullable<DesktopCursorInfo["shape"]>;
/** Windows pointer operators: straight/premultiplied alpha, and AND/XOR masks. */
export function compositeCursorPixel(shape:Shape,bytes:Uint8Array,x:number,y:number,target:Uint8ClampedArray,offset:number){
 let and=0,xor=0,index=y*shape.pitch+x*4;
 if(shape.kind===1){const bit=7-(x&7);and=((bytes[y*shape.pitch+(x>>3)]!>>bit)&1)*255;xor=((bytes[(y+shape.height)*shape.pitch+(x>>3)]!>>bit)&1)*255;}
 for(let channel=0;channel<3;channel++){
  const old=target[offset+channel]!;
  if(shape.kind===1)target[offset+channel]=(old&and)^xor;
  else if(shape.kind===4)target[offset+channel]=(old&(bytes[index+3]===255?255:0))^bytes[index+2-channel]!;
  else {
   const alpha=bytes[index+3]!,color=bytes[index+2-channel]!;
   target[offset+channel]=alpha===0?old:shape.premultiplied?color+Math.round(old*(255-alpha)/255):Math.round((color*alpha+old*(255-alpha))/255);
  }
 }
 target[offset+3]=255;
}
// Ordinary alpha/transparent cursors need no readback from the video canvas.
function cursorImage(shape:Shape,bytes:Uint8Array):HTMLCanvasElement|undefined {
 const image=new ImageData(shape.width,shape.height);
 for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++){
  const p=(y*shape.width+x)*4,i=y*shape.pitch+x*4;
  if(shape.kind===2){const a=bytes[i+3]!;image.data[p+3]=a;for(let c=0;c<3;c++)image.data[p+c]=a===0?0:shape.premultiplied?Math.round(bytes[i+2-c]!*255/a):bytes[i+2-c]!;}
  else if(shape.kind===4){if(bytes[i+3]===255){if(bytes[i]||bytes[i+1]||bytes[i+2])return;image.data[p+3]=0;}else{image.data[p+3]=255;for(let c=0;c<3;c++)image.data[p+c]=bytes[i+2-c]!;}}
  else {const bit=7-(x&7),and=(bytes[y*shape.pitch+(x>>3)]!>>bit)&1,xor=(bytes[(y+shape.height)*shape.pitch+(x>>3)]!>>bit)&1;if(and&&xor)return;image.data[p+3]=and?0:255;for(let c=0;c<3;c++)image.data[p+c]=xor?255:0;}
 }
 const canvas=document.createElement("canvas");canvas.width=shape.width;canvas.height=shape.height;canvas.getContext("2d")?.putImageData(image,0,0);return canvas;
}

/** Cursor painting stays out of the screenshot/video canvas and agent image hashes. */
export class DesktopCursorRenderer {
 private pose:DesktopCursorInfo|undefined;
 private shape:DesktopCursorPacket|undefined;
 private last=0;
 private image:HTMLCanvasElement|undefined;
 private box:{x:number;y:number;width:number;height:number}|undefined;
 private predicted:{x:number;y:number;at:number}|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private source:()=>HTMLCanvasElement|null|undefined,private overlay:()=>HTMLCanvasElement|null|undefined,private width:number,private height:number,private controlled:()=>boolean){}
 accept(packet:DesktopCursorPacket){
  if(packet.info.seq<=this.last)return;this.last=packet.info.seq;this.pose=packet.info;
  if(packet.info.shape){this.shape={info:packet.info,data:packet.data.slice()};this.image=cursorImage(packet.info.shape,packet.data);}
  this.paint();
 }
 local(x:number,y:number){
  this.predicted={x:Math.max(0,Math.min((this.width-1)/this.width,x)),y:Math.max(0,Math.min((this.height-1)/this.height,y)),at:performance.now()};
  clearTimeout(this.timer);this.timer=setTimeout(()=>this.paint(),251);this.paint();
 }
 clearPrediction(){this.predicted=undefined;clearTimeout(this.timer);this.paint();}
 paint(){
  const base=this.source(),overlay=this.overlay(),pose=this.pose,current=this.shape;
  if(!base||!overlay)return;
  if(overlay.width!==base.width||overlay.height!==base.height){overlay.width=base.width;overlay.height=base.height;this.box=undefined;}
  const ctx=overlay.getContext("2d");if(!ctx)return;
  if(this.box){ctx.clearRect(this.box.x,this.box.y,this.box.width,this.box.height);this.box=undefined;}
  overlay.dataset.cursorSeq=String(this.last);
  if(!pose?.visible||!current?.info.shape||current.info.shapeId!==pose.shapeId||!base.width||!base.height)return;
  const shape=current.info.shape,prediction=this.controlled()&&this.predicted&&performance.now()-this.predicted.at<250?this.predicted:pose;
  const sx=base.width/this.width,sy=base.height/this.height;
  const left=Math.floor(prediction.x*base.width-shape.hotspotX*sx),top=Math.floor(prediction.y*base.height-shape.hotspotY*sy);
  const x=Math.max(0,left),y=Math.max(0,top),right=Math.min(base.width,left+Math.ceil(shape.width*sx)),bottom=Math.min(base.height,top+Math.ceil(shape.height*sy));
  if(right<=x||bottom<=y)return;
  if(this.image){ctx.drawImage(this.image,left,top,Math.ceil(shape.width*sx),Math.ceil(shape.height*sy));this.box={x,y,width:right-x,height:bottom-y};overlay.dataset.cursorX=String(prediction.x);overlay.dataset.cursorY=String(prediction.y);return;}
  const pixels=base.getContext("2d")?.getImageData(x,y,right-x,bottom-y);if(!pixels)return;
  for(let row=0;row<pixels.height;row++)for(let col=0;col<pixels.width;col++){
   const cx=Math.min(shape.width-1,Math.floor((x+col-left)/sx)),cy=Math.min(shape.height-1,Math.floor((y+row-top)/sy));
   compositeCursorPixel(shape,current.data,cx,cy,pixels.data,(row*pixels.width+col)*4);
  }
  ctx.putImageData(pixels,x,y);this.box={x,y,width:pixels.width,height:pixels.height};
  overlay.dataset.cursorX=String(prediction.x);overlay.dataset.cursorY=String(prediction.y);
 }
 stop(){clearTimeout(this.timer);this.pose=this.shape=undefined;this.image=undefined;this.predicted=undefined;const overlay=this.overlay();overlay?.getContext("2d")?.clearRect(0,0,overlay.width,overlay.height);}
}
