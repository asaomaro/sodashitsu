import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DelegationGrants } from "./DelegationGrants.js";
import { loadCatalog, saveCatalog } from "./MachineCatalog.js";
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
it("persists only scoped hashes, refuses duplicate labels and honors disable/remove", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-grants-"));
  dirs.push(dir);
  const grants = new DelegationGrants(dir, dir),
    first = await grants.invite("Outbound PC");
  expect(await grants.authorize(first.machineId, first.token)).toMatchObject({
    label: "Outbound PC",
    transport: "reverse",
  });
  expect(await grants.authorize(first.machineId, "b".repeat(43))).toBeUndefined();
  expect(await grants.authorize("f".repeat(32), first.token)).toBeUndefined();
  const text = await readFile(join(dir, "delegation-grants.json"), "utf8");
  expect(text).not.toContain(first.token);
  if (process.platform !== "win32")
    expect((await stat(join(dir, "delegation-grants.json"))).mode & 0o777).toBe(0o600);
  await expect(grants.invite("Outbound PC")).rejects.toThrow();
  const loaded = await loadCatalog(dir);
  if (loaded.kind !== "ok") throw Error("catalog");
  loaded.data.machines[0]!.enabled = false;
  await saveCatalog(dir, loaded.data);
  expect(await grants.authorize(first.machineId, first.token)).toBeUndefined();
  loaded.data.machines = [];
  await saveCatalog(dir, loaded.data);
  expect(await grants.authorize(first.machineId, first.token)).toBeUndefined();
});

it("management keeps disabled profiles visible and invalidates removed connection credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-manage-"));
  dirs.push(dir);
  const grants = new DelegationGrants(dir, dir),
    invitation = await grants.invite("managed");
  await grants.manage(invitation.machineId, "disable");
  expect(await grants.connections()).toContainEqual(
    expect.objectContaining({ id: invitation.machineId, enabled: false }),
  );
  expect(await grants.authorize(invitation.machineId, invitation.token)).toBeUndefined();
  await grants.manage(invitation.machineId, "enable");
  expect(await grants.authorize(invitation.machineId, invitation.token)).toBeDefined();
  await grants.manage(invitation.machineId, "remove");
  expect(await grants.connections()).toEqual([]);
  expect(await grants.authorize(invitation.machineId, invitation.token)).toBeUndefined();
});

it("serializes SSH registration with invitations and rejects unsafe or duplicate registrations without losing entries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-add-"));
  dirs.push(dir);
  const grants = new DelegationGrants(dir, dir);
  const [added, invited] = await Promise.all([
    grants.add({ label: "Build", target: "builder@build", session: "work" }),
    grants.invite("Laptop"),
  ]);
  const entries = await new DelegationGrants(dir, dir).connections();
  expect(entries).toHaveLength(2);
  expect(entries).toContainEqual({
    id: added.id,
    label: "Build",
    target: "builder@build",
    session: "work",
    enabled: true,
  });
  expect(entries).toContainEqual(
    expect.objectContaining({ id: invited.machineId, transport: "reverse" }),
  );
  for (const input of [
    { label: "Build", target: "other" },
    { label: "local", target: "other" },
    { label: "Bad", target: "-oProxyCommand=bad" },
    { label: "Bad", target: "user:password@host" },
    { label: "Bad", target: "host;echo" },
    { label: "Bad", target: "host", session: "../bad" },
  ])
    await expect(grants.add(input)).rejects.toThrow();
  expect(await grants.connections()).toEqual(entries);
  const normal = await grants.add({
    label: "Default",
    target: "ssh://host:2222",
    session: "default",
  });
  expect((await grants.connections()).find((x) => x.id === normal.id)).not.toHaveProperty(
    "session",
  );
});
