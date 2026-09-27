/**
 * `navigator.clipboard` への書き込み（architecture.md「term/clipboard」）。M4（選択終了時のコピー）と
 * copy モードの yank（T18）で共用する。失敗の知らせ（トースト）は呼び出し側（`UiPort` を持つ側）が出す
 * ——この部品は Vue にも UI にも依存しない（規則 4）。
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** メニューの「貼り付け」（design「マウス操作」）。Chromium は許可を求めることがある（research.md F10.10）。 */
export async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

// --- 画像（20260927-clipboard-image-paste。herdr の remote_image_paste）--------------------------------

/** クリップボードの中身（`Ctrl+Shift+V`・メニューの「貼り付け」用）。 */
export type ClipboardContent =
  { kind: "text"; text: string } | { kind: "image"; blob: Blob } | null;

/** 読み取りに使う `navigator` の部分（テストで差し替える）。 */
export interface ClipboardNavigator {
  clipboard?: Partial<Pick<Clipboard, "read" | "readText">>;
  permissions?: Pick<Permissions, "query">;
}

/** 読む画像の種類の優先順（PNG を優先。Chromium の `read()` が返すのは PNG だけ。research F6）。 */
const IMAGE_TYPES_BY_PREFERENCE = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

function nav(n?: ClipboardNavigator): ClipboardNavigator {
  return n ?? (globalThis.navigator as unknown as ClipboardNavigator);
}

/**
 * 画像を貼り付けるキー（既定 Ctrl+V）から読んでよいか（decisions D6）。`navigator.clipboard.read` があり、`clipboard-read` の許可を問い合わせられ
 * （Chromium だけ）、その状態が `granted`／`prompt` のとき真。問い合わせが投げる（Firefox・Safari は `clipboard-read` を知らない）・`denied`・
 * `read` が無い（HTTP＝secure context でない）ときは偽——読むと Firefox・Safari は押す度に「ペースト」のメニューを出し、Vim の Ctrl+V が使えなくなる。
 */
export async function canReadClipboardByKey(n?: ClipboardNavigator): Promise<boolean> {
  const { clipboard, permissions } = nav(n);
  if (typeof clipboard?.read !== "function" || typeof permissions?.query !== "function")
    return false;
  try {
    const status = await permissions.query({ name: "clipboard-read" as PermissionName });
    return status.state === "granted" || status.state === "prompt";
  } catch {
    return false;
  }
}

async function readItems(n?: ClipboardNavigator): Promise<ClipboardItems | null> {
  const { clipboard } = nav(n);
  if (typeof clipboard?.read !== "function") return null;
  try {
    return await clipboard.read();
  } catch {
    return null;
  }
}

async function imageFromItems(items: ClipboardItems): Promise<Blob | null> {
  for (const type of IMAGE_TYPES_BY_PREFERENCE) {
    for (const item of items) {
      if (!item.types.includes(type)) continue;
      try {
        const blob = await item.getType(type);
        // `getType` の Blob の type が空のブラウザがある——宣言された種類で包み直す（送る種類の判定に使う）。
        return blob.type === type ? blob : new Blob([blob], { type });
      } catch {
        // 次を試す
      }
    }
  }
  return null;
}

/** クリップボードから画像を 1 つ読む（PNG を優先。テキストは見ない）。読めない・無ければ null（許可の拒否・メニューを閉じた等も null）。 */
export async function readClipboardImage(n?: ClipboardNavigator): Promise<Blob | null> {
  const items = await readItems(n);
  return items ? imageFromItems(items) : null;
}

/**
 * `Ctrl+Shift+V`・メニューの「貼り付け」用：`read()` があれば `text/plain`（空でないもの）を優先し、無ければ画像。`read()` が無ければ今までどおり `readText()`。
 * 読めなければ null。
 */
export async function readClipboardForPaste(n?: ClipboardNavigator): Promise<ClipboardContent> {
  const { clipboard } = nav(n);
  if (typeof clipboard?.read !== "function") {
    if (typeof clipboard?.readText !== "function") return null;
    try {
      const text = await clipboard.readText();
      return text ? { kind: "text", text } : null;
    } catch {
      return null;
    }
  }
  const items = await readItems(n);
  if (!items) return null;
  for (const item of items) {
    if (!item.types.includes("text/plain")) continue;
    try {
      const text = await (await item.getType("text/plain")).text();
      if (text) return { kind: "text", text };
    } catch {
      // 画像を試す
    }
  }
  const blob = await imageFromItems(items);
  return blob ? { kind: "image", blob } : null;
}

/**
 * paste イベントの `clipboardData` から画像を 1 つ取り出す。**テキスト（`text/plain`）が空でなければ null**（テキストは今までどおり xterm.js に任せる）。
 * 4 種類（PNG・JPEG・GIF・WebP）のファイルだけを見る（PNG を優先）。
 */
export function imageFromDataTransfer(dt: DataTransfer | null): Blob | null {
  if (!dt) return null;
  if (dt.getData("text/plain")) return null;
  const files: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f) files.push(f);
  }
  if (files.length === 0) files.push(...Array.from(dt.files ?? []));
  for (const type of IMAGE_TYPES_BY_PREFERENCE) {
    const f = files.find((x) => x.type === type);
    if (f) return f;
  }
  return null;
}
