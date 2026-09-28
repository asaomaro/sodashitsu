import { errorCodeOf, LOCAL_MACHINE_ID } from "@sodashitsu/client-core";
import type { GraphPort } from "./graph.js";

/**
 * 連携のグラフの送り分けの規則（20260927-agent-graph の decisions D6-1）。グラフは手元の `soda serve` のもの——画面の接続がローカルを向いていれば
 * その接続、別のマシンを向いていればローカルの軽い接続で送り、イベントも同じ規則で受ける。`main.ts` は読み込むと起動するので試験できない——
 * 規則をここに閉じ込める（`MachineWiring` と同じ理由）。
 */

/** 画面の接続に届いた `graph.*` を当てるか（別のマシンを向いていれば、それはそのマシンのグラフなので捨てる）。 */
export function acceptsMainGraphEvent(selectedId: string): boolean {
  return selectedId === LOCAL_MACHINE_ID;
}

/** 画面の接続の hello が通ったときにグラフを取り直すか（別のマシンを向いていれば、ローカルの軽い接続の hello で取り直す）。 */
export function reloadsOnMainOpened(selectedId: string): boolean {
  return selectedId === LOCAL_MACHINE_ID;
}

/** 接続が無い・切れた（code の無い失敗）を `not_connected` にそろえる（画面は「繋がっていません」と出す）。 */
export function notConnectedError(detail: string): Error {
  return Object.assign(new Error(`not_connected: ${detail}`), { code: "not_connected" });
}

export interface GraphPortDeps {
  selectedId(): string;
  /** 画面の接続。 */
  main: GraphPort;
  /** ローカルの軽い接続（張っていなければ undefined）。 */
  localSummary(): GraphPort | undefined;
}

export function createGraphPort(deps: GraphPortDeps): GraphPort {
  return {
    request: (method, params) => {
      const target = deps.selectedId() === LOCAL_MACHINE_ID ? deps.main : deps.localSummary();
      if (!target) return Promise.reject(notConnectedError("local"));
      return target.request(method, params).catch((err: unknown) => {
        // 接続の側の失敗（未接続・送信中の切断）は code を持たない——サーバのエラーと分ける。
        if (errorCodeOf(err) === null)
          throw notConnectedError(err instanceof Error ? err.message : String(err));
        throw err;
      });
    },
  };
}
