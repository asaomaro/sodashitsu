import type { NotifyKind } from "@sodashitsu/client-core";

/**
 * 配送の口（design インターフェース「port」）。**ブラウザ API に触るのはこの裏の実装だけ**
 * （`DesktopNotifier.ts` と `ToneSound.ts` の 2 ファイル）。ここが守られていれば
 * `NotificationController` は差し替えた port で完全に単体テストできる。
 */

/**
 * `Notification.permission` の 3 値に **`"unsupported"`** を足したもの（AC12）。
 * `Notification` が無い／非セキュアな文脈（https でも localhost でもない）では API 自体が使えない。
 */
export type DesktopPermission = "default" | "granted" | "denied" | "unsupported";

export interface DesktopNotifierPort {
  permission(): DesktopPermission;
  /**
   * 許可を求める。**利用者の操作からのみ呼ぶ**（AC7）——Firefox と Safari は
   * 一時的なユーザー操作を要求し、Chrome も操作の外から呼ぶと quiet UI にする。
   * 呼ぶのは案内の［許可する］と、設定で `default` の切り替えを押したときだけ。
   */
  request(): Promise<DesktopPermission>;
  /**
   * OS 通知を出す。`tag` は pane id——**同じ pane の通知は置き換わる**。
   *
   * **構築に失敗したら `false` を返す**。Android の Chrome は `Notification` が存在するのに
   * `new Notification()` が `Illegal constructor` を投げる（Service Worker 経由を要求する）ので、
   * 機能検出では捕まらない。**実際に作ってみるまで分からない**。
   */
  show(o: { title: string; body: string; tag: string; onClick: () => void }): boolean;
  /** その pane の OS 通知を閉じる（知らせを片付けたとき・pane が閉じたとき）。 */
  closeByTag(tag: string): void;
}

/**
 * 鳴らせたかどうか（AC13）。**`"blocked"` を黙って捨てない**——自動再生の制限は
 * ページの読み込みごとに利用者の操作を要求するので、「設定は入なのに鳴らない」時間帯がある。
 */
export type SoundResult = "played" | "blocked" | "unsupported";

export interface SoundPort {
  play(kind: NotifyKind): SoundResult;
  /**
   * `AudioContext` を `running` にする。**解除できたら `true`**（呼ぶ側はこれを見て
   * 「鳴らせませんでした」の印を下ろす）。
   *
   * **利用者の操作の中から呼ぶのが本筋**だが（案内の［許可する］・設定で音を「入」にしたとき・
   * 画面への最初の操作）、鳴らせなかった知らせの後にも呼ぶ——一度でも操作されたページなら
   * 操作の外からの `resume()` も通るブラウザがあり、通れば**次の知らせから鳴る**。
   *
   * **reject しない**（失敗は `false` で返す）。呼ぶ側は「解除できたか」だけを見ればよい。
   */
  unlock(): Promise<boolean>;
}
