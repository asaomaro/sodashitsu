/** Resolution follows sustained pixel-processing cost or loss/queue, never raw WAN RTT. */
export class DesktopNativeResolution {
 private level=0;private since=0;private hot=0;private cool=0;
 private cost=0;private congestion=false;private samples=0;
 constructor(private max:{width:number;height:number;fps:number}){}
 sample(cost:number,now:number,congested=false){
  this.cost=Math.max(this.cost,cost);this.congestion||=congested;this.samples++;
  if(this.samples<8||now-this.since<2000)return;
  const expensive=this.cost>1000/this.max.fps*1.5||this.congestion,cheap=this.cost<1000/this.max.fps*.65&&!this.congestion;
  this.since=now;this.cost=0;this.congestion=false;this.samples=0;
  this.hot=expensive?this.hot+1:0;this.cool=cheap?this.cool+1:0;
  const old=this.level;
  if(this.hot>=3&&this.level<2){this.level++;this.hot=this.cool=0;}
  else if(this.cool>=8&&this.level>0){this.level--;this.hot=this.cool=0;}
  if(old===this.level)return;
  const scale=[1,.75,.5][this.level]!,minWidth=Math.min(640,this.max.width);
  const width=Math.max(minWidth,Math.floor(this.max.width*scale/2)*2),height=Math.max(2,Math.round(this.max.height*width/this.max.width/2)*2);
  return {width,height};
 }
}
