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
 expect(Buffer.from(fetcher.mock.calls[1]![1].body).toString()).toBe(q);expect(play).toHaveBeenCalledWith(new Uint8Array(wav),controller.signal);
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
