import { expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { CdpCapture, inputCommand } = await import(
  pathToFileURL(resolve(import.meta.dirname, "../plugins/vscode-desktop/cdp-client.mjs")).href
);
const { loopbackUrl, targets } = await import(
  pathToFileURL(resolve(import.meta.dirname, "../plugins/vscode-desktop/cdp-bridge.mjs")).href
);
it("maps keys and IME to fixed CDP operations and rejects arbitrary input", () => {
  expect(inputCommand({ kind: "text", text: "日本語" }, 800, 600)).toEqual({
    method: "Input.insertText",
    params: { text: "日本語" },
  });
  expect(
    inputCommand(
      { kind: "key", event: "keyDown", key: "a", code: "KeyA", modifiers: 0, repeat: false },
      800,
      600,
    ).params.text,
  ).toBe("a");
  expect(
    inputCommand(
      { kind: "key", event: "keyDown", key: "a", code: "KeyA", modifiers: 2, repeat: false },
      800,
      600,
    ).params.text,
  ).toBe("");
  expect(inputCommand({ kind: "Runtime.evaluate", expression: "1" }, 800, 600)).toBeNull();
  expect(() => loopbackUrl("https://evil.invalid")).toThrow();
  expect(() => loopbackUrl("http://127.0.0.1:9222/?x=1")).toThrow();
});
it("bounds images with ACKs, releases keys, stops on navigation and never resumes input", async () => {
  let event: (method: string, params: any) => void = () => {};
  const calls: any[] = [],
    frames: any[] = [],
    stops: string[] = [];
  let now = 0;
  const cdp = {
    send: async (method: string, params: any) => {
      calls.push({ method, params });
      return method === "Page.getLayoutMetrics"
        ? { cssVisualViewport: { clientWidth: 800, clientHeight: 600 } }
        : {};
    },
    onEvent: (fn: typeof event) => {
      event = fn;
      return () => {
        event = () => {};
      };
    },
  };
  const c = new CdpCapture(cdp, {
    frame: (f: any) => frames.push(f),
    stopped: (s: string) => stops.push(s),
    now: () => now,
  });
  await c.start();
  await c.onFrame({ sessionId: 1, data: "/9j/" });
  now += 200;
  await c.onFrame({ sessionId: 1, data: "/9j/" });
  expect(frames).toHaveLength(1);
  expect(calls.filter((v) => v.method === "Page.screencastFrameAck")).toHaveLength(2);
  c.ack(1);
  now += 200;
  await c.onFrame({ sessionId: 1, data: "/9j/" });
  expect(frames).toHaveLength(2);
  await c.setControl(true);
  await c.input({
    kind: "key",
    event: "keyDown",
    key: "Control",
    code: "ControlLeft",
    modifiers: 2,
    repeat: false,
  });
  await c.setControl(false);
  expect(
    calls.some((v) => v.method === "Input.dispatchKeyEvent" && v.params.type === "keyUp"),
  ).toBe(true);
  await c.setControl(true);
  event("Page.frameNavigated", { frame: { id: "root" } });
  await new Promise((r) => setTimeout(r, 0));
  expect(stops).toHaveLength(1);
  const count = calls.length;
  await c.input({ kind: "text", text: "must not arrive" });
  expect(calls).toHaveLength(count);
});

it("retains the final repaint while waiting for ACK or the frame interval", async () => {
  vi.useFakeTimers();
  const frames: {seq:number;data:string}[]=[];
  const cdp={send:async(method:string)=>method==='Page.getLayoutMetrics'?{cssVisualViewport:{clientWidth:800,clientHeight:600}}:{},onEvent:()=>()=>{}};
  const capture=new CdpCapture(cdp,{frame:(f:{seq:number;data:string})=>frames.push(f)});
  try {
    await capture.start();
    await capture.onFrame({sessionId:1,data:'RED'});
    await capture.onFrame({sessionId:1,data:'BLUE'});
    capture.ack(1);
    await vi.advanceTimersByTimeAsync(110);
    expect(frames.map(f=>f.data)).toEqual(['RED','BLUE']);
    capture.ack(2);
    await capture.onFrame({sessionId:1,data:'GREEN'});
    await vi.advanceTimersByTimeAsync(110);
    expect(frames.map(f=>f.data)).toEqual(['RED','BLUE','GREEN']);
  } finally { await capture.stop(); vi.useRealTimers(); }
});

it("focuses an inactive Electron page before input and releases focus on view-only and stop", async () => {
  let focused = false, moves = 0;
  const cdp = {
    send: async (method: string, params: any) => {
      if (method === "Emulation.setFocusEmulationEnabled") focused = params.enabled;
      if (method === "Input.dispatchMouseEvent") {
        if (!focused) throw new Error("inactive Electron mouse input timeout");
        ++moves;
      }
      return method === "Page.getLayoutMetrics"
        ? { cssVisualViewport: { clientWidth: 800, clientHeight: 600 } } : {};
    },
    onEvent: () => () => {},
  };
  const capture = new CdpCapture(cdp, { frame: () => {} });
  try {
    await capture.start();
    await capture.onFrame({ sessionId: 1, data: "/9j/" });
    // Input may arrive immediately after grant, before focus setup has resolved.
    const granting = capture.setControl(true);
    await capture.input({ kind: "pointer", event: "mouseMoved", x: 100, y: 100,
      button: "none", buttons: 0, modifiers: 0, clickCount: 0, deltaX: 0, deltaY: 0 });
    await granting;
    expect(moves).toBe(1);
    expect(focused).toBe(true);
    await capture.setControl(false);
    expect(focused).toBe(false);
    await capture.setControl(true);
    expect(focused).toBe(true);
    await capture.stop();
    expect(focused).toBe(false);
  } finally { await capture.stop(); }
});

it("does not replay queued input when control is revoked during focus setup", async () => {
  let focused = false, inputs = 0;
  let unblock!: () => void, began!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const started = new Promise<void>(resolve => { began = resolve; });
  const cdp = {
    send: async (method: string, params: any) => {
      if (method === "Emulation.setFocusEmulationEnabled") {
        focused = params.enabled;
        if (focused) { began(); await gate; }
      }
      if (method.startsWith("Input.")) ++inputs;
      return {};
    },
    onEvent: () => () => {},
  };
  const capture = new CdpCapture(cdp, { frame: () => {} });
  try {
    await capture.start();
    const grant = capture.setControl(true);
    await started;
    const input = capture.input({kind:"text",text:"must not be replayed"});
    const revoke = capture.setControl(false);
    unblock();
    await Promise.all([grant, input, revoke]);
    expect(inputs).toBe(0);
    expect(focused).toBe(false);
  } finally { unblock(); await capture.stop(); }
});

function viewportHarness(send?: (method: string, params: any) => Promise<any>) {
  const calls: {method: string; params: any}[] = [], frames: any[] = [];
  const cdp = {
    send: async (method: string, params: any) => {
      calls.push({method, params});
      if (send) { const result = await send(method, params); if (result !== undefined) return result; }
      return method === 'Page.getLayoutMetrics'
        ? {cssVisualViewport: {clientWidth: 900, clientHeight: 600}} : {};
    },
    onEvent: () => () => {},
  };
  let now = 0;
  const capture = new CdpCapture(cdp, {frame: (frame: any) => frames.push(frame), now: () => now += 200});
  return {capture, calls, frames};
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return {promise, resolve};
}
it('coalesces viewport requests behind focus and accepts only bounded integer sizes with control', async () => {
  const focus = deferred(), began = deferred();
  const {capture, calls} = viewportHarness(async (method, params) => {
    if (method === 'Emulation.setFocusEmulationEnabled' && params.enabled) { began.resolve(); await focus.promise; }
  });
  await capture.start();
  await capture.setViewport({width:900,height:600});
  const grant = capture.setControl(true);
  await began.promise;
  const first = capture.setViewport({width:800,height:500});
  for (let width = 801; width <= 1000; ++width) void capture.setViewport({width,height:600});
  for (const size of [{width:1,height:600},{width:900.5,height:600},{width:900,height:2401},{}])
    void capture.setViewport(size);
  focus.resolve();
  await Promise.all([grant, first]);
  expect(calls.filter(c => c.method === 'Emulation.setDeviceMetricsOverride').map(c => c.params))
    .toEqual([{width:1000,height:600,deviceScaleFactor:0,mobile:false}]);
  await capture.stop();
});
it('discards a queued viewport request when control is revoked before focus completes', async () => {
  const focus = deferred(), began = deferred();
  const {capture, calls} = viewportHarness(async (method, params) => {
    if (method === 'Emulation.setFocusEmulationEnabled' && params.enabled) { began.resolve(); await focus.promise; }
  });
  await capture.start();
  const grant = capture.setControl(true); await began.promise;
  const resize = capture.setViewport({width:900,height:600});
  const revoke = capture.setControl(false);
  focus.resolve();
  await Promise.all([grant, resize, revoke]);
  expect(calls.some(c => c.method === 'Emulation.setDeviceMetricsOverride')).toBe(false);
  await capture.stop();
});
it('clears an in-flight viewport override before stop resolves without restarting capture', async () => {
  const override = deferred(), began = deferred();
  const {capture, calls} = viewportHarness(async method => {
    if (method === 'Emulation.setDeviceMetricsOverride') { began.resolve(); await override.promise; }
  });
  await capture.start(); await capture.setControl(true);
  const resize = capture.setViewport({width:900,height:600}); await began.promise;
  const stopping = capture.stop(); override.resolve();
  await Promise.all([resize, stopping]);
  const methods = calls.map(c => c.method);
  expect(methods.indexOf('Emulation.clearDeviceMetricsOverride')).toBeGreaterThan(methods.indexOf('Emulation.setDeviceMetricsOverride'));
  expect(methods.filter(m => m === 'Page.startScreencast')).toHaveLength(1);
});
it('discards an unsent old image whose metrics resolve after reconfiguration', async () => {
  const metrics = deferred(), began = deferred(); let blockMetrics = true;
  const {capture, frames} = viewportHarness(async method => {
    if (method === 'Page.getLayoutMetrics' && blockMetrics) { began.resolve(); await metrics.promise; }
  });
  await capture.start(); await capture.setControl(true);
  const old = capture.onFrame({sessionId:1,data:'OLD'}); await began.promise;
  await capture.setViewport({width:900,height:600});
  await capture.onFrame({sessionId:2,data:'NEW'});
  blockMetrics = false; metrics.resolve(); await old;
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(frames.map(f => f.data)).toEqual(['NEW']);
  await capture.stop();
});
it('preserves a sent old frame ACK and suppresses input until the new viewport image is acknowledged', async () => {
  const {capture, calls, frames} = viewportHarness();
  await capture.start(); await capture.onFrame({sessionId:1,data:'OLD'});
  await capture.setControl(true);
  await capture.setViewport({width:900,height:600});
  await capture.onFrame({sessionId:2,data:'NEW'});
  await capture.input({kind:'text',text:'blocked before old ACK'});
  expect(frames.map(f => f.data)).toEqual(['OLD']);
  capture.ack(1); await new Promise(resolve => setTimeout(resolve, 0));
  expect(frames.map(f => f.data)).toEqual(['OLD','NEW']);
  await capture.input({kind:'text',text:'blocked before new ACK'});
  expect(calls.some(c => c.method === 'Input.insertText')).toBe(false);
  capture.ack(2);
  await capture.input({kind:'text',text:'allowed'});
  expect(calls.filter(c => c.method === 'Input.insertText').map(c => c.params.text)).toEqual(['allowed']);
  await capture.setControl(false);
  expect(calls.some(c => c.method === 'Emulation.clearDeviceMetricsOverride')).toBe(true);
  await capture.stop();
});
it('ignores duplicate old ACKs while preparing an unsent frame', async () => {
  const metrics = deferred(), began = deferred(); let count = 0;
  const {capture, frames} = viewportHarness(async method => {
    if (method === 'Page.getLayoutMetrics' && ++count === 2) { began.resolve(); await metrics.promise; }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'FIRST'});
  capture.ack(1);
  const next = capture.onFrame({sessionId:1,data:'SECOND'}); await began.promise;
  capture.ack(1);
  await capture.onFrame({sessionId:1,data:'THIRD'});
  expect(frames.map(f => f.data)).toEqual(['FIRST']);
  metrics.resolve(); await next;
  expect(frames.map(f => f.data)).toEqual(['FIRST','SECOND']);
  capture.ack(2); await new Promise(resolve => setTimeout(resolve, 0));
  expect(frames.map(f => f.data)).toEqual(['FIRST','SECOND','THIRD']);
  await capture.stop();
});
it('allows input after a queued fit is cancelled before applying any viewport override', async () => {
  const focus = deferred(), began = deferred(); let blockFocus = true;
  const {capture, calls} = viewportHarness(async (method, params) => {
    if (method === 'Emulation.setFocusEmulationEnabled' && params.enabled && blockFocus) {
      began.resolve(); await focus.promise;
    }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'INITIAL'}); capture.ack(1);
  const grant = capture.setControl(true); await began.promise;
  const resize = capture.setViewport({width:900,height:600});
  const revoke = capture.setControl(false);
  blockFocus = false; focus.resolve();
  await Promise.all([grant, resize, revoke]);
  await capture.setControl(true);
  await capture.input({kind:'text',text:'after cancelled fit'});
  expect(calls.filter(c => c.method === 'Input.insertText').map(c => c.params.text)).toEqual(['after cancelled fit']);
  expect(calls.some(c => c.method === 'Emulation.setDeviceMetricsOverride')).toBe(false);
  await capture.stop();
});
it('keeps input blocked after revocation clears an applied override until the restored image is acknowledged', async () => {
  const {capture, calls, frames} = viewportHarness();
  await capture.start(); await capture.onFrame({sessionId:1,data:'INITIAL'}); capture.ack(1);
  await capture.setControl(true);
  await capture.setViewport({width:900,height:600});
  await capture.onFrame({sessionId:2,data:'FITTED'}); capture.ack(2);
  await capture.setControl(false);
  await capture.setControl(true);
  await capture.input({kind:'text',text:'before restored frame'});
  await capture.onFrame({sessionId:3,data:'RESTORED'});
  await capture.input({kind:'text',text:'before restored ACK'});
  expect(calls.some(c => c.method === 'Input.insertText')).toBe(false);
  expect(frames.map(f => f.data)).toEqual(['INITIAL','FITTED','RESTORED']);
  capture.ack(3);
  await capture.input({kind:'text',text:'after restored ACK'});
  expect(calls.filter(c => c.method === 'Input.insertText').map(c => c.params.text)).toEqual(['after restored ACK']);
  await capture.stop();
});
it('does not queue old-coordinate input when an old ACK arrives during fit key release', async () => {
  const releasing = deferred(), release = deferred();
  let starts = 0, capture: any;
  const harness = viewportHarness(async (method, params) => {
    if (method === 'Input.dispatchKeyEvent' && params.type === 'keyUp') {
      releasing.resolve(); await release.promise;
    }
    if (method === 'Page.startScreencast' && ++starts === 2) {
      // The new frame can be acknowledged before the restart command responds.
      await capture.onFrame({sessionId:2,data:'NEW'});
      capture.ack(2);
    }
  });
  capture = harness.capture;
  await capture.start(); await capture.onFrame({sessionId:1,data:'OLD'});
  await capture.setControl(true);
  await capture.input({kind:'key',event:'keyDown',key:'Control',code:'ControlLeft',modifiers:2,repeat:false});
  const resize = capture.setViewport({width:900,height:600}); await releasing.promise;
  capture.ack(1);
  const oldInput = capture.input({kind:'pointer',event:'mouseMoved',x:100,y:100,
    button:'none',buttons:0,modifiers:0,clickCount:0,deltaX:0,deltaY:0});
  release.resolve(); await Promise.all([resize, oldInput]);
  expect(harness.calls.some(c => c.method === 'Input.dispatchMouseEvent')).toBe(false);
  await capture.input({kind:'text',text:'new viewport ready'});
  expect(harness.calls.filter(c => c.method === 'Input.insertText').map(c => c.params.text)).toEqual(['new viewport ready']);
  await capture.stop();
});

it("identifies the Windows CDP endpoint when discovery cannot connect", async () => {
  const cause = new TypeError("fetch failed");
  const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(cause);
  try {
    const failure = await targets("http://127.0.0.1:9222").catch((e: Error) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain("Windows側のCDP接続先 http://127.0.0.1:9222/json/list");
    expect(failure.message).toContain("--cdp");
    expect(failure.cause).toBe(cause);
  } finally {
    fetchMock.mockRestore();
  }
});

const wheelInput = (deltaY = 10, extra = {}) => ({kind:'pointer',event:'mouseWheel',x:100,y:100,
  button:'none',buttons:0,modifiers:0,clickCount:0,deltaX:0,deltaY,...extra});
it('bounds a slow-CDP wheel burst without stopping and preserves scroll amount below saturation', async () => {
  const began = deferred(), gate = deferred(); let delayed = true;
  const {capture, calls} = viewportHarness(async method => {
    if (method === 'Input.dispatchMouseEvent' && delayed) { delayed = false; began.resolve(); await gate.promise; }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'FRAME'}); capture.ack(1); await capture.setControl(true);
  const pending: Promise<void>[] = [capture.input(wheelInput())]; await began.promise;
  try {
    for (let i = 0; i < 500; ++i) pending.push(capture.input(wheelInput()));
    expect(capture.running).toBe(true);
    expect(capture.queued).toBeLessThanOrEqual(2);
  } finally { gate.resolve(); await Promise.all(pending); }
  expect(calls.filter(c => c.method === 'Input.dispatchMouseEvent').reduce((sum,c) => sum + c.params.deltaY,0)).toBe(5010);
  expect(calls.filter(c => c.method === 'Input.dispatchMouseEvent').length).toBeLessThanOrEqual(3);
  await capture.stop();
});
it('keeps discrete input and incompatible wheel boundaries in order while coalescing moves', async () => {
  const began = deferred(), gate = deferred(); let delayed = true;
  const {capture, calls} = viewportHarness(async method => {
    if (method === 'Input.dispatchMouseEvent' && delayed) { delayed = false; began.resolve(); await gate.promise; }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'FRAME'}); capture.ack(1); await capture.setControl(true);
  const pending = [capture.input(wheelInput(1))]; await began.promise;
  for (const value of [wheelInput(2),wheelInput(3),wheelInput(-4),wheelInput(5,{modifiers:2}),
    {kind:'key',event:'keyDown',key:'Shift',code:'ShiftLeft',modifiers:8,repeat:false},
    wheelInput(6),wheelInput(7,{x:101}),
    wheelInput(0,{event:'mouseMoved',x:200}),wheelInput(0,{event:'mouseMoved',x:300}),
    wheelInput(0,{event:'mousePressed',button:'left',buttons:1,clickCount:1}),
    {kind:'text',text:'between click'},
    wheelInput(0,{event:'mouseReleased',button:'left',clickCount:1}),
    {kind:'key',event:'keyUp',key:'Shift',code:'ShiftLeft',modifiers:0,repeat:false}]) pending.push(capture.input(value));
  gate.resolve(); await Promise.all(pending);
  expect(calls.filter(c => c.method.startsWith('Input.')).map(c => c.method === 'Input.insertText' ? 'text' :
    c.method === 'Input.dispatchKeyEvent' ? c.params.type : c.params.type === 'mouseWheel' ? `wheel:${c.params.deltaY}` :
      `${c.params.type}:${c.params.x}`)).toEqual(['wheel:1','wheel:5','wheel:-4','wheel:5','keyDown','wheel:6','wheel:7',
        'mouseMoved:300','mousePressed:100','text','mouseReleased:100','keyUp']);
  await capture.stop();
});
it('saturates an extreme compatible wheel burst at one bounded pending CDP delta', async () => {
  const began = deferred(), gate = deferred(); let delayed = true;
  const {capture, calls} = viewportHarness(async method => {
    if (method === 'Input.dispatchMouseEvent' && delayed) { delayed = false; began.resolve(); await gate.promise; }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'FRAME'}); capture.ack(1); await capture.setControl(true);
  const pending = [capture.input(wheelInput(10))]; await began.promise;
  for (let i=0;i<2000;++i) pending.push(capture.input(wheelInput(10)));
  expect(capture.queued).toBe(1);
  gate.resolve(); await Promise.all(pending);
  expect(calls.filter(c => c.method === 'Input.dispatchMouseEvent').map(c => c.params.deltaY)).toEqual([10,10000]);
  expect(capture.running).toBe(true); await capture.stop();
});
it.each(['revoke','fit','stop'])('discards buffered continuous input on %s without replay', async mode => {
  const began = deferred(), gate = deferred(); let delayed = true;
  const {capture, calls} = viewportHarness(async method => {
    if (method === 'Input.dispatchMouseEvent' && delayed) { delayed = false; began.resolve(); await gate.promise; }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'FRAME'}); capture.ack(1); await capture.setControl(true);
  const pending = [capture.input(wheelInput(10))]; await began.promise;
  for (let i=0;i<300;++i) pending.push(capture.input(wheelInput(10)));
  const cancelling = mode === 'revoke' ? capture.setControl(false) : mode === 'fit'
    ? capture.setViewport({width:900,height:600}) : capture.stop();
  gate.resolve(); await Promise.all([...pending,cancelling]);
  expect(calls.filter(c => c.method === 'Input.dispatchMouseEvent').map(c => c.params.deltaY)).toEqual([10]);
  await capture.stop();
});
it('places new input after the new focus grant when revoke occurs during a slow input worker', async () => {
  const began = deferred(), gate = deferred(); let delayed = true;
  const events: string[] = [];
  const {capture} = viewportHarness(async (method,params) => {
    if (method === 'Emulation.setFocusEmulationEnabled') events.push(`focus:${params.enabled}`);
    if (method === 'Input.insertText') events.push(`text:${params.text}`);
    if (method === 'Input.dispatchMouseEvent' && delayed) { delayed = false; began.resolve(); await gate.promise; }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'FRAME'}); capture.ack(1); await capture.setControl(true);
  const first = capture.input(wheelInput(10)); await began.promise;
  void capture.input(wheelInput(20));
  const revoke = capture.setControl(false), grant = capture.setControl(true);
  const newInput = capture.input({kind:'text',text:'new grant'});
  gate.resolve(); await Promise.all([first,revoke,grant,newInput]);
  expect(events).toEqual(['focus:true','focus:false','focus:true','text:new grant']);
  await capture.stop();
});
it('keeps a full continuous buffer bounded and preserves key and button releases by reclaiming motion slots', async () => {
  const began = deferred(), gate = deferred(); let delayed = true;
  const {capture, calls} = viewportHarness(async (method,params) => {
    if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseWheel' && delayed) {
      delayed = false; began.resolve(); await gate.promise;
    }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'FRAME'}); capture.ack(1); await capture.setControl(true);
  await capture.input({kind:'key',event:'keyDown',key:'Shift',code:'ShiftLeft',modifiers:8,repeat:false});
  await capture.input(wheelInput(0,{event:'mousePressed',button:'left',buttons:1,clickCount:1}));
  const pending = [capture.input(wheelInput(10))]; await began.promise;
  for (let i=0;i<128;++i) pending.push(capture.input(wheelInput(10,{x:200+i})));
  pending.push(capture.input(wheelInput(10,{x:700})));
  expect(capture.queued).toBe(128); expect(capture.running).toBe(true);
  pending.push(capture.input({kind:'key',event:'keyUp',key:'Shift',code:'ShiftLeft',modifiers:0,repeat:false}));
  pending.push(capture.input(wheelInput(0,{event:'mouseReleased',button:'left',clickCount:1})));
  expect(capture.queued).toBe(128); expect(capture.running).toBe(true);
  gate.resolve(); await Promise.all(pending);
  expect(calls.filter(c => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mouseWheel').map(c => c.params.x))
    .toEqual([100,...Array.from({length:126},(_,i)=>202+i)]);
  expect(calls.filter(c => c.method.startsWith('Input.')).slice(-2).map(c => c.params.type)).toEqual(['keyUp','mouseReleased']);
  const releasesBeforeStop = calls.filter(c => ['keyUp','mouseReleased'].includes(c.params?.type)).length;
  await capture.stop();
  expect(calls.filter(c => ['keyUp','mouseReleased'].includes(c.params?.type))).toHaveLength(releasesBeforeStop);
});
it('safely stops a discrete-only overflow and releases already-held keys and buttons', async () => {
  const began = deferred(), gate = deferred(); let delayed = true;
  const {capture, calls} = viewportHarness(async (method,params) => {
    if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseWheel' && delayed) {
      delayed = false; began.resolve(); await gate.promise;
    }
  });
  await capture.start(); await capture.onFrame({sessionId:1,data:'FRAME'}); capture.ack(1); await capture.setControl(true);
  await capture.input({kind:'key',event:'keyDown',key:'Shift',code:'ShiftLeft',modifiers:8,repeat:false});
  await capture.input(wheelInput(0,{event:'mousePressed',button:'left',buttons:1,clickCount:1}));
  const pending = [capture.input(wheelInput(10))]; await began.promise;
  for (let i=0;i<128;++i) pending.push(capture.input({kind:'text',text:`queued ${i}`}));
  expect(capture.queued).toBe(128);
  pending.push(capture.input({kind:'text',text:'overflow'}));
  expect(capture.running).toBe(false); expect(capture.queued).toBe(0);
  gate.resolve(); await Promise.all(pending);
  expect(calls.some(c => c.method === 'Input.insertText')).toBe(false);
  expect(calls.filter(c => ['keyUp','mouseReleased'].includes(c.params?.type)).map(c => c.params.type)).toEqual(['keyUp','mouseReleased']);
  expect(capture.keys.size).toBe(0); expect(capture.buttons.size).toBe(0);
  await capture.stop();
});
it.each(['release','clear'])('waits for the same cleanup when stop reenters during %s', async phase => {
  const began=deferred(),gate=deferred();
  const {capture,calls}=viewportHarness(async(method,params)=>{
    if ((phase==='release' && method==='Input.dispatchKeyEvent' && params.type==='keyUp') ||
        (phase==='clear' && method==='Emulation.clearDeviceMetricsOverride')) {began.resolve();await gate.promise;}
  });
  await capture.start();await capture.onFrame({sessionId:1,data:'FRAME'});capture.ack(1);await capture.setControl(true);
  if(phase==='release') await capture.input({kind:'key',event:'keyDown',key:'Shift',code:'ShiftLeft',modifiers:8,repeat:false});
  else await capture.setViewport({width:900,height:600});
  const first=capture.stop();await began.promise;
  let secondDone=false;const second=capture.stop().then(()=>{secondDone=true;});
  try {await new Promise(resolve=>setTimeout(resolve,0));expect(secondDone).toBe(false);}
  finally {gate.resolve();await Promise.all([first,second]);}
  expect(calls.at(-1)?.method).toBe('Page.stopScreencast');
});
