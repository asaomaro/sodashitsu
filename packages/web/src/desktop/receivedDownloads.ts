export const RECEIVED_DOWNLOAD_BYTES=100*1024*1024;
export const RECEIVED_DOWNLOAD_COUNT=8;
export const RECEIVED_DOWNLOAD_TTL=5*60*1000;
export type ReceivedDownload={key:string;name:string;url:string;bytes:number;expires:number};

/** A download suggestion, never a filesystem path or a DownloadURL delimiter. */
export function receivedDownloadName(raw:string):string {
  let name=raw.normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f\x7f]/gu,"_").slice(0,240).replace(/[\uD800-\uDFFF]/gu,"_").replace(/[. ]+$/u,"");
  if(!name||name==="."||name==="..")name="download.bin";
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name))name="_"+name;
  return name;
}

/** Window-local verified blobs only. Tickets invalidate asynchronous completions. */
export class ReceivedDownloads {
  private entries=new Map<string,ReceivedDownload>();
  private ticket:object|undefined;
  constructor(private readonly changed:(entries:ReceivedDownload[])=>void,
    private readonly now=()=>performance.now(),
    private readonly create=(blob:Blob)=>URL.createObjectURL(blob),
    private readonly revoke=(url:string)=>URL.revokeObjectURL(url)){}
  setActive(active:boolean):void {
    if(active===!!this.ticket)return;
    this.ticket=active?{}:undefined;this.clear();
  }
  begin():object|undefined{return this.ticket;}
  private valid(ticket:object|undefined){return !!ticket&&ticket===this.ticket;}
  private emit(){this.changed([...this.entries.values()].map(e=>({...e})));}
  private release(url:string){try{this.revoke(url);}catch{/* Drop references even if URL cleanup is unavailable. */}}
  clear():void {
    if(this.ticket)this.ticket={};
    const old=[...this.entries.values()];this.entries.clear();
    for(const entry of old)this.release(entry.url);this.emit();
  }
  dispose():void{this.setActive(false);this.clear();}
  prune():void {
    let changed=false;
    for(const [key,entry]of this.entries)if(entry.expires<=this.now()){
      this.entries.delete(key);this.release(entry.url);changed=true;
    }
    if(changed)this.emit();
  }
  remove(key:string):void {
    const entry=this.entries.get(key);if(!entry)return;
    this.entries.delete(key);this.release(entry.url);this.emit();
  }
  add(ticket:object|undefined,key:string,name:string,blob:Blob):ReceivedDownload|undefined {
    if(!this.valid(ticket))return;
    this.prune();
    const capacity=()=>{
      const rest=[...this.entries.values()].filter(e=>e.key!==key);
      return rest.length<RECEIVED_DOWNLOAD_COUNT&&rest.reduce((total,e)=>total+e.bytes,0)+blob.size<=RECEIVED_DOWNLOAD_BYTES;
    };
    if(!capacity())throw Error("取り出し用の保持は8件・合計100MiBまでです。不要な項目を解放してください。");
    const url=this.create(blob);
    if(!this.valid(ticket)||!capacity()) {this.release(url);return;}
    if(!url.startsWith("blob:")||/[\r\n]/u.test(url)){this.release(url);throw Error("一時ファイルURLを作成できません。");}
    const old=this.entries.get(key),entry={key,name:receivedDownloadName(name),url,bytes:blob.size,expires:this.now()+RECEIVED_DOWNLOAD_TTL};
    this.entries.set(key,entry);if(old)this.release(old.url);this.emit();return entry;
  }
  /** Check at the user gesture, rather than trusting an earlier rendered link. */
  take(key:string):ReceivedDownload|undefined {
    if(!this.ticket)return;this.prune();const entry=this.entries.get(key);if(!entry)return;
    entry.expires=this.now()+RECEIVED_DOWNLOAD_TTL;this.emit();return {...entry};
  }
}
