import { chromium, expect, test } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { lanIpv4Addresses, type InterfaceAddress } from "@sodashitsu/server";
import { getFreePort } from "../support/freePort.js";

/**
 * AC11 の同一マシン版（親の統合 test で追加）。実物の CLI を `--host 0.0.0.0 --cert --key` で起動し、このマシンの
 * LAN の IP アドレスへ HTTPS でつなぐ（docs/tls-setup.md の手順どおり）。**別のマシンからの接続は含まない**——
 * それは docs/verification.md の手順で実機で確かめる。
 *
 * つなぐ IP は、サーバが表示した `soda: open https://<IP>:<port>/#token=…` の行から取る（localhost 以外の最初の行）。
 * 表示する LAN の IPv4 は、サーバ自身の純関数 `lanIpv4Addresses`（`@sodashitsu/server` の testkit から。仮想ブリッジ——docker0・
 * br-*・vEthernet (WSL) 等——の除外の条件をここで重ねて持つとサーバとずれる。D102）でこのマシンのインタフェースから
 * 求め（skip の判断は読み込み時、表示との比較はサーバの出力を受けた直後に求め直したもの）、**表示されるべきものがあるのに
 * サーバの表示と一致しなければ（1 つも表示しない等）失敗にする**（以前は skip に
 * していたため、実際の NIC まで表示から除く退行が skip として見えなくなっていた。D103）。飛ばすのは、表示されるべき
 * LAN の IPv4 が本当に無いとき（仮想ブリッジだけ等）だけ。`SODA_LAN_IP` を与えればその IP につなぐ（表示の有無は問わない）。
 */
/** このマシンのインタフェース（`OsNetworkInfo.lanAddresses()` と同じ形で `lanIpv4Addresses` に渡す）。 */
function interfaces(): InterfaceAddress[] {
  return Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).map((a) => ({ name, address: a.address, family: a.family, internal: a.internal })),
  );
}
const INTERFACES = interfaces();
/** 読み込み時の見積もり（skip の判断と証明書の SAN にだけ使う。表示との比較は、サーバの出力を受けた直後に求め直す）。 */
const DISPLAYABLE_IPV4 = lanIpv4Addresses(INTERFACES);
const LAN_IP_OVERRIDE = process.env.SODA_LAN_IP;
const MAIN = fileURLToPath(new URL("../../../server/dist/main.js", import.meta.url));

test("LAN の IP アドレスへ TLS でつなぎ、ログイン・表示・入力ができる（AC11 の同一マシン版）", async () => {
  test.skip(
    !LAN_IP_OVERRIDE && DISPLAYABLE_IPV4.length === 0,
    `表示されるべき LAN の IPv4 が無い（インタフェース: ${INTERFACES.filter((a) => a.family === "IPv4").map((a) => `${a.name}=${a.address}`).join(", ")}）`,
  );
  const dir = mkdtempSync(join(tmpdir(), "soda-tls-"));
  const cert = join(dir, "soda.pem");
  const key = join(dir, "soda-key.pem");
  // どの IP が表示されるかは起動するまで分からないので、候補をすべて SAN に入れる（ignoreHTTPSErrors なので必須ではない）。
  const san = [...new Set([...(LAN_IP_OVERRIDE ? [LAN_IP_OVERRIDE] : []), ...DISPLAYABLE_IPV4])].map((ip) => `IP:${ip}`).join(",");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key, "-out", cert, "-subj", "/CN=soda-test", "-addext", `subjectAltName=${san}`], { stdio: "ignore" });
  const port = await getFreePort();
  const proc = spawn(process.execPath, [MAIN, "serve", "--host", "0.0.0.0", "--port", String(port), "--cert", cert, "--key", key, "--state-dir", join(dir, "state")], { cwd: dir });
  let out = "";
  proc.stdout.on("data", (d) => (out += String(d)));
  proc.stderr.on("data", (d) => (out += String(d)));
  try {
    // token 付きの URL の行は「(token 付きの URL は今だけ表示します)」の行の前にすべて出る。
    const openLines = await new Promise<string[]>((res, rej) => {
      const t = setTimeout(() => rej(new Error(`no token url: ${out}`)), 15_000);
      const iv = setInterval(() => {
        if (!out.includes("soda: (token 付きの URL は今だけ表示します)")) return;
        clearTimeout(t);
        clearInterval(iv);
        res(out.split("\n").filter((l) => l.startsWith("soda: open https://") && l.includes("/#token=")));
      }, 100);
    });
    const token = openLines[0]!.split("#token=")[1]!.trim();
    // `0.0.0.0` ではなく、このマシンの LAN の IP の URL を表示していること（開ける URL を案内する）。
    const lanHosts = openLines
      .map((l) => new URL(l.slice("soda: open ".length).trim()))
      .filter((u) => u.hostname !== "localhost" && u.port === String(port))
      .map((u) => u.hostname);
    // 表示されるべき LAN の IPv4 は、サーバの出力を受けた直後に求め直す（読み込み時の見積もりとの間にインタフェースが
    // 変わっても揺れないよう、サーバが列挙した時点になるべく近づける。D103 の独立点検 #7）。
    const displayableNow = lanIpv4Addresses(interfaces());
    const shown = openLines.join(" | ").replaceAll(token, "<token>");
    // 表示されるべき LAN の IPv4 があるなら、サーバはそれを（同じ順で）すべて表示する（1 つも表示しない・実際の NIC を
    // 落とす・別のものを出す退行を、skip ではなく失敗にする。D103）。
    if (displayableNow.length > 0) expect(lanHosts, `server said: ${shown}`).toEqual(displayableNow);
    let lanIp: string;
    if (LAN_IP_OVERRIDE) {
      lanIp = LAN_IP_OVERRIDE;
    } else {
      // 読み込み時は表示されるべきものがあった（無ければ上で skip）が、その後に無くなったら、つなぐ先が無いので失敗にする。
      expect(lanHosts.length, `server said: ${shown}`).toBeGreaterThan(0);
      lanIp = lanHosts[0]!;
    }
    console.log(`[AC11] server said: ${openLines.join(" | ").replaceAll(token, "<token>")} -> connecting to ${lanIp}`);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto(`https://${lanIp}:${port}/#token=${token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true); // Clipboard API が使える前提
    await page.locator(".xterm-helper-textarea").first().click();
    const marker = join(dir, "typed-over-tls.txt");
    await page.keyboard.type(`echo ok > ${marker}`);
    await page.keyboard.press("Enter");
    await expect.poll(() => existsSync(marker) && readFileSync(marker, "utf8").trim(), { timeout: 8000 }).toBe("ok");

    // 平文 HTTP では同じポートに入れない（TLS のみ）。
    const plain = await fetch(`http://${lanIp}:${port}/api/session`).then((r) => r.status).catch((e: Error) => `error:${e.name}`);
    console.log(`[AC11] plain http to the TLS port -> ${plain}`);
    expect(plain).not.toBe(204);
    await browser.close();
  } finally {
    proc.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
});

test("証明書なしで LAN の IP に bind しようとすると起動を拒否する（docs/tls-setup.md「なぜ TLS が要るか」）", async () => {
  const dir = mkdtempSync(join(tmpdir(), "soda-tls-"));
  try {
    let msg = "";
    try {
      execFileSync(process.execPath, [MAIN, "serve", "--host", "0.0.0.0", "--port", String(await getFreePort()), "--state-dir", join(dir, "state")], { encoding: "utf8", stdio: "pipe", timeout: 10_000 });
    } catch (e) {
      const err = e as { status: number; stderr: string; stdout: string };
      msg = `${err.status} ${err.stderr}${err.stdout}`;
    }
    console.log(`[AC11] no-cert bind -> ${msg.trim().split("\n")[0]}`);
    expect(msg).toContain("without a certificate");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
