import { expect, it } from "vitest";
import { RemoteDesktopViewerMessage } from "./desktop.js";
import {
  DesktopClipboardRequest,
  DesktopMediaStream, DesktopCompanionMessage, encodeDesktopH264Packet, decodeDesktopH264Packet,
  DesktopIceServers,
  decodeDesktopMediaChunk,
  encodeDesktopMediaChunk,
} from "./desktopMedia.js";
it("bounds compressed media chunks and preserves generation and sequence", () => {
  const packet = encodeDesktopMediaChunk(2, 5, new Uint8Array([1, 2, 3]));
  expect(decodeDesktopMediaChunk(packet)).toEqual({
    generation: 2,
    seq: 5,
    data: new Uint8Array([1, 2, 3]),
  });
  expect(() => decodeDesktopMediaChunk(packet.subarray(0, 12))).toThrow();
  expect(() => encodeDesktopMediaChunk(0, 1, new Uint8Array([1]))).toThrow();
  expect(() => encodeDesktopMediaChunk(1, 1, new Uint8Array(512 * 1024 + 1))).toThrow();
});
it("accepts only bounded clipboard operations and typed signaling", () => {
  expect(
    DesktopClipboardRequest.safeParse({
      type: "clipboard",
      id: 1,
      operation: "write",
      text: "日本語\n😀",
    }).success,
  ).toBe(true);
  expect(
    DesktopClipboardRequest.safeParse({
      type: "clipboard",
      id: 1,
      operation: "read",
      text: "unexpected",
    }).success,
  ).toBe(false);
  expect(
    DesktopClipboardRequest.safeParse({
      type: "clipboard",
      id: 1,
      operation: "write",
      text: "x".repeat(8193),
    }).success,
  ).toBe(false);
  expect(DesktopIceServers.safeParse([{ urls: "https://bad.example" }]).success).toBe(false);
  expect(
    RemoteDesktopViewerMessage.safeParse({
      type: "rtc_signal",
      id: crypto.randomUUID(),
      signal: { kind: "offer", sdp: "x".repeat(24577) },
    }).success,
  ).toBe(false);
});

it("bounds H264 access units, timestamps and codec descriptors separately from browser companion streams",()=>{
 const bytes=encodeDesktopH264Packet(123,true,new Uint8Array([0,0,1,0x65]));expect(decodeDesktopH264Packet(bytes)).toEqual({timestamp:123,key:true,data:new Uint8Array([0,0,1,0x65])});
 const bad=bytes.slice();bad[0]=2;expect(()=>decodeDesktopH264Packet(bad)).toThrow();
 const nan=bytes.slice();new DataView(nan.buffer).setFloat64(1,NaN);expect(()=>decodeDesktopH264Packet(nan)).toThrow();
 expect(()=>encodeDesktopH264Packet(-1,false,new Uint8Array([1]))).toThrow();expect(()=>encodeDesktopH264Packet(0,false,new Uint8Array(512*1024))).toThrow();
 const stream={type:"media_stream",id:crypto.randomUUID(),generation:1,mime:"video/h264",codec:"avc1.42041f",width:640,height:360};
 expect(DesktopMediaStream.safeParse(stream).success).toBe(true);expect(DesktopCompanionMessage.safeParse(stream).success).toBe(false);
 expect(DesktopMediaStream.safeParse({...stream,codec:"unbounded"}).success).toBe(false);
 expect(DesktopMediaStream.safeParse({...stream,width:4096,height:2400}).success).toBe(false);
});
