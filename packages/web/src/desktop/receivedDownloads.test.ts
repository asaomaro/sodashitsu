import {expect,it,vi} from "vitest";
import {ReceivedDownloads,RECEIVED_DOWNLOAD_BYTES,RECEIVED_DOWNLOAD_TTL,receivedDownloadName} from "./receivedDownloads.js";
const bytes=(size:number)=>({size})as Blob;
function fixture(){
  let now=1000,sequence=0;
  const changed=vi.fn(),create=vi.fn(()=>`blob:generated-${++sequence}`),revoke=vi.fn();
  const shelf=new ReceivedDownloads(changed,()=>now,create,revoke);shelf.setActive(true);
  return{shelf,changed,create,revoke,advance:(ms:number)=>{now+=ms;}};
}
it("bounds total retained bytes and count without evicting another export",()=>{
  const f=fixture(),ticket=f.shelf.begin();
  f.shelf.add(ticket,"large","large.bin",bytes(RECEIVED_DOWNLOAD_BYTES));
  expect(()=>f.shelf.add(ticket,"over","over.bin",bytes(1))).toThrow("100MiB");
  expect(f.create).toHaveBeenCalledOnce();f.shelf.clear();
  for(let i=0;i<8;i++)f.shelf.add(f.shelf.begin(),String(i),"empty",bytes(0));
  expect(()=>f.shelf.add(f.shelf.begin(),"ninth","empty",bytes(0))).toThrow("8件");
  expect(f.shelf.take("0")).toBeDefined();f.shelf.dispose();
  expect(f.revoke).toHaveBeenCalledTimes(9);
});
it("invalidates old and foreign asynchronous tickets across clear and regrant",()=>{
  const f=fixture(),old=f.shelf.begin();
  f.shelf.setActive(false);f.shelf.setActive(true);
  expect(f.shelf.add(old,"late","late.bin",bytes(1))).toBeUndefined();
  const other=fixture();expect(f.shelf.add(other.shelf.begin(),"foreign","f",bytes(1))).toBeUndefined();
  const cleared=f.shelf.begin();f.shelf.clear();expect(f.shelf.add(cleared,"late","f",bytes(1))).toBeUndefined();
  expect(f.create).not.toHaveBeenCalled();expect(f.changed.mock.calls.at(-1)![0]).toEqual([]);
});
it("checks expiry at the gesture and renews only a live export",()=>{
  const f=fixture();f.shelf.add(f.shelf.begin(),"a","a",bytes(1));
  f.advance(RECEIVED_DOWNLOAD_TTL-1);expect(f.shelf.take("a")).toBeDefined();
  f.advance(RECEIVED_DOWNLOAD_TTL);expect(f.shelf.take("a")).toBeUndefined();
  expect(f.revoke).toHaveBeenCalledOnce();expect(f.changed.mock.calls.at(-1)![0]).toEqual([]);
});
it("uses monotonic time so moving the system clock back does not extend retention",()=>{
  const time=vi.spyOn(performance,"now").mockReturnValue(1000),wall=vi.spyOn(Date,"now").mockReturnValue(1000000);
  const revoke=vi.fn(),shelf=new ReceivedDownloads(()=>{},undefined,()=>"blob:monotonic",revoke);
  try{
    shelf.setActive(true);shelf.add(shelf.begin(),"a","a",bytes(1));
    wall.mockReturnValue(-1000000);time.mockReturnValue(1000+RECEIVED_DOWNLOAD_TTL);
    expect(shelf.take("a")).toBeUndefined();expect(revoke).toHaveBeenCalledOnce();
  }finally{shelf.dispose();time.mockRestore();wall.mockRestore();}
});
it("keeps an existing export on allocation failure and revokes an allocation invalidated in flight",()=>{
  const f=fixture();const first=f.shelf.add(f.shelf.begin(),"a","first",bytes(1));
  f.create.mockImplementationOnce(()=>{throw Error("generated allocation failure");});
  expect(()=>f.shelf.add(f.shelf.begin(),"a","replacement",bytes(2))).toThrow();
  expect(f.shelf.take("a")?.url).toBe(first!.url);expect(f.revoke).not.toHaveBeenCalled();
  f.create.mockImplementationOnce(()=>{f.shelf.setActive(false);return "blob:late";});
  expect(f.shelf.add(f.shelf.begin(),"b","b",bytes(1))).toBeUndefined();
  expect(f.revoke.mock.calls.map(([url])=>url)).toEqual([first!.url,"blob:late"]);
  expect(f.changed.mock.calls.at(-1)![0]).toEqual([]);
});
it("never exports path or colon delimiters and rejects a non-blob allocation",()=>{
  expect(receivedDownloadName("../CON:bad\n.txt")).toBe(".._CON_bad_.txt");
  expect(receivedDownloadName("CON.txt")).toBe("_CON.txt");expect(receivedDownloadName("... ")).toBe("download.bin");
  expect(receivedDownloadName("x".repeat(300)).length).toBeLessThanOrEqual(240);
  const f=fixture();f.create.mockReturnValueOnce("https://untrusted.invalid/file?token=secret");
  expect(()=>f.shelf.add(f.shelf.begin(),"a","a",bytes(1))).toThrow("URL");
  expect(f.changed.mock.calls.at(-1)![0]).toEqual([]);expect(f.revoke).toHaveBeenCalledOnce();
});
