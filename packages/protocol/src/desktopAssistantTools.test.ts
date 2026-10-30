import { expect, it } from "vitest";
import { DesktopAssistantPreferences } from "./desktopAssistant.js";
import {AssistantAudioBeginParams,AssistantAudioChunkParams} from "./desktopAssistant.js";

it("bounds explicit audio transfer metadata without accepting a client path or arbitrary commands",()=>{
 const value={deviceId:"00000000-0000-4000-8000-000000000001",instanceId:"00000000-0000-4000-8000-000000000002",mime:"audio/wav",size:1,ttlMs:1000};
 expect(AssistantAudioBeginParams.safeParse(value).success).toBe(true);
 for(const invalid of [{...value,path:"/arbitrary"},{...value,ttlMs:0},{...value,ttlMs:300001},{...value,size:25*1024*1024+1},{...value,mime:"text/plain"}])expect(AssistantAudioBeginParams.safeParse(invalid).success).toBe(false);
 expect(AssistantAudioChunkParams.safeParse({uploadId:value.deviceId,offset:0,data:"A==="}).success).toBe(false);
});

it("keeps audio disabled, defaults to the dedicated agent and constrains the optional local endpoint", () => {
  expect(DesktopAssistantPreferences.parse({})).toMatchObject({
    transcriptionEnabled: false,
    transcriptionProvider:"agent",
    transcriptionOrigin: "http://127.0.0.1:8080",
  });
  expect(
    DesktopAssistantPreferences.parse({
      transcriptionEnabled: true,
      transcriptionOrigin: "http://localhost:8081/",
    }),
  ).toMatchObject({ transcriptionEnabled: true, transcriptionOrigin: "http://localhost:8081" });
  for (const transcriptionOrigin of [
    "https://example.test",
    "http://192.168.1.1:8080",
    "http://localhost/inference",
    "http://user:secret@localhost",
    "http://localhost?token=private",
  ])
    expect(() =>
      DesktopAssistantPreferences.parse({ transcriptionEnabled: true, transcriptionOrigin }),
    ).toThrow();
});

it("keeps OCR disabled and accepts only bounded local paths and language lists", () => {
  expect(DesktopAssistantPreferences.parse({})).toMatchObject({
    ocrEnabled: false,
    ocrExecutable: "",
    ocrLanguage: "jpn+eng",
  });
  for (const ocrExecutable of [
    "/usr/bin/tesseract",
    "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
  ])
    expect(DesktopAssistantPreferences.parse({ ocrExecutable })).toMatchObject({ ocrExecutable });
  for (const ocrExecutable of [
    "tesseract",
    "https://example.com/tesseract",
    "/bin/tesseract\n--help",
    "/bin/tes\u0000seract",
  ])
    expect(() => DesktopAssistantPreferences.parse({ ocrExecutable })).toThrow();
  for (const ocrLanguage of ["jpn --psm 1", "eng/../../tmp", "a".repeat(68)])
    expect(() => DesktopAssistantPreferences.parse({ ocrLanguage })).toThrow();
});
