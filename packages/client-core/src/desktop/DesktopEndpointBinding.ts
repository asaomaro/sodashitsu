import { DESKTOP_E2E_VERSION, type DesktopE2eHello } from "./DesktopE2e.js";
const failure = () => Error("Desktop child endpoint authentication failed");
const uuid = (value: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function context(
  parent: string,
  attachment: string,
  protocol: string,
  hello: DesktopE2eHello,
): Uint8Array<ArrayBuffer> {
  if (
    !uuid(parent) ||
    !uuid(attachment) ||
    !/^soda-desktop-[a-z0-9-]{1,64}$/.test(protocol) ||
    hello.version !== DESKTOP_E2E_VERSION ||
    hello.generation !== 1 ||
    !uuid(hello.session) ||
    hello.role === "provider" ||
    !/^04[a-f0-9]{128}$/.test(hello.identity) ||
    !/^04[a-f0-9]{128}$/.test(hello.ephemeral) ||
    !/^[a-f0-9]{64}$/.test(hello.nonce)
  )
    throw failure();
  return new TextEncoder().encode(
    JSON.stringify([
      DESKTOP_E2E_VERSION,
      "child-attachment",
      parent,
      attachment,
      protocol,
      hello.version,
      hello.generation,
      hello.session,
      hello.role,
      hello.identity,
      hello.ephemeral,
      hello.nonce,
    ]),
  );
}
async function key(
  crypto: typeof globalThis.crypto,
  ticket: string,
): Promise<Awaited<ReturnType<typeof crypto.subtle.importKey>>> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw failure();
  const raw = Uint8Array.from(atob(ticket.replace(/-/g, "+").replace(/_/g, "/") + "="), (value) =>
    value.charCodeAt(0),
  );
  try {
    if (
      raw.length !== 32 ||
      btoa(String.fromCharCode(...raw))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "") !== ticket
    )
      throw failure();
    return await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
  } finally {
    raw.fill(0);
  }
}
/** The one-use child ticket is delivered only inside the authenticated parent's
 * ciphertext. Bind it to the fresh child hello before any relay attachment. */
export async function desktopEndpointChildProof(
  crypto: typeof globalThis.crypto,
  ticket: string,
  parent: string,
  attachment: string,
  protocol: string,
  hello: DesktopE2eHello,
): Promise<string> {
  const data = context(parent, attachment, protocol, hello),
    secret = await key(crypto, ticket);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", secret, data)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
export async function verifyDesktopEndpointChild(
  crypto: typeof globalThis.crypto,
  ticket: string,
  parent: string,
  attachment: string,
  protocol: string,
  hello: DesktopE2eHello,
  proof: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(proof)) return false;
  try {
    const data = context(parent, attachment, protocol, hello),
      secret = await key(crypto, ticket),
      signature = Uint8Array.from(proof.match(/../g)!, (value) => parseInt(value, 16));
    return await crypto.subtle.verify("HMAC", secret, signature, data);
  } catch {
    return false;
  }
}
