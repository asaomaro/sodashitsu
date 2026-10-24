import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
const spawn = vi.hoisted(()=>vi.fn());
vi.mock("node:child_process",()=>({spawn}));
import { DesktopUnlockLease } from "./DesktopUnlockLease.js";
afterEach(()=>{vi.useRealTimers();spawn.mockReset();});
function child() {
  const c = Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});
  spawn.mockReturnValueOnce(c);return c;
}
it("keeps a heartbeat only while the server owns its lease and closes stdin on shutdown",()=>{
  vi.useFakeTimers();const c=child(), lease=new DesktopUnlockLease();let input="";
  c.stdin.on("data",data=>{input+=String(data);});
  lease.start(["trusted-helper","-UnlockLease"]);
  vi.advanceTimersByTime(2100);
  expect(input).toBe("heartbeat\nheartbeat\nheartbeat\n");
  lease.stop();expect(c.stdin.writableEnded).toBe(true);
  const before=input;vi.advanceTimersByTime(2000);
  expect(input).toBe(before);expect(c.kill).toHaveBeenCalledOnce();
});
it("an error from a retired child cannot stop the new lease",()=>{
  vi.useFakeTimers();const old=child(), next=child(), lease=new DesktopUnlockLease();
  lease.start(["helper"]);lease.start(["helper"]);
  old.stdin.emit("error",new Error("retired"));
  expect(next.stdin.writableEnded).toBe(false);
  next.emit("close");lease.stop();
});
it("restarts an unexpectedly closed lease with backoff, without opening a share or sending input",()=>{
  vi.useFakeTimers();const first=child(),next=child(),lease=new DesktopUnlockLease();let input="";
  next.stdin.on("data",data=>{input+=String(data);});
  lease.start(["trusted-helper","-UnlockLease"]);
  first.emit("close",0);vi.advanceTimersByTime(999);expect(spawn).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);expect(spawn).toHaveBeenCalledTimes(2);
  expect(spawn.mock.calls[1]!.slice(0,2)).toEqual(["trusted-helper",["-UnlockLease"]]);
  expect(input).toBe("heartbeat\n");lease.ensureRunning();expect(spawn).toHaveBeenCalledTimes(2);
  lease.stop();next.emit("close",0);vi.advanceTimersByTime(60000);expect(spawn).toHaveBeenCalledTimes(2);
  lease.ensureRunning();expect(spawn).toHaveBeenCalledTimes(2);
});
it("bounds background retries and lets an explicit share retry after exhaustion",()=>{
  vi.useFakeTimers();const children:ReturnType<typeof child>[]=[];
  spawn.mockImplementation(()=>{const c=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});children.push(c);return c;});
  const lease=new DesktopUnlockLease();lease.start(["helper","-UnlockLease"]);
  for(let i=0;i<6;i++){
    children[i]!.emit("close",1);
    vi.advanceTimersByTime(i<5?1000*2**i:60000);
  }
  expect(spawn).toHaveBeenCalledTimes(6);
  lease.ensureRunning();expect(spawn).toHaveBeenCalledTimes(7);
  children[6]!.emit("close",1);lease.stop();vi.advanceTimersByTime(60000);
  expect(spawn).toHaveBeenCalledTimes(7);
});
it("recovers a broken heartbeat pipe and ignores retired child close/error events",()=>{
  vi.useFakeTimers();const first=child(),next=child(),lease=new DesktopUnlockLease();
  lease.start(["helper"]);first.stdin.emit("error",new Error("pipe ended"));
  expect(first.stdin.writableEnded).toBe(true);
  vi.advanceTimersByTime(1000);expect(spawn).toHaveBeenCalledTimes(2);
  first.emit("close",1);first.emit("error",new Error("late failure"));
  expect(next.stdin.writableEnded).toBe(false);
  lease.stop();vi.advanceTimersByTime(60000);expect(spawn).toHaveBeenCalledTimes(2);
});
it("cancels a pending retry when permissions are replaced",()=>{
  vi.useFakeTimers();const first=child(),replacement=child(),lease=new DesktopUnlockLease();
  lease.start(["old-helper"]);first.emit("close",1);
  lease.start(["new-helper"]);vi.advanceTimersByTime(2000);
  expect(spawn).toHaveBeenCalledTimes(2);expect(spawn.mock.calls[1]![0]).toBe("new-helper");
  expect(replacement.stdin.writableEnded).toBe(false);lease.stop();
});
it("resets backoff after a healthy interval and retries a synchronous spawn failure",()=>{
  vi.useFakeTimers();const next=child(),last=child(),lease=new DesktopUnlockLease();
  // Place a failing call before the queued successful children.
  spawn.mockReset();
  spawn.mockImplementationOnce(()=>{throw new Error("launch failed");}).mockReturnValueOnce(next).mockReturnValueOnce(last);
  lease.start(["helper"]);vi.advanceTimersByTime(1000);expect(spawn).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(30000);next.emit("close",1);
  vi.advanceTimersByTime(999);expect(spawn).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1);expect(spawn).toHaveBeenCalledTimes(3);lease.stop();
});
