import { afterEach, expect, it, vi } from "vitest";
import type { LinkChannel } from "../machine/MachineLink.js";
import { DesktopBridgeRpc } from "./bridgeRpc.js";
afterEach(() => vi.useRealTimers());
function fixture() {
  let receive!: (s:string) => void;
  const channel = {sendText:vi.fn(),onText:(cb:typeof receive)=>{receive=cb;},onClose:vi.fn(),close:vi.fn()} as unknown as LinkChannel;
  const rpc = new DesktopBridgeRpc(channel, vi.fn(), {closeOnTimeout:false,label:"Webプレビュー"});
  const reply = (result:unknown) => { const call = vi.mocked(channel.sendText).mock.calls.at(-1)!; receive(JSON.stringify({id:JSON.parse(call[0]).id,result})); };
  return {rpc,channel,reply};
}
it("keeps an idle preview read alive past ten seconds and honors its 35s timeout", async () => {
  vi.useFakeTimers(); const {rpc,channel,reply} = fixture();
  let settled = false;
  const reading = rpc.request("preview.http.read", {streamId:crypto.randomUUID()}, {timeoutMs:35000});
  void reading.then(()=>{settled=true;},()=>{settled=true;});
  await vi.advanceTimersByTimeAsync(12000);
  expect(settled).toBe(false); expect(channel.close).not.toHaveBeenCalled();
  reply({kind:"wait"}); expect(await reading).toEqual({kind:"wait"}); rpc.close();
});
it("times out only the stalled preview request and leaves other streams usable", async () => {
  vi.useFakeTimers(); const {rpc,channel,reply} = fixture();
  const reading = rpc.request("preview.http.read", {streamId:crypto.randomUUID()}, {timeoutMs:35000});
  const rejected = expect(reading).rejects.toThrow("時間切れ");
  await vi.advanceTimersByTimeAsync(35001); await rejected;
  expect(channel.close).not.toHaveBeenCalled();
  const next = rpc.request("preview.work", {}); reply({active:[],jobs:[]});
  await expect(next).resolves.toEqual({active:[],jobs:[]}); rpc.close();
});
