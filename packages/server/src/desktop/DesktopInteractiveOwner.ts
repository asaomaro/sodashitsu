export type DesktopInteractiveResource = "control" | "clipboard" | "microphone";
const kinds: DesktopInteractiveResource[] = ["control", "clipboard", "microphone"];
/** PC-wide resource exclusion. Handoff waits for the old source's ordinary
 * stop-command completion, or its physical close; other sources keep running. */
export class DesktopInteractiveOwner<Member, Source> {
  private owners = new Map<DesktopInteractiveResource, {member:Member;source:Source;releasing?:Promise<void>}>();
  constructor(private completed:(source:Source,resource:DesktopInteractiveResource)=>Promise<void>) {}
  acquire(member:Member,source:Source,resource:DesktopInteractiveResource):boolean {
    const owner=this.owners.get(resource);
    if(owner)return owner.member===member&&owner.source===source&&!owner.releasing;
    this.owners.set(resource,{member,source});return true;
  }
  owns(member:Member,resource:DesktopInteractiveResource):boolean {
    const owner=this.owners.get(resource);return owner?.member===member&&!owner.releasing;
  }
  identity(member:Member,resource:DesktopInteractiveResource):{source:Source}|undefined {
    const owner=this.owners.get(resource);return owner?.member===member&&!owner.releasing?{source:owner.source}:undefined;
  }
  releasing(member:Member,resource:DesktopInteractiveResource):Promise<void>|undefined {
    const owner=this.owners.get(resource);return owner?.member===member?owner.releasing:undefined;
  }
  release(member:Member,resource:DesktopInteractiveResource,completed?:Promise<void>):Promise<void> {
    const owner=this.owners.get(resource);
    if(owner?.member!==member)return Promise.resolve();
    if(owner.releasing)return owner.releasing;
    const completion=completed??this.completed(owner.source,resource);owner.releasing=completion;
    void completion.then(()=>{if(this.owners.get(resource)===owner)this.owners.delete(resource);},()=>{});
    return completion;
  }
  releaseAll(member:Member):void {for(const resource of kinds)void this.release(member,resource);}
  sourceGone(source:Source):void {for(const[resource,owner]of this.owners)if(owner.source===source)this.owners.delete(resource);}
  dispose():void {this.owners.clear();}
}
