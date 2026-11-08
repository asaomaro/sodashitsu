// Runs ONLY in the standalone private fixture server process. No production inspector/injection.
// Observes original method returns/getters, never changes argument/return/permission behavior.
export function observeResourceEpochs(Channel,clock=()=>Date.now()){
 const original=Channel.prototype.begin,states=new Map();let retired=false,overflow=false;
 function begin(...args){const result=Reflect.apply(original,this,args);if(!retired&&result===true&&args[1]==='microphone'){
  if(!states.has(this)&&states.size>=4)overflow=true;
  else{const [epoch]=args;if(!states.has(this)){const state={channel:this,epoch,observedAt:clock(),closedAt:null};states.set(this,state);this.once('close',()=>{state.closedAt=clock();});}else if(states.get(this).epoch!==epoch)overflow=true;}
 }return result;}
 Channel.prototype.begin=begin;
 return{sample(){const values=[...states.values()].map(s=>({observedAt:s.observedAt,invalidated:s.channel.clean(s.epoch)||!s.channel.supported,terminalAck:s.channel.clean(s.epoch),physicalChannelClosed:s.closedAt!==null,closedAt:s.closedAt}));return{ok:!overflow&&values.length===1,epochBasis:'resource-grant',nativeDesktopEpochKnown:false,epochs:values};},close(){retired=true;if(Channel.prototype.begin===begin)Channel.prototype.begin=original;states.clear();}};
}
