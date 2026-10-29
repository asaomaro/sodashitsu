import {DesktopAudioPipeBinary} from "@sodashitsu/client-core/desktop/DesktopAudioPipeBinary.node";
import {DesktopAudioPipe,type DesktopAudioPipeKind} from "@sodashitsu/client-core/desktop/DesktopAudioPipe.node";
/** One prepared fixed executable per provider generation, retained through actual child close. */
export class DesktopAudioPipes {
 private binary=new DesktopAudioPipeBinary();private pipes=new Set<DesktopAudioPipe>();private stopped=false;private prepared=false;
 async prepare(){try{await this.binary.prepare();if(this.stopped)return false;this.prepared=true;return true;}catch{return false;}}
 open(kind:DesktopAudioPipeKind,allowed:()=>boolean){
  if(this.stopped||!this.prepared||this.pipes.size>=16||!allowed()||this.stopped||!this.prepared||this.pipes.size>=16)throw Error("音声中継を利用できません");
  const pipe=new DesktopAudioPipe(this.binary,kind,()=>!this.stopped&&allowed());this.pipes.add(pipe);void pipe.childClosed.then(()=>this.pipes.delete(pipe));return pipe;
 }
 async close(){if(this.stopped)return;this.stopped=true;const pipes=[...this.pipes];for(const pipe of pipes)pipe.destroy();await Promise.all(pipes.map(pipe=>pipe.childClosed));await this.binary.close();}
}
export function desktopWslAudioCommand(command:readonly string[]){return process.platform==="linux"&&!!process.env.WSL_DISTRO_NAME&&/^(?:.*[\\/])?powershell\.exe$/i.test(command[0]??"");}
