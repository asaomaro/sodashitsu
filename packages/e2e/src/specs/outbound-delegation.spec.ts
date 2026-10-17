import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { watchReceivedFrames } from "../support/frames.js";
import { focusTerminal, typeLine } from "../support/keys.js";
test("outbound-only PC appears in the operator sidebar and accepts terminal input through the delegated connection", async ({
  page,
  appServer,
}) => {
  test.setTimeout(60_000);
  const provider = await startAppServer(),
    owner = await provider.openClient(),
    operator = await appServer.openClient();
  try {
    const pane = owner.helloSnapshot()!.panes[0]!,
      ws = owner.helloSnapshot()!.workspaces[0]!;
    await owner.request("workspace.rename", { workspaceId: ws.id, label: "PC inside firewall" });
    const invitation = await operator.request("machine.invite", { label: "Outbound office PC" });
    await owner.request("machine.delegate", {
      url: appServer.origin,
      machineId: invitation.machineId,
      token: invitation.token,
    });
    const frames = await watchReceivedFrames(page);
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header = page.locator(`[data-machine-id="${invitation.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("PC inside firewall", { exact: true })).toBeVisible();
    await header.locator(".machine-select").click();
    await expect(header.locator(".machine-select")).toHaveAttribute("aria-current", "true");
    await expect(page.locator(`.pane-frame[data-pane-id="${pane.id}"]`)).toBeVisible();
    await focusTerminal(page);
    await typeLine(page, 'printf "OUT%s\\n" "BOUND-OK"');
    await expect
      .poll(() =>
        Array.from({ length: frames.connectionCount() }, (_, i) => frames.output(i, pane.id)).join(
          "\n",
        ),
      )
      .toContain("OUTBOUND-OK");
    await expect(
      page.locator(`.pane-frame[data-pane-id="${pane.id}"] canvas`).first(),
    ).toBeVisible();
    await page.screenshot({ path: "/tmp/outbound-delegation-browser.png" });
    const snapshotsBefore = Array.from(
      { length: frames.connectionCount() },
      (_, i) => frames.snapshots(i, pane.id).length,
    ).reduce((a, b) => a + b, 0);
    await provider.restart();
    await expect(header.locator('[data-state="online"]')).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        () =>
          Array.from(
            { length: frames.connectionCount() },
            (_, i) => frames.snapshots(i, pane.id).length,
          ).reduce((a, b) => a + b, 0),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(snapshotsBefore);
    await expect(page.locator(`.pane-frame[data-pane-id="${pane.id}"]`)).toBeVisible();
    await focusTerminal(page);
    await typeLine(page, 'printf "RE%s\\n" "STORED-OK"');
    await expect
      .poll(() =>
        Array.from({ length: frames.connectionCount() }, (_, i) => frames.output(i, pane.id)).join(
          "\n",
        ),
      )
      .toContain("RESTORED-OK");
  } finally {
    owner.close();
    operator.close();
    await provider.close();
  }
});

test("operator sees the pairing code, which alone authorizes the requesting connection", async ({
  page,
  appServer,
}) => {
  const provider = await startAppServer(),
    owner = await provider.openClient();
  try {
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await expect(page.locator(".pane-frame").first()).toBeVisible();
    const pending = await owner.request("machine.request_delegation", {
      url: appServer.origin,
      label: "Code pairing PC",
    });
    const notice = page.getByText(/操作委譲の申請: Code pairing PC/);
    await expect(notice).toBeVisible();
    const code = (await notice.innerText()).match(/確認コード: (\d{8})/)?.[1];
    expect(code).toBeTruthy();
    const status = await owner.request("machine.confirm_delegation", {
      id: pending.id,
      code: code!,
    });
    await expect(notice).toHaveCount(0);
    await expect(
      page.locator(`[data-machine-id="${status.id}"] [data-state="online"]`),
    ).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "/tmp/code-pairing-browser.png" });
  } finally {
    owner.close();
    await provider.close();
  }
});
