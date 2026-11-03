import {afterEach,expect,it,vi} from "vitest";
import {voicevoxOrigin,voicevoxSpeakers,synthesizeVoicevox,voicevoxSpeak} from "./voicevox.js";
afterEach(()=>vi.unstubAllGlobals());
it("allows only explicit local HTTP origins and rejects credentials, paths and redirects",()=>{
 expect(voicevoxOrigin("http://localhost:50022")).toBe("http://localhost:50022");
 for(const value of ["https://localhost:50022","http://example.com","http://localhost/x","http://u:p@localhost","http://localhost/?x=1"])expect(()=>voicevoxOrigin(value)).toThrow();
});
it("fetches talk style labels as text, including current CORE streaming talk styles",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify([{name:"東北きりたん",styles:[{name:"ノーマル",id:108,type:"streaming_talk"},{name:"歌",id:109,type:"sing"}]}]))));
 expect(await voicevoxSpeakers("http://127.0.0.1:50022")).toEqual([{id:108,label:"東北きりたん（ノーマル）"}]);
});
it("passes ENGINE AudioQuery verbatim and plays a validated WAV after synthesis",async()=>{
 const wav=Buffer.alloc(44);wav.write("RIFF");wav.write("WAVE",8);
 const q=JSON.stringify({accent_phrases:[],speedScale:1});
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(q)).mockResolvedValueOnce(new Response(wav));vi.stubGlobal("fetch",fetcher);
 const play=vi.fn(async()=>{}),controller=new AbortController();
 await voicevoxSpeak(()=>({voicevoxOrigin:"http://127.0.0.1:50022",voicevoxStyleId:108}),play)("きりたん",controller.signal);
 expect(fetcher.mock.calls[0]![0]).toContain("speaker=108");expect(fetcher.mock.calls[1]![1]).toMatchObject({redirect:"error",method:"POST"});
 expect(Buffer.from(fetcher.mock.calls[1]![1].body).toString()).toBe(q);expect(play).toHaveBeenCalledWith(new Uint8Array(wav),controller.signal,undefined,undefined,undefined);
});
it("rejects malformed synthesis and bounds responses",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response("{}")).mockResolvedValueOnce(new Response("not a wav")));
 await expect(synthesizeVoicevox("http://127.0.0.1:50022",2,"a",new AbortController().signal)).rejects.toThrow("WAV");
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(" ".repeat(1024*1024+1))));
 await expect(voicevoxSpeakers("http://127.0.0.1:50022")).rejects.toThrow("大きすぎ");
});
it("matches character metadata, changes away from a previous character and preserves a matching manual style",async()=>{
 const {characterVoice}=await import("./voicevox.js");
 const rows=[{id:108,label:"東北きりたん（ノーマル）"},{id:8,label:"春日部つむぎ（ノーマル）"},{id:999,label:"春日部つむぎ（別スタイル）"}];
 expect(characterVoice(rows,"春日部 つむぎ",108)?.id).toBe(8);
 expect(characterVoice(rows,"春日部つむぎ",999)?.id).toBe(999);
 expect(characterVoice(rows,"船長",108)).toBeNull();
});

it("waits for the Windows player to load instead of announcing at process spawn", async () => {
 const {EventEmitter}=await import("node:events");const {playWav}=await import("./voicevox.js");
 let done!:(error:null)=>void;const stdout=new EventEmitter();
 const child=Object.assign(new EventEmitter(),{stdout,stdin:{on:vi.fn(),end:vi.fn()}});
 const run=vi.fn((_cmd:unknown,_args:unknown,_opts:unknown,callback:(error:null)=>void)=>{done=callback;return child});
 const started=vi.fn(),result=playWav(new Uint8Array(44),new AbortController().signal,"win32",run as never,started);
 child.emit("spawn");expect(started).not.toHaveBeenCalled();
 stdout.emit("data","SODA_VOICE_READY\r\n");expect(started).toHaveBeenCalledOnce();done(null);await result;
});
it("does not announce while VOICEVOX synthesis is still pending",async()=>{
 const wav=Buffer.alloc(44);wav.write("RIFF");wav.write("WAVE",8);
 let release!:(response:Response)=>void;
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response("{}")).mockImplementationOnce(()=>new Promise<Response>(resolve=>release=resolve)));
 const started=vi.fn(),play=vi.fn(async(_wav:Uint8Array,_signal:AbortSignal,_platform:unknown,_run:unknown,ready?:()=>void)=>ready?.());
 const result=voicevoxSpeak(()=>({voicevoxOrigin:"http://127.0.0.1:50022",voicevoxStyleId:108}),play as never)("通知",new AbortController().signal,started);
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));expect(started).not.toHaveBeenCalled();expect(play).not.toHaveBeenCalled();
 release(new Response(wav));await result;expect(started).toHaveBeenCalledOnce();
});
