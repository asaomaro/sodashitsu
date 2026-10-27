import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DesktopFiles } from "./DesktopFiles.js";
import { DesktopFileCheckpoints, DESKTOP_CHECKPOINT_TTL } from "./DesktopFileCheckpoints.js";
const clean: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const fn of clean.splice(0).reverse()) await fn();
});
const hash = (v: Buffer) => createHash("sha256").update(v).digest("hex");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "soda-file-resume-")),
    registry = new DesktopFileCheckpoints();
  let valid = true;
  clean.push(async () => {
    registry.dispose();
    await new Promise((r) => setTimeout(r, 30));
    await rm(root, { recursive: true, force: true });
  });
  const open = async () => {
    let live = true;
    const files = await DesktopFiles.open(
      root,
      () => live,
      registry,
      () => valid,
    );
    clean.push(() => files.close());
    return {
      files,
      run: (request: unknown) => files.run({ type: "desktop_file", id: randomUUID(), request }),
      close: async () => {
        live = false;
        await files.close();
      },
    };
  };
  return {
    root,
    registry,
    open,
    revoke: () => {
      valid = false;
      registry.clear();
    },
  };
}
it("resumes upload from B's last acknowledged or unacknowledged offset and retains a lost finish receipt", async () => {
  const f = await fixture(),
    a = await f.open(),
    data = Buffer.from("generated upload");
  await a.run({ action: "grant", enabled: true });
  const start = await a.run({
      action: "checkpoint_upload",
      path: "saved.bin",
      bytes: data.length,
      sha256: hash(data),
    }),
    checkpoint = start.result!.checkpoint!;
  expect(start.ok).toBe(true);
  expect(
    (
      await a.run({
        action: "checkpoint_write",
        checkpoint,
        offset: 0,
        data: data.subarray(0, 3).toString("base64"),
      })
    ).result!.offset,
  ).toBe(3);
  await a.close();
  const b = await f.open();
  expect((await b.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
  await b.run({ action: "grant", enabled: true });
  expect((await b.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).result!.offset).toBe(
    3,
  );
  await b.run({
    action: "checkpoint_write",
    checkpoint,
    offset: 3,
    data: data.subarray(3).toString("base64"),
  });
  const done = await b.run({ action: "checkpoint_finish", checkpoint });
  expect(done.ok).toBe(true);
  await b.close();
  const c = await f.open();
  await c.run({ action: "grant", enabled: true });
  const receipt = await c.run({ action: "checkpoint_attach", checkpoint, offset: 3 });
  expect(receipt.result).toMatchObject({
    done: true,
    offset: data.length,
    sha256: hash(data),
    destination: join(f.root, "saved.bin"),
  });
  expect((await c.run({ action: "checkpoint_finish", checkpoint })).result!.destination).toBe(
    join(f.root, "saved.bin"),
  );
  expect(await readFile(join(f.root, "saved.bin"))).toEqual(data);
  expect((await readdir(f.root)).filter((n) => n.startsWith(".soda-transfer-"))).toHaveLength(0);
});
it("resumes download at the browser's durable offset after a lost read response", async () => {
  const f = await fixture(),
    a = await f.open(),
    data = Buffer.alloc(150000, 0xab);
  await writeFile(join(f.root, "source.bin"), data);
  await a.run({ action: "grant", enabled: true });
  const start = await a.run({ action: "checkpoint_download", path: "source.bin" }),
    checkpoint = start.result!.checkpoint!;
  expect(start.result!.sha256).toBe(hash(data));
  const first = await a.run({ action: "checkpoint_read", checkpoint, offset: 0 });
  expect(first.result!.offset).toBe(65536);
  await a.run({ action: "checkpoint_read", checkpoint, offset: 65536 });
  await a.close();
  const b = await f.open();
  await b.run({ action: "grant", enabled: true });
  expect(
    (await b.run({ action: "checkpoint_attach", checkpoint, offset: 65536 })).result!.offset,
  ).toBe(65536);
  const second = await b.run({ action: "checkpoint_read", checkpoint, offset: 65536 }),
    last = await b.run({ action: "checkpoint_read", checkpoint, offset: 131072 });
  expect(
    Buffer.concat([first, second, last].map((r) => Buffer.from(r.result!.data!, "base64"))),
  ).toEqual(data);
  expect(last.result).toMatchObject({ done: true, sha256: hash(data) });
});
it("rejects a changed download source and another live viewer without invalidating the original owner", async () => {
  const f = await fixture(),
    a = await f.open(),
    b = await f.open();
  await writeFile(join(f.root, "source.bin"), Buffer.alloc(70000, 1));
  for (const c of [a, b]) await c.run({ action: "grant", enabled: true });
  const start = await a.run({ action: "checkpoint_download", path: "source.bin" }),
    checkpoint = start.result!.checkpoint!;
  expect((await b.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
  expect((await b.run({ action: "checkpoint_abort", checkpoint })).ok).toBe(false);
  expect((await a.run({ action: "checkpoint_read", checkpoint, offset: 0 })).ok).toBe(true);
  await a.close();
  await writeFile(join(f.root, "source.bin"), Buffer.alloc(70000, 2));
  expect(
    (await b.run({ action: "checkpoint_attach", checkpoint, offset: 65536 })).message,
  ).toContain("変更");
});
it.each(["revoke", "settings", "cancel"])(
  "removes unpublished upload and denies resume after %s",
  async (mode) => {
    const f = await fixture(),
      a = await f.open();
    await a.run({ action: "grant", enabled: true });
    const start = await a.run({
        action: "checkpoint_upload",
        path: "pending.bin",
        bytes: 4,
        sha256: hash(Buffer.from("test")),
      }),
      checkpoint = start.result!.checkpoint!;
    await a.run({ action: "checkpoint_write", checkpoint, offset: 0, data: "dGU=" });
    if (mode === "revoke") await a.run({ action: "grant", enabled: false });
    else if (mode === "settings") f.revoke();
    else {
      await a.close();
      const b = await f.open();
      expect((await b.run({ action: "checkpoint_abort", checkpoint })).ok).toBe(true);
    }
    await expect
      .poll(
        async () => (await readdir(f.root)).filter((n) => n.startsWith(".soda-transfer-")).length,
      )
      .toBe(0);
    const b = await f.open();
    await b.run({ action: "grant", enabled: true });
    expect((await b.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
    expect(await readdir(f.root)).not.toContain("pending.bin");
  },
);
it("expires detached checkpoints and bounds the registry", async () => {
  const f = await fixture(),
    a = await f.open();
  await a.run({ action: "grant", enabled: true });
  let checkpoint = "";
  for (let i = 0; i < 8; i++) {
    const r = await a.run({
      action: "checkpoint_upload",
      path: `p-${i}`,
      bytes: 0,
      sha256: hash(Buffer.alloc(0)),
    });
    expect(r.ok).toBe(true);
    checkpoint = r.result!.checkpoint!;
  }
  expect(
    (
      await a.run({
        action: "checkpoint_upload",
        path: "too-many",
        bytes: 0,
        sha256: hash(Buffer.alloc(0)),
      })
    ).ok,
  ).toBe(false);
  await a.close();
  vi.useFakeTimers(); // refresh only the lease timer, avoiding filesystem-timer mocks during setup.
  const jobs = (f.registry as any).jobs as Map<string, { timer: ReturnType<typeof setTimeout> }>;
  // Existing real timers do not move with fake time; invoke the same timeout expiry path.
  for (const j of jobs.values()) clearTimeout(j.timer);
  for (const j of [...jobs.values()]) (f.registry as any).touch(j);
  await vi.advanceTimersByTimeAsync(DESKTOP_CHECKPOINT_TTL + 1);
  vi.useRealTimers();
  const b = await f.open();
  await b.run({ action: "grant", enabled: true });
  expect((await b.run({ action: "checkpoint_attach", checkpoint, offset: 0 })).ok).toBe(false);
  await expect
    .poll(async () => (await readdir(f.root)).filter((n) => n.startsWith(".soda-transfer-")).length)
    .toBe(0);
});
it("preserves a partial upload if disconnect happens during a queued authority check", async () => {
  const f = await fixture(),
    a = await f.open();
  await a.run({ action: "grant", enabled: true });
  const start = await a.run({
      action: "checkpoint_upload",
      path: "pending.bin",
      bytes: 4,
      sha256: hash(Buffer.from("test")),
    }),
    checkpoint = start.result!.checkpoint!;
  await a.run({ action: "checkpoint_write", checkpoint, offset: 0, data: "dGU=" });
  const check = (a.files as any).check;
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>((r) => (entered = r));
  let calls = 0;
  (a.files as any).check = async () => {
    if (++calls === 4) {
      entered();
      await new Promise<void>((r) => (release = r));
    }
    await check();
  };
  const pending = a.run({ action: "checkpoint_write", checkpoint, offset: 2, data: "c3Q=" });
  await ready;
  const closing = a.close();
  release();
  expect((await pending).ok).toBe(false);
  await closing;
  const b = await f.open();
  await b.run({ action: "grant", enabled: true });
  expect((await b.run({ action: "checkpoint_attach", checkpoint, offset: 2 })).result!.offset).toBe(
    2,
  );
  expect(
    (await b.run({ action: "checkpoint_write", checkpoint, offset: 2, data: "c3Q=" })).ok,
  ).toBe(true);
  expect((await b.run({ action: "checkpoint_finish", checkpoint })).ok).toBe(true);
});
it("makes checkpoint cancellation sticky before a queued finish can publish",async()=>{
 const f=await fixture(),a=await f.open();await a.run({action:"grant",enabled:true});
 const start=await a.run({action:"checkpoint_upload",path:"cancel-before-publish",bytes:4,sha256:hash(Buffer.from("test"))}),checkpoint=start.result!.checkpoint!;
 await a.run({action:"checkpoint_write",checkpoint,offset:0,data:"dGVzdA=="});
 const check=(a.files as any).check;let calls=0,release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r);
 (a.files as any).check=async()=>{if(++calls===5){entered();await new Promise<void>(r=>release=r);}await check();};
 const finishing=a.run({action:"checkpoint_finish",checkpoint});await ready;
 const cancellation=a.run({action:"checkpoint_abort",checkpoint});release();
 expect((await finishing).ok).toBe(false);expect((await cancellation).ok).toBe(true);
 await expect.poll(async()=>await readdir(f.root)).toEqual([]);
});
