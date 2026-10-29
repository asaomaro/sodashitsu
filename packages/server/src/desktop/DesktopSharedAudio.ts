import { performance } from "node:perf_hooks";
import { DesktopNativeAudio, type DesktopNativeAudioHooks, type DesktopAudioLease } from "./DesktopNativeAudio.js";
/** One PCM capture/Opus encoder; transport credit and sound state stay per viewer. */
export class DesktopSharedAudio<T extends object> {
  private consumers = new Map<T, { hooks: DesktopNativeAudioHooks; joined: number }>();
  private source: DesktopAudioLease | undefined;
  private dead = false;
  private state:Parameters<DesktopNativeAudioHooks["state"]>[0]="starting";
  constructor(private hooks: {
    id: string; synthetic: boolean; timestamp(): number; active(): boolean;
    write(value: unknown): void;
    create?(hooks: DesktopNativeAudioHooks): DesktopAudioLease;
    now?(): number;
  }) {}
  attach(member: T, hooks: DesktopNativeAudioHooks): DesktopAudioLease {
    this.detach(member);
    if(this.dead || !this.hooks.active() || !hooks.active()) { hooks.state("unavailable"); return {stop(){}}; }
    this.consumers.set(member,{hooks,joined:this.now()});
    if(!this.source)this.state="starting";
    hooks.state(this.state);
    if(!this.source) {
      const sourceHooks:DesktopNativeAudioHooks={...(hooks.bridge?{bridge:hooks.bridge}:{}),id:this.hooks.id,synthetic:this.hooks.synthetic,
        active:()=>!this.dead&&this.hooks.active()&&this.consumers.size>0,
        videoTimestamp:()=>this.hooks.timestamp(),write:value=>this.hooks.write(value),
        state:state=>{
          this.state=state;const consumers=[...this.consumers];
          if(state==="unavailable"||state==="stopped"){this.consumers.clear();this.source=undefined;}
          for(const [member,c] of consumers)if(c.hooks.active())c.hooks.state(state);else this.detach(member);
        },
        send:(bytes,receivedAt)=>{
          for(const [member,c] of [...this.consumers]) {
            if(!c.hooks.active()){this.detach(member);continue;}
            // Never replay PCM already queued before this subscription existed.
            if(receivedAt!==undefined&&receivedAt<c.joined)continue;
            c.hooks.send(bytes,receivedAt);
          }
          return !this.dead&&this.consumers.size>0;
        }};
      const source=(this.hooks.create??(hooks=>new DesktopNativeAudio(hooks)))(sourceHooks);
      if(this.dead||!this.consumers.size)source.stop(false);else this.source=source;
    }
    let stopped=false;
    return {stop:(notify=true)=>{if(stopped)return;stopped=true;if(this.consumers.get(member)?.hooks!==hooks)return;this.detach(member);if(notify)hooks.state("stopped");}};
  }
  private now(){return this.hooks.now?.()??performance.now();}
  detach(member:T) {
    if(!this.consumers.delete(member)||this.consumers.size)return;
    const source=this.source;this.source=undefined;source?.stop(false);
  }
  dispose() {
    if(this.dead)return;this.dead=true;
    const consumers=[...this.consumers.values()];this.consumers.clear();
    const source=this.source;this.source=undefined;source?.stop(false);
    for(const c of consumers)if(c.hooks.active())c.hooks.state("unavailable");
  }
}
