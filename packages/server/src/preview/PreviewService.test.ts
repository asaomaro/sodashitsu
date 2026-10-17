import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewService } from "./PreviewService.js";

const services: PreviewService[] = [];
afterEach(() => { for (const s of services.splice(0)) s.dispose(); });
function setup() {
  const pane = randomUUID(), workspace = randomUUID(); let ports = async () => [] as number[];
  const s = new PreviewService({ scope: (id) => id === pane ? workspace : undefined, kind: (id) => id.startsWith("browser") ? "desktop" : "external", blockedPorts: () => ports() });
  services.push(s);
  const viewer = s.watch("browser", pane, "https://soda.example.test").viewerId; s.helper("helper", viewer);
  return { s, pane, viewer, setPorts: (fn: () => Promise<number[]>) => { ports = fn; } };
}

describe("PreviewService", () => {
  it("registers candidates without opening ports, rejects management ports and replaces with a new generation", async () => {
    const x = setup();
    const app = await x.s.register({ paneId: x.pane, name: "web", port: 5173 });
    await expect(x.s.register({ paneId: x.pane, name: "web", port: 5174 })).rejects.toThrow("--replace");
    const next = await x.s.register({ paneId: x.pane, name: "web", port: 5174, replace: true });
    expect(next.id).toBe(app.id); expect(next.generation).not.toBe(app.generation);
    x.setPorts(async () => [7780]);
    await expect(x.s.register({ paneId: x.pane, name: "admin", port: 7780 })).rejects.toThrow("management");
  });
  it("does not enqueue an open after its app was stopped during port validation", async () => {
    const x = setup(); const app = await x.s.register({ paneId: x.pane, name: "web", port: 5173 });
    let release!: (p: number[]) => void;
    x.setPorts(() => new Promise((resolve) => { release = resolve; }));
    void x.s.open("agent", app.id).catch(() => undefined);
    x.s.stop(app.id); release([]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(x.s.work("helper").jobs).toEqual([]);
  });

  it("does not enqueue after a viewer revokes its permission during validation", async () => {
    const x = setup(); const app = await x.s.register({ paneId: x.pane, name: "web", port: 5173 });
    let release!: (p: number[]) => void; x.setPorts(() => new Promise((resolve) => { release = resolve; }));
    const opening = x.s.open("agent", app.id); x.s.unwatch("browser"); release([]);
    await expect(opening).rejects.toThrow();
  });

  it.each(["disconnect", "abort"])("does not enqueue after owner %s during port validation", async (action) => {
    const x = setup(); const app = await x.s.register({ paneId: x.pane, name: "web", port: 5173 });
    let release!: (p: number[]) => void; x.setPorts(() => new Promise((resolve) => { release = resolve; }));
    void x.s.open("agent", app.id).catch(() => undefined);
    if (action === "disconnect") x.s.clientGone("agent"); else x.s.abortOpen("agent", app.id);
    release([]); await new Promise((resolve) => setImmediate(resolve));
    expect(x.s.work("helper").jobs).toEqual([]);
  });

  it("requires a unique viewer and never gives bootstrap capabilities to another viewer", async () => {
    const x = setup(); const app = await x.s.register({ paneId: x.pane, name: "web", port: 5173 });
    x.s.watch("browser2", x.pane, "https://other.example.test");
    await expect(x.s.open("agent", app.id)).rejects.toThrow("viewer_required");
    const opening = x.s.open("agent", app.id, x.viewer);
    await new Promise((resolve) => setImmediate(resolve));
    const job = x.s.work("helper").jobs[0]!;
    const origin = `http://p${randomUUID().replaceAll("-", "")}.localhost:12345`;
    x.s.ready("helper", { requestId: job.requestId, origin, url: `${origin}/.soda-preview/bootstrap#${"a".repeat(43)}`, expiresAt: Date.now() + 60_000 });
    expect(x.s.poll("browser2").displays).toEqual([]);
    expect(() => x.s.ack("browser2", job.requestId)).toThrow();
    x.s.ack("browser", job.requestId); await expect(opening).resolves.toMatchObject({ status: "view_opened" });
    expect(() => x.s.authorize("other-helper", job.requestId)).toThrow();
    x.s.clientGone("agent"); expect(x.s.poll("browser").displays).toHaveLength(1);
    x.s.clientGone("helper"); expect(x.s.poll("browser").displays).toEqual([]);
  });

  it("rejects candidate requests outside the calling pane", async () => {
    const x = setup(); const app = await x.s.register({ paneId: x.pane, name: "web", port: 5173 });
    await expect(x.s.open("agent", app.id, undefined, randomUUID())).rejects.toThrow();
    expect(() => x.s.stop(app.id, true, randomUUID())).toThrow();
  });
});
