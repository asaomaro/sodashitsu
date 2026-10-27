import { DesktopEndpointIdentity } from "@sodashitsu/client-core/desktop/DesktopE2e";

const database = "soda-desktop-endpoints-v1",
  marker = (machine: string) => "soda.desktop.e2e.required." + machine;
const fail = () =>
  Error(
    "暗号化接続の鍵・相手の設定を読み書きできません。HTTPSとブラウザの保存設定を確認してください。",
  );
const validMachine = (machine: string) =>
  /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(machine);
const validFingerprint = (pin: unknown): pin is string =>
  typeof pin === "string" && /^[a-f0-9]{64}$/.test(pin);
const changed = new Map<string, Set<() => void>>();
let broadcast: BroadcastChannel | undefined;
function notify(machine: string): void {
  for (const fn of changed.get(machine) ?? [])
    try {
      fn();
    } catch {
      /* Revoke every connection. */
    }
}
function publish(machine: string): void {
  notify(machine);
  broadcast?.postMessage({ machine });
}
function watchChanges(): void {
  if (broadcast || typeof window === "undefined") return;
  if (typeof BroadcastChannel === "undefined") throw fail();
  broadcast = new BroadcastChannel(database);
  broadcast.onmessage = (event) => {
    if (event.data && validMachine(event.data.machine)) notify(event.data.machine);
  };
  window.addEventListener("storage", (event) => {
    if (event.key === null) {
      for (const machine of changed.keys()) notify(machine);
      return;
    }
    const prefix = "soda.desktop.e2e.required.";
    if (event.key.startsWith(prefix)) {
      const machine = event.key.slice(prefix.length);
      if (validMachine(machine)) notify(machine);
    }
  });
}
export function onDesktopEndpointChanged(machine: string, fn: () => void): () => void {
  if (!validMachine(machine)) throw fail();
  watchChanges();
  let listeners = changed.get(machine);
  if (!listeners) {
    listeners = new Set();
    changed.set(machine, listeners);
  }
  listeners.add(fn);
  return () => {
    listeners!.delete(fn);
    if (!listeners!.size) changed.delete(machine);
  };
}
/** Missing pin and storage failures must never silently choose plaintext. */
export function desktopEndpointRequired(machine: string): boolean {
  if (!machine || machine.length > 128 || machine.includes("\0")) throw fail();
  try {
    const value = localStorage.getItem(marker(machine));
    if (value === null) return false;
    if (value !== "1" || !validMachine(machine)) throw fail();
    return true;
  } catch {
    throw fail();
  }
}
async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw fail();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    let done = false;
    const timer = setTimeout(() => {
      done = true;
      reject(fail());
    }, 5000);
    request.onupgradeneeded = () => {
      if (done) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      if (!db.objectStoreNames.contains("identity")) db.createObjectStore("identity");
      if (!db.objectStoreNames.contains("peers")) db.createObjectStore("peers");
    };
    request.onblocked = request.onerror = () => {
      clearTimeout(timer);
      done = true;
      reject(fail());
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (done) {
        request.result.close();
        return;
      }
      done = true;
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        for (const machine of changed.keys()) notify(machine);
      };
      resolve(db);
    };
  });
}
function peerRecord(value: unknown): { required: boolean; fingerprint?: string } | undefined {
  if (value === undefined) return;
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).some((key) => !["version", "required", "fingerprint"].includes(key))
  )
    throw fail();
  const peer = value as { version: unknown; required: unknown; fingerprint?: unknown };
  if (
    peer.version !== 1 ||
    typeof peer.required !== "boolean" ||
    (peer.fingerprint !== undefined && !validFingerprint(peer.fingerprint)) ||
    (!peer.required && peer.fingerprint !== undefined)
  )
    throw fail();
  return {
    required: peer.required,
    ...(typeof peer.fingerprint === "string" ? { fingerprint: peer.fingerprint } : {}),
  };
}
/** Two independent stores must agree before a new plaintext socket is created. */
export async function desktopEndpointMode(machine: string): Promise<boolean> {
  const required = desktopEndpointRequired(machine);
  if (required) return true;
  if (!validMachine(machine)) return false;
  const db = await openDatabase();
  try {
    const peer = peerRecord(await read(db, "peers", machine));
    return peer?.required === true || desktopEndpointRequired(machine);
  } finally {
    db.close();
  }
}
async function read(db: IDBDatabase, store: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly"),
      request = tx.objectStore(store).get(key);
    let value: unknown;
    request.onsuccess = () => {
      value = request.result;
    };
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(fail());
  });
}
async function write(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(fail());
  });
}
async function identity(db: IDBDatabase, create: boolean): Promise<DesktopEndpointIdentity> {
  if (!globalThis.crypto?.subtle) throw fail();
  const record = await read(db, "identity", "browser");
  if (record !== undefined) {
    if (
      !record ||
      typeof record !== "object" ||
      Object.keys(record).sort().join(",") !== "key,publicKey,version"
    )
      throw fail();
    const saved = record as {
      version: unknown;
      publicKey: unknown;
      key: Parameters<typeof DesktopEndpointIdentity.fromStoredKey>[1];
    };
    if (saved.version !== 1 || typeof saved.publicKey !== "string") throw fail();
    return DesktopEndpointIdentity.fromStoredKey(crypto, saved.key, saved.publicKey);
  }
  if (!create) throw Error("このブラウザの暗号化接続用の鍵を先に作成してください。");
  return DesktopEndpointIdentity.createStored(crypto, async (key, publicKey) => {
    await write(db, "identity", "browser", { version: 1, key, publicKey });
  });
}
/** Initialization requires an explicit user action, never a reconnect. */
export async function initializeDesktopEndpointIdentity(): Promise<{ fingerprint: string }> {
  if (!navigator.locks) throw fail();
  return navigator.locks.request(database, async () => {
    const db = await openDatabase();
    try {
      return { fingerprint: await (await identity(db, true)).fingerprint() };
    } finally {
      db.close();
    }
  });
}
export async function desktopBrowserIdentity(): Promise<DesktopEndpointIdentity> {
  if (!navigator.locks) throw fail();
  return navigator.locks.request(database, async () => {
    const db = await openDatabase();
    try {
      return await identity(db, false);
    } finally {
      db.close();
    }
  });
}
export async function desktopEndpointPeer(machine: string): Promise<string> {
  if (!validMachine(machine) || !(await desktopEndpointMode(machine))) throw fail();
  const db = await openDatabase();
  try {
    const peer = peerRecord(await read(db, "peers", machine));
    if (!peer?.required || !peer.fingerprint) throw fail();
    return peer.fingerprint;
  } finally {
    db.close();
  }
}
/** The caller presents this independently verified fingerprint for confirmation. */
export async function pinDesktopEndpointPeer(machine: string, fingerprint: string): Promise<void> {
  if (!validMachine(machine) || !validFingerprint(fingerprint) || !navigator.locks) throw fail();
  watchChanges();
  await navigator.locks.request(database, async () => {
    const db = await openDatabase();
    try {
      await identity(db, false);
      localStorage.setItem(marker(machine), "1");
      publish(machine);
      await write(db, "peers", machine, { version: 1, required: true, fingerprint });
      publish(machine);
    } finally {
      db.close();
    }
  });
}
/** Keep the required marker after forgetting: reconnect must not downgrade. */
export async function forgetDesktopEndpointPeer(machine: string): Promise<void> {
  if (!validMachine(machine) || !navigator.locks) throw fail();
  watchChanges();
  await navigator.locks.request(database, async () => {
    localStorage.setItem(marker(machine), "1");
    publish(machine);
    const db = await openDatabase();
    try {
      await write(db, "peers", machine, { version: 1, required: true });
      publish(machine);
    } finally {
      db.close();
    }
  });
}
/** Explicit user-selected downgrade only; B independently enforces its policy. */
export async function allowPlainDesktopEndpoint(machine: string): Promise<void> {
  if (!validMachine(machine) || !navigator.locks) throw fail();
  watchChanges();
  await navigator.locks.request(database, async () => {
    localStorage.setItem(marker(machine), "1");
    publish(machine);
    const db = await openDatabase();
    try {
      await write(db, "peers", machine, { version: 1, required: false });
      localStorage.removeItem(marker(machine));
      publish(machine);
    } finally {
      db.close();
    }
  });
}
