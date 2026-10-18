import { expect, type Locator, type Page } from "@playwright/test";

/** Observe both overlays in the actual maximized viewer, including retained draft and focus. */
export async function checkCollapsibleViewerControls(page: Page, view: Locator, canvas: Locator, inputName: string, stableCanvas = true): Promise<void> {
  const input = view.getByRole("textbox", { name: inputName, exact: true });
  const bounds = await canvas.boundingBox();
  await input.fill("折りたたみ後も残す下書き");
  const collapseToolbar = view.getByRole("button", {name:"操作バーを畳む",exact:true});
  await expect(collapseToolbar).toBeVisible({timeout:2000});
  await collapseToolbar.click();
  await expect(view.getByRole("button", {name:"情報・設定",exact:true})).toBeHidden();
  await expect(input).toBeVisible();
  await view.getByRole("button", {name:"文字入力欄を畳む",exact:true}).click();
  await expect(input).toBeHidden();
  await expect(canvas).toBeFocused();
  if (stableCanvas) await expect.poll(()=>canvas.boundingBox()).toEqual(bounds);
  const viewport = await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  const viewer = (await view.boundingBox())!;
  for (const name of ["操作バーを表示", "文字入力欄を表示"]) {
    const button = view.getByRole("button", {name,exact:true});
    await expect(button).toHaveAttribute("aria-expanded", "false");
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x).toBeGreaterThanOrEqual(viewer.x);
    expect(box.y).toBeGreaterThanOrEqual(viewer.y);
    expect(box.x+box.width).toBeLessThanOrEqual(viewer.x+viewer.width);
    expect(box.y+box.height).toBeLessThanOrEqual(viewer.y+viewer.height);
    expect(box.width).toBeLessThanOrEqual(32);
    expect(box.height).toBeLessThanOrEqual(32);
  }
  // Reopening one overlay must not expand the other or discard input.
  await view.getByRole("button", {name:"操作バーを表示",exact:true}).click();
  await expect(view.getByRole("button", {name:"情報・設定",exact:true})).toBeVisible();
  await expect(input).toBeHidden();
  await view.getByRole("button", {name:"文字入力欄を表示",exact:true}).click();
  await expect(input).toHaveValue("折りたたみ後も残す下書き");
  await expect(input).toBeFocused();
  await input.fill("");
  await canvas.focus();
}
