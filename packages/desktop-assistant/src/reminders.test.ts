import { afterEach, expect, it, vi } from "vitest";
import { Reminders } from "./reminders.js";
const instances: Reminders[] = [];
afterEach(() => {
  for (const service of instances.splice(0)) service.stop();
});
it("does not let a disconnected response present old reminders", async () => {
  let finish!: (value: unknown) => void;
  const request = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
    changed = vi.fn();
  const reminders = new Reminders("device", { request: request as any }, changed);
  instances.push(reminders);
  reminders.connection(true);
  reminders.connection(false);
  finish({ jobs: [], runs: [{ id: "old", input: "old" }] });
  await Promise.resolve();
  await Promise.resolve();
  expect(reminders.snapshot().runs).toEqual([]);
  expect(changed.mock.calls.some((call) => call[1])).toBe(false);
});
it("announces unacknowledged runs once and injects only its own device", async () => {
  const request = vi.fn(async () => ({ jobs: [], runs: [{ id: "run", input: "お知らせ" }] })),
    changed = vi.fn();
  const service = new Reminders("device", { request: request as any }, changed);
  instances.push(service);
  service.connection(true);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  await service.refresh();
  expect(changed.mock.calls.filter((call) => call[1]).length).toBe(1);
  await service.acknowledge("run");
  expect(request).toHaveBeenCalledWith("assistant.reminder_ack", { deviceId: "device", id: "run" });
});
it("does not resurrect a pre-acknowledgement poll response",async()=>{
 let finish!:(value:any)=>void;let reads=0;const request=vi.fn(async(method:string)=>{if(method==="assistant.reminder_ack")return{};if(++reads===1)return new Promise(resolve=>{finish=resolve;});return{jobs:[],runs:[]};});
 const changed=vi.fn(),service=new Reminders("device",{request:request as any},changed);instances.push(service);service.connection(true);await service.acknowledge("run");finish({jobs:[],runs:[{id:"run",input:"stale"}]});await vi.waitFor(()=>expect(reads).toBe(2));expect(changed.mock.calls.some(call=>call[0].runs.some((run:any)=>run.id==="run"))).toBe(false);
});
