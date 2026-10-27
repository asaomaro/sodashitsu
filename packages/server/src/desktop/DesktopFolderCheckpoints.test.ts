import { FileTransfer } from "../work/FileTransfer.js";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { DesktopFiles } from "./DesktopFiles.js";
import { DesktopFolderCheckpoints } from "./DesktopFolderCheckpoints.js";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of cleanup.splice(0).reverse()) await f();
});
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "soda-folder-resume-")),
    registry = new DesktopFolderCheckpoints();
  let valid = true;
  const open = async (path = root) => {
    const files = await DesktopFiles.open(
      path,
      () => true,
      undefined,
      () => valid,
      true,
      registry,
    );
    cleanup.push(() => files.close());
    const run = (request: unknown) =>
      files.run({ type: "desktop_file", id: randomUUID(), request });
    return { files, run, grant: () => run({ action: "grant", enabled: true }) };
  };
  cleanup.push(async () => {
    registry.clear();
    await new Promise((r) => setTimeout(r, 30));
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    registry,
    open,
    revoke: () => {
      valid = false;
    },
  };
}
async function upload(f: Awaited<ReturnType<typeof fixture>>, bytes = 70000) {
  const a = await f.open();
  await a.grant();
  const id = randomUUID();
  const r = await a.run({
    action: "folder_resume_start",
    request: {
      action: "folder_upload_start",
      id,
      parent: "",
      name: "folder",
      entries: [
        { path: "empty", directory: true },
        { path: "a.bin", directory: false, bytes },
      ],
    },
  });
  expect(r.ok, r.message).toBe(true);
  return { a, id, token: r.result!.checkpoint!, bytes };
}
const req = (token: string, request: unknown) => ({
  action: "folder_resume_run",
  checkpoint: token,
  request,
});
it("requires fresh grant, rejects live ownership and another root, resumes acknowledged and lost-ACK bytes", async () => {
  const f = await fixture(),
    { a, id, token } = await upload(f),
    data = Buffer.alloc(70000, 7),
    b = await f.open();
  expect((await b.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 })).ok).toBe(
    false,
  );
  await b.grant();
  expect((await b.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 })).ok).toBe(
    false,
  );
  await a.run(
    req(token, {
      action: "folder_write",
      id,
      path: "a.bin",
      offset: 0,
      data: data.subarray(0, 65536).toString("base64"),
    }),
  );
  await a.files.close();
  await mkdir(join(f.root, "other"));
  const other = await f.open(join(f.root, "other"));
  await other.grant();
  expect(
    (await other.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 })).ok,
  ).toBe(false);
  const attached = await b.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 });
  expect(attached.result?.offset).toBe(65536);
  expect(attached.result?.folderFiles).toEqual([{ path: "a.bin", offset: 65536, done: false }]);
  await b.run(
    req(token, {
      action: "folder_write",
      id,
      path: "a.bin",
      offset: 65536,
      data: data.subarray(65536).toString("base64"),
    }),
  );
  expect(
    (
      await b.run(
        req(token, { action: "folder_file_finish", id, path: "a.bin", sha256: hash(data) }),
      )
    ).ok,
  ).toBe(true);
  const done = await b.run(req(token, { action: "folder_finish", id }));
  expect(done.result?.done).toBe(true);
  await b.files.close();
  const c = await f.open();
  await c.grant();
  expect(
    (await c.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 })).result?.done,
  ).toBe(true);
  expect((await c.run(req(token, { action: "folder_finish", id }))).result?.destination).toBe(
    done.result?.destination,
  );
  await c.run({ action: "folder_resume_abort", checkpoint: token });
  expect(await readFile(join(f.root, "folder/a.bin"))).toEqual(data);
  expect(await readdir(join(f.root, "folder/empty"))).toEqual([]);
});
it("does not publish a queued finish after synchronous cancellation", async () => {
  const f = await fixture(),
    { a, id, token } = await upload(f, 1);
  await a.run(req(token, { action: "folder_write", id, path: "a.bin", offset: 0, data: "eA==" }));
  const finish = a.run(
    req(token, { action: "folder_file_finish", id, path: "a.bin", sha256: hash(Buffer.from("x")) }),
  );
  const cancel = a.run({ action: "folder_resume_abort", checkpoint: token });
  expect((await finish).ok).toBe(false);
  expect((await cancel).ok).toBe(true);
  await expect(readFile(join(f.root, "folder/a.bin"))).rejects.toThrow();
});
it("revocation and source epoch changes invalidate checkpoints", async () => {
  const f = await fixture(),
    u = await upload(f, 0);
  await u.a.run({ action: "grant", enabled: false });
  await u.a.files.close();
  const b = await f.open();
  await b.grant();
  expect((await b.run({ action: "folder_resume_attach", checkpoint: u.token, offset: 0 })).ok).toBe(
    false,
  );
  const v = await upload(f, 0);
  f.revoke();
  await v.a.files.close();
  expect((await b.run({ action: "folder_resume_attach", checkpoint: v.token, offset: 0 })).ok).toBe(
    false,
  );
});
it("checks completed file identity before reattaching and preserves user data", async () => {
  const f = await fixture(),
    { a, id, token } = await upload(f, 1);
  await a.run(req(token, { action: "folder_write", id, path: "a.bin", offset: 0, data: "eA==" }));
  await a.run(
    req(token, { action: "folder_file_finish", id, path: "a.bin", sha256: hash(Buffer.from("x")) }),
  );
  await a.files.close();
  await writeFile(join(f.root, "folder/a.bin"), "changed");
  const b = await f.open();
  await b.grant();
  expect((await b.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 })).ok).toBe(
    false,
  );
  expect(await readFile(join(f.root, "folder/a.bin"), "utf8")).toBe("changed");
});
it("renews both lease deadlines when attaching just before expiry", async () => {
  let now = 1;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const f = await fixture(),
    { a, token, id } = await upload(f, 0);
  await a.files.close();
  now = 899999;
  const b = await f.open();
  await b.grant();
  expect((await b.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 })).ok).toBe(
    true,
  );
  now = 900002;
  expect((await b.run(req(token, { action: "folder_status", id }))).ok).toBe(true);
  now += 900001;
  expect((await b.run(req(token, { action: "folder_status", id }))).ok).toBe(false);
});
it("retains private ZIP across disconnect, rewinds lost responses and rejects changed source", async () => {
  const f = await fixture();
  await mkdir(join(f.root, "source"));
  await writeFile(join(f.root, "source/a.bin"), Buffer.alloc(70000, 11));
  const a = await f.open();
  await a.grant();
  const id = randomUUID(),
    start = await a.run({
      action: "folder_resume_start",
      request: { action: "folder_download_start", id, path: "source" },
    }),
    token = start.result!.checkpoint!;
  const first = await a.run(req(token, { action: "folder_read", id, offset: 0 }));
  expect(first.result?.offset).toBe(65536);
  await a.files.close();
  const b = await f.open();
  await b.grant();
  expect(
    (await b.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 })).result?.offset,
  ).toBe(0);
  expect((await b.run(req(token, { action: "folder_read", id, offset: 0 }))).result?.data).toBe(
    first.result?.data,
  );
  const last = await b.run(req(token, { action: "folder_read", id, offset: 65536 }));
  expect(last.result?.done).toBe(true);
  await b.files.close();
  const c = await f.open();
  await c.grant();
  expect(
    (await c.run({ action: "folder_resume_attach", checkpoint: token, offset: 65536 })).ok,
  ).toBe(true);
  expect((await c.run(req(token, { action: "folder_read", id, offset: 65536 }))).result?.data).toBe(
    last.result?.data,
  );
  await c.files.close();
  await writeFile(join(f.root, "source/a.bin"), "changed");
  const d = await f.open();
  await d.grant();
  expect((await d.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 })).ok).toBe(
    false,
  );
});

it("fences an old queued publication before handing the job to another connection", async () => {
  const f = await fixture(),
    { a, id, token } = await upload(f, 1);
  await a.run(req(token, { action: "folder_write", id, path: "a.bin", offset: 0, data: "eA==" }));
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (enter = r)),
    gate = new Promise<void>((r) => (release = r)),
    original = FileTransfer.prototype.run;
  let hold = true;
  vi.spyOn(FileTransfer.prototype, "run").mockImplementation(async function (
    this: FileTransfer,
    ...args
  ) {
    if (args[2].action === "finish" && hold) {
      hold = false;
      enter();
      await gate;
    }
    return original.apply(this, args);
  });
  const old = a.run(
    req(token, { action: "folder_file_finish", id, path: "a.bin", sha256: hash(Buffer.from("x")) }),
  );
  await entered;
  const closing = a.files.close(),
    b = await f.open();
  await b.grant();
  const attached = b.run({ action: "folder_resume_attach", checkpoint: token, offset: 0 });
  release();
  expect((await old).ok).toBe(false);
  await closing;
  expect((await attached).result?.folderFiles).toEqual([{ path: "a.bin", offset: 1, done: false }]);
  await expect(readFile(join(f.root, "folder/a.bin"))).rejects.toThrow();
  expect(
    (
      await b.run(
        req(token, {
          action: "folder_file_finish",
          id,
          path: "a.bin",
          sha256: hash(Buffer.from("x")),
        }),
      )
    ).ok,
  ).toBe(true);
  expect(await readFile(join(f.root, "folder/a.bin"), "utf8")).toBe("x");
});

it.each(["prequeued", "preparing"])(
  "cancels tokenless starts synchronously before queued preparation: %s",
  async (mode) => {
    const f = await fixture(),
      a = await f.open();
    await a.grant();
    const id = randomUUID();
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => (enter = r)),
      gate = new Promise<void>((r) => (release = r));
    let once = true;
    if (mode === "preparing") {
      const check = (a.files as any).check.bind(a.files);
      (a.files as any).check = async () => {
        await check();
        const jobs = [...(f.registry as any).jobs.values()];
        if (once && jobs.some((j: any) => j.folders.jobs.size)) {
          once = false;
          enter();
          await gate;
        }
      };
    }
    const start = a.run({
      action: "folder_resume_start",
      request: {
        action: "folder_upload_start",
        id,
        parent: "",
        name: "cancelled",
        entries: [{ path: "empty", directory: true }],
      },
    });
    if (mode === "preparing") await entered;
    const duplicate = a.run({
      action: "folder_resume_start",
      request: { action: "folder_upload_start", id, parent: "", name: "revived", entries: [] },
    });
    const cancelled = a.run({ action: "folder_abort", id });
    try { expect((f.registry as any).jobs.size).toBe(0); } finally { release?.(); } // Immediate revocation, before the held guard returns.
    expect((await start).ok).toBe(false);
    expect((await cancelled).ok).toBe(true);
    expect((await duplicate).ok).toBe(false);
    expect((await a.run({action:"folder_resume_start",request:{action:"folder_upload_start",id,parent:"",name:"late-revived",entries:[]}})).ok).toBe(false);
    expect((f.registry as any).jobs.size).toBe(0);
    await expect.poll(() => readdir(f.root)).toEqual([]);
  },
);
