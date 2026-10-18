(window as unknown as {happyDOM:{settings:{disableIframePageLoading:boolean}}}).happyDOM.settings.disableIframePageLoading = true;
import { afterEach, expect, it, vi } from "vitest";
import { readLocalHelperProof } from "./helperProbe.js";
const probe={id:crypto.randomUUID(),origin:"http://p00000000000000000000000000000000.localhost:1234",url:"http://p00000000000000000000000000000000.localhost:1234/probe"};
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren();});
it("only accepts proof from the actual local frame and cleans up after cancellation",async()=>{
  const abort=new AbortController(), reading=readLocalHelperProof(probe,abort.signal);
  const frame=document.querySelector("iframe")!;
  const data={type:"soda-preview-helper-probe",id:probe.id,secret:"x".repeat(43)};
  window.dispatchEvent(new MessageEvent("message",{source:window,origin:probe.origin,data}));
  window.dispatchEvent(new MessageEvent("message",{source:frame.contentWindow,origin:"https://evil.example",data}));
  expect(frame.isConnected).toBe(true);
  window.dispatchEvent(new MessageEvent("message",{source:frame.contentWindow,origin:probe.origin,data}));
  await expect(reading).resolves.toEqual({id:probe.id,secret:data.secret});
  expect(document.querySelector("iframe")).toBeNull();
  const pending=readLocalHelperProof(probe,abort.signal), rejected=expect(pending).rejects.toThrow("cancelled");
  abort.abort();await rejected;expect(document.querySelector("iframe")).toBeNull();
});
it("rejects arbitrary locators and falls back when localhost remains unreachable",async()=>{
  expect(()=>readLocalHelperProof({...probe,url:"http://127.0.0.1:7780"},new AbortController().signal)).toThrow();
  vi.useFakeTimers();
  const pending=readLocalHelperProof(probe,new AbortController().signal), rejected=expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(25_000);await rejected;expect(document.querySelector("iframe")).toBeNull();
});
