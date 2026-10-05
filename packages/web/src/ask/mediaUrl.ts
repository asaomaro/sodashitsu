import {
  ASK_MEDIA_REF_PREFIX,
  type AskMediaInfo,
  type AskPending,
  type AskViewItem,
} from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { errorCodeOf } from "@sodashitsu/client-core";

/**
 * 質問のメディア（画像・音・成果物）をサーバから取って、画面が使う形にする（20261004-ask-media-popup の design「web」）。
 * 部品 `<ask-form>` の `resolveMedia` は定義を入れた時に**同期で**呼ばれるので、取り終えてから `store.add` する。
 */

/** 成果物 1 件（タブ）の中身。text・markdown・html は復号した文字列、image は `data:` の URL。 */
export interface AskViewLoaded {
  title: string;
  kind: AskViewItem["kind"];
  text?: string;
  url?: string;
}

/** 取り終えたメディア。`urls` は定義の参照（`media:<id>`）→ `data:` の URL（画像・音）。 */
export interface AskResolved {
  urls: Record<string, string>;
  views: AskViewLoaded[];
}

/** 同時に取るメディアの数。 */
const PARALLEL = 3;

/**
 * メディア 1 つの base64 の片（取った順）。片は 3 の倍数のバイト数なので、片ごとに復号できる（1 つの巨大な文字列に連結しない。
 * 20261005-ask-local-no-limit: 大きな成果物で、連結した文字列・`atob` の全体・コピーが重なってメモリが元の約 25 倍になっていた）。
 */
async function fetchParts(
  request: Pick<ConnectionPort, "request">["request"],
  askId: string,
  info: AskMediaInfo,
): Promise<string[]> {
  const parts: string[] = [];
  let offset = 0;
  for (;;) {
    const r = await request("ask.media", { askId, id: info.id, offset });
    if (r.base64 !== "") parts.push(r.base64);
    if (r.eof || r.base64 === "") break;
    // 片の大きさは、返ってきた分から数える（サーバの定数との食い違いで読み落とさない）。
    offset += Math.floor((r.base64.length / 4) * 3);
  }
  return parts;
}

/** 片を復号して、`Blob`（ブラウザが持つ。JS のヒープの文字列にしない）にする。 */
function toBlob(parts: string[], mime: string): Blob {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (const part of parts) {
    const bin = atob(part);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: mime });
}

/**
 * 質問のメディアを全部取る。画像・音が取れなかったときは、その参照を渡さない（プレビューなし）。**成果物（`view`）が取れなかったら `"view_failed"`**
 * （成果物を見ないまま答えさせない）。取っている間に質問が閉じた（`ask_closed`）・`isCurrent` が偽になったときは `null`（捨てる）。
 */
export async function loadMedia(
  request: Pick<ConnectionPort, "request">["request"],
  ask: AskPending,
  isCurrent: () => boolean,
): Promise<AskResolved | "view_failed" | null> {
  const infos = ask.media ?? [];
  const resolved: AskResolved = { urls: {}, views: [] };
  if (infos.length === 0) return resolved;
  const viewMedia = new Set((ask.view ?? []).map((v) => v.media));
  const data = new Map<number, string[]>();
  let closed = false;
  let viewFailed = false;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < infos.length && !closed) {
      const info = infos[next++]!;
      try {
        data.set(info.id, await fetchParts(request, ask.askId, info));
      } catch (err) {
        if (errorCodeOf(err) === "ask_closed") closed = true;
        else if (viewMedia.has(info.id)) viewFailed = true;
        // 画像・音は、取れなければ参照を渡さない（下で urls に入らない）。
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, infos.length) }, worker));
  if (closed || !isCurrent()) return null;
  if (viewFailed) return "view_failed";
  const byId = new Map(infos.map((i) => [i.id, i]));
  for (const info of infos) {
    const parts = data.get(info.id);
    if (parts !== undefined && (info.kind === "image" || info.kind === "audio"))
      resolved.urls[`${ASK_MEDIA_REF_PREFIX}${info.id}`] = `data:${info.mime};base64,${parts.join("")}`;
  }
  for (const v of ask.view ?? []) {
    const parts = data.get(v.media);
    const info = byId.get(v.media);
    if (parts === undefined || info === undefined) return "view_failed";
    resolved.views.push(
      v.kind === "image"
        ? { title: v.title, kind: v.kind, url: `data:${info.mime};base64,${parts.join("")}` }
        : { title: v.title, kind: v.kind, text: await toBlob(parts, info.mime).text() },
    );
  }
  return resolved;
}
