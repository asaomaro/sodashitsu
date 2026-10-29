// Disposable files/processes only; no desktop, input, services or existing-user ACL mutation.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { DesktopTransferStore } from "../../packages/server/dist/desktop/DesktopTransferStore.js";
import { DesktopFolderCheckpoints } from "../../packages/server/dist/desktop/DesktopFolderCheckpoints.js";
import { DesktopFiles } from "../../packages/server/dist/desktop/DesktopFiles.js";
import { desktopWindowsPowerShell } from "../../packages/client-core/dist/desktop/DesktopWindowsPowerShell.node.js";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  script = fileURLToPath(import.meta.url);
async function open(base) {
  const root = join(base, "files"),
    store = new DesktopTransferStore({
      directory: join(base, "records"),
      binding: "a".repeat(64),
      folderRecords: true,
    }),
    registry = new DesktopFolderCheckpoints(store),
    files = await DesktopFiles.open(
      root,
      () => true,
      undefined,
      () => true,
      true,
      registry,
    );
  return {
    root,
    store,
    registry,
    files,
    run: (request) => files.run({ type: "desktop_file", id: randomUUID(), request }),
  };
}
const request = (checkpoint, request) => ({ action: "folder_resume_run", checkpoint, request });
if (process.argv[2] === "--child") {
  const base = process.argv[3],
    phase = process.argv[4],
    f = await open(base),
    id = randomUUID(),
    download = phase === "download",
    data = download ? Buffer.alloc(70000, 7) : Buffer.from("abcdef");
  if (download) {
    await fs.mkdir(join(f.root, "source"));
    await fs.writeFile(join(f.root, "source", "data"), data);
  }
  assert.equal((await f.run({ action: "grant", enabled: true })).ok, true);
  const started = await f.run({
    action: "folder_resume_start",
    request: download
      ? { action: "folder_download_start", id, path: "source" }
      : {
          action: "folder_upload_start",
          id,
          parent: "",
          name: "saved",
          entries: [
            { path: "empty", directory: true },
            { path: "a", directory: false, bytes: 6 },
            { path: "zero", directory: false, bytes: 0 },
          ],
        },
  });
  assert.equal(started.ok, true, started.message);
  const checkpoint = started.result.checkpoint;
  await fs.writeFile(join(base, "token.json"), JSON.stringify({ checkpoint, id }), { mode: 0o600 });
  if (download) {
    const first = await f.run(request(checkpoint, { action: "folder_read", id, offset: 0 }));
    assert.equal(first.ok, true, first.message);
    await fs.writeFile(join(base, "prefix.bin"), Buffer.from(first.result.data, "base64"), {
      mode: 0o600,
    });
    process.exit(86);
  }
  assert.equal(
    (
      await f.run(
        request(checkpoint, { action: "folder_write", id, path: "a", offset: 0, data: "YWJj" }),
      )
    ).ok,
    true,
  );
  if (phase === "data-ack") process.exit(86);
  assert.equal(
    (
      await f.run(
        request(checkpoint, { action: "folder_write", id, path: "a", offset: 3, data: "ZGVm" }),
      )
    ).ok,
    true,
  );
  if (phase === "before-link" || phase === "after-link") {
    const link = fs.link;
    fs.link = async (...args) => {
      if (phase === "before-link") process.exit(86);
      const value = await link(...args);
      process.exit(86);
      return value;
    };
    syncBuiltinESMExports();
  }
  if (phase === "after-unlink") {
    const unlink = fs.unlink;
    fs.unlink = async (path, ...args) => {
      const value = await unlink(path, ...args);
      if (String(path).includes(".soda-transfer-")) process.exit(86);
      return value;
    };
    syncBuiltinESMExports();
  }
  assert.equal(
    (
      await f.run(
        request(checkpoint, { action: "folder_file_finish", id, path: "a", sha256: sha("abcdef") }),
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await f.run(
        request(checkpoint, { action: "folder_file_finish", id, path: "zero", sha256: sha("") }),
      )
    ).ok,
    true,
  );
  if (phase === "receipt") {
    const persist = f.registry.persist.bind(f.registry);
    f.registry.persist = async (...args) => {
      await persist(...args);
      if (args[0].snapshot?.complete) process.exit(86);
    };
  }
  await f.run(request(checkpoint, { action: "folder_finish", id }));
  throw Error("Generated child missed folder process boundary");
}
const base = process.platform === "win32" ? process.env.LOCALAPPDATA : tmpdir();
if (!base) throw Error("Generated fixture unavailable");
const directory = await fs.mkdtemp(join(base, "soda-folder-process-"));
try {
  if (process.platform === "win32") {
    const path = directory.replaceAll("'", "''"),
      source = `$ErrorActionPreference='Stop';$path='${path}';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $path -AclObject $acl`;
    const result = spawnSync(
      desktopWindowsPowerShell(),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(source, "utf16le").toString("base64"),
      ],
      { windowsHide: true, encoding: "utf8", timeout: 15000 },
    );
    assert.equal(result.status, 0, "Generated private fixture ACL failed");
  }
  for (const phase of [
    "data-ack",
    "before-link",
    "after-link",
    "after-unlink",
    "receipt",
    "download",
  ]) {
    const path = join(directory, phase);
    await fs.mkdir(path, { mode: 0o700 });
    await fs.mkdir(join(path, "files"), { mode: 0o700 });
    const child = spawnSync(process.execPath, [script, "--child", path, phase], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 45000,
    });
    assert.equal(child.status, 86, `Generated ${phase} failed: ${child.stderr}`);
    const { checkpoint, id } = JSON.parse(await fs.readFile(join(path, "token.json"), "utf8")),
      f = await open(path);
    try {
      assert.equal(
        (await f.run({ action: "folder_resume_attach", checkpoint, offset: 0 })).ok,
        false,
        "Restored an old file grant",
      );
      assert.equal((await f.run({ action: "grant", enabled: true })).ok, true);
      const attached = await f.run({
        action: "folder_resume_attach",
        checkpoint,
        offset: phase === "download" ? 65536 : 0,
      });
      assert.equal(attached.ok, true, attached.message);
      if (phase === "download") {
        const last = await f.run(request(checkpoint, { action: "folder_read", id, offset: 65536 }));
        assert.equal(last.ok, true, last.message);
        assert.equal(last.result.done, true);
        const zip = Buffer.concat([
          await fs.readFile(join(path, "prefix.bin")),
          Buffer.from(last.result.data, "base64"),
        ]);
        assert.equal(sha(zip), last.result.sha256);
      } else {
        const file = attached.result.folderFiles.find((file) => file.path === "a");
        if (!file.done) {
          if (file.offset === 3)
            assert.equal(
              (
                await f.run(
                  request(checkpoint, {
                    action: "folder_write",
                    id,
                    path: "a",
                    offset: 3,
                    data: "ZGVm",
                  }),
                )
              ).ok,
              true,
            );
          assert.equal(
            (
              await f.run(
                request(checkpoint, {
                  action: "folder_file_finish",
                  id,
                  path: "a",
                  sha256: sha("abcdef"),
                }),
              )
            ).ok,
            true,
          );
        }
        if (!attached.result.folderFiles.find((file) => file.path === "zero").done)
          assert.equal(
            (
              await f.run(
                request(checkpoint, {
                  action: "folder_file_finish",
                  id,
                  path: "zero",
                  sha256: sha(""),
                }),
              )
            ).ok,
            true,
          );
        assert.equal((await f.run(request(checkpoint, { action: "folder_finish", id }))).ok, true);
        assert.equal(await fs.readFile(join(f.root, "saved", "a"), "utf8"), "abcdef");
        assert.deepEqual(await fs.readdir(join(f.root, "saved", "empty")), []);
        assert.equal((await fs.lstat(join(f.root, "saved", "a"))).nlink, 1);
        assert.deepEqual(
          (await fs.readdir(join(f.root, "saved"))).filter((name) =>
            name.startsWith(".soda-transfer-"),
          ),
          [],
        );
      }
      process.stdout.write(
        `generated_folder_process_boundary_${phase.replaceAll("-", "_")}_pass\n`,
      );
    } finally {
      await f.files.close();
      await f.registry.suspend();
    }
  }
  process.stdout.write("generated_folder_restart_fresh_grant_exact_tree_zip_and_receipt_pass\n");
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
