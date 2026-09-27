import type { AgentInfo } from "@sodashitsu/protocol";
import type { Pinia } from "pinia";
import { nextTick, watch } from "vue";
import { useNotificationsStore } from "../store/notifications.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import { describeParts, describeTarget } from "@sodashitsu/client-core";
import { notifyKeyOf, routesFor, shouldQueue, snapshotKeys, type Audience, type NotifyKey, type NotifyKind } from "@sodashitsu/client-core";
import type { DesktopNotifierPort, DesktopPermission, SoundPort } from "./ports.js";

/** `blocked` を知らせるまでの待ち（AC4）。この間に元へ戻ったら知らせない。 */
const BLOCKED_DELAY_MS = 1000;

export interface NotificationControllerOptions {
  pinia: Pinia;
  desktop: DesktopNotifierPort;
  sound: SoundPort;
  /** その pane が画面に出ているか（`TerminalRegistry.isVisible`）。 */
  isPaneVisible: (paneId: string) => boolean;
  /** ウィンドウにフォーカスがあるか。既定は `document.hasFocus()`。 */
  hasFocus?: () => boolean;
  /** 遅延の差し替え（テスト用。既定は `setTimeout`）。 */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  /** `setTimeoutFn` と対（マシンの切り替えで遅延中の知らせを取り消す。20260927-multi-host-machines）。 */
  clearTimeoutFn?: (h: ReturnType<typeof setTimeout>) => void;
  /** pane へ移ったことをサーバへ知らせる（`pane.focus`）。省略可。 */
  onFocusPane?: (paneId: string) => void;
}

/** 文言（design 振る舞い 4「文言」）。 */
const TOAST_SUFFIX: Record<NotifyKind, string> = { blocked: "が入力待ちです", done: "が完了しました" };
const TITLE_PREFIX: Record<NotifyKind, string> = { blocked: "入力待ち", done: "完了" };
/** 対象が消えていたときの文言。**`prefix+o` と［移動］で同じ状況なので、同じ言い方にする**。 */
const CLOSED_TARGET_MESSAGE = "知らせの対象はすでに閉じられていました。";
/**
 * OS 通知の案内の文。**「後から〜でも変えられます」のキーは現在の割り当て**（`settings.keymap.hintFor("settings")`。20260921-keybinding-customization の AC11）。
 * 設定を開く割り当てが無ければ、キーを書かずに「設定」と言う（設定はサイドバーのメニュー・モバイルの上部バーからも開ける）。
 */
function hintMessage(settingsKey: string | null): string {
  const how = settingsKey === null ? "設定" : ` ${settingsKey} `;
  return `エージェントの入力待ち・完了を、OS の通知でも受け取れますか？（後から${how}でも変えられます）`;
}

/**
 * 検知 → 判定 → 遅延 → 配送（design 振る舞い 1〜4）。
 *
 * **判定と記録を切り離さない**——`decide()` が返した鍵を**必ず**「判定済み」へ入れてから先へ進む。
 * 入れ忘れると、3 経路とも出さなかった出来事が**再接続のスナップショットで一斉に出る**（AC14）。
 */
export class NotificationController {
  readonly #opts: NotificationControllerOptions;
  /** 遅延中の鍵（`blocked` の 1 秒待ち）。同じ鍵で 2 本目を立てない。 */
  readonly #pending = new Map<NotifyKey, ReturnType<typeof setTimeout>>();

  constructor(opts: NotificationControllerOptions) {
    this.#opts = opts;
    // 案内は sticky で残るので、出ている間に設定でキーを変えうる——文言を現在の割り当てへ追従させる（AC11）。
    watch(
      () => this.#settings.keymap.hintFor("settings"),
      () => this.#refreshHintMessage(),
    );
  }

  get #store() {
    return useNotificationsStore(this.#opts.pinia);
  }
  get #session() {
    return useSessionStore(this.#opts.pinia);
  }
  get #view() {
    return useViewStore(this.#opts.pinia);
  }
  get #settings() {
    return useSettingsStore(this.#opts.pinia);
  }

  /** エージェントの状態が変わった（`StoreAdapter.onAgentChanged`）。 */
  onAgentChanged(paneId: string, prev: AgentInfo | null, next: AgentInfo | null): void {
    if (!next) return;
    // 入力待ちへ**変わった**とき（続いている間は繰り返さない）。
    if (next.state === "blocked" && prev?.state !== "blocked") this.#consider("blocked", paneId, next);
    // **前の値が無ければ完了は出さない**——「前進した」と言えないため（初めて見る pane）。
    if (prev && next.completionSeq > prev.completionSeq) this.#consider("done", paneId, next);
  }

  /** スナップショットを適用した（`StoreAdapter.onSnapshotApplied`）。 */
  onSnapshotApplied(panes: { paneId: string; agent: AgentInfo | null }[], first: boolean): void {
    const store = this.#store;
    this.#pruneMissingPanes(new Set(panes.map((p) => p.paneId)));
    if (first) {
      // **基準線**：何も知らせずに鍵だけ入れる（ページを開いた瞬間に何件も出さない。AC14 前半）。
      store.baseline(panes.filter((p) => p.agent).map((p) => ({ paneId: p.paneId, keys: snapshotKeys(p.agent!).map((k) => k.key) })));
      return;
    }
    // **再接続**：判定済みに無いものだけを知らせる（切断中の取りこぼしを拾う。AC14 後半）。
    for (const p of panes) {
      if (!p.agent) continue;
      for (const { kind } of snapshotKeys(p.agent)) this.#consider(kind, p.paneId, p.agent);
    }
  }

  /**
   * **スナップショットから消えた pane を掃除する**。`pane.closed` は接続中にしか届かないので、
   * **切断中に閉じられた pane には `onPaneClosed` が来ない**（スナップショットは差分ではなく丸ごとの
   * 置き換え）。掃除しないと、判定済みの鍵が永久に残り、待ち行列の枠を占め、
   * **その pane の OS 通知が閉じられずに残る**。
   */
  #pruneMissingPanes(alive: ReadonlySet<string>): void {
    const store = this.#store;
    for (const paneId of [...store.judged.keys()]) if (!alive.has(paneId)) store.forgetPane(paneId);
    for (const entry of store.queue.filter((q) => !alive.has(q.paneId))) {
      for (const e of store.removePane(entry.paneId)) this.#cleanup(e.toastId, e.paneId);
    }
  }

  /**
   * マシンの切り替えの前に、前のマシンの待ち行列・トースト・OS 通知・判定済みの鍵・遅延中の知らせを捨てる（20260927-multi-host-machines）。
   * pane の id はマシンをまたいで衝突するので、前のマシンの `p1` の知らせを次のマシンの `p1` へ移さない。次の snapshot は初回（基準線）として扱う
   * （`StoreAdapter.resetBaseline`）。
   */
  resetForMachineSwitch(): void {
    const clearT = this.#opts.clearTimeoutFn ?? clearTimeout;
    for (const h of this.#pending.values()) clearT(h);
    this.#pending.clear();
    this.#pruneMissingPanes(new Set());
  }

  /**
   * pane が閉じた（`StoreAdapter.onPaneClosed`）。待ち行列と判定済みを掃除する。
   * **遅延中のものは取り消さない**——発火時に `session.panes` を引き直して弾かれる
   * （閉じた pane は引けないので、そこで捨てられる）。
   */
  onPaneClosed(paneId: string): void {
    this.#store.forgetPane(paneId);
    for (const e of this.#store.removePane(paneId)) this.#cleanup(e.toastId, e.paneId);
  }

  /** 1 件を判定して、必要なら遅延を仕掛ける。**鍵は必ずここで判定済みへ入れる**。 */
  #consider(kind: NotifyKind, paneId: string, agent: AgentInfo): void {
    const store = this.#store;
    const key = notifyKeyOf(kind, agent);
    if (store.isJudged(paneId, key)) return; // 同じ出来事は 2 度扱わない
    if (this.#pending.has(key)) return; // 既に遅延中（再接続のスナップショットで二重に立てない）

    // **遅延を仕掛けた時点で入れる**。発火を待ってから入れると、その 1 秒の間に
    // 再接続のスナップショットが来て 2 本目が立ち、音と OS 通知が二重に出る。
    store.markJudged(paneId, key);

    // **案内の印は「判定した」時点で立てる**（出した時点ではない）——
    // 3 経路とも「切」の利用者では「出した」が成立せず、**案内が永久に出ない**（AC5）。
    this.#armHint();

    if (kind === "done") {
      // 完了はサーバ側に既に保留がある（`AgentTracker` の working→idle 700ms×3）ので待たない。
      void this.#deliverAfterTick(kind, paneId, key);
      return;
    }
    const setT = this.#opts.setTimeoutFn ?? setTimeout;
    const h = setT(() => {
      this.#pending.delete(key);
      // **発火時にもう一度見る**：1 秒の間に元へ戻っていたら知らせない（AC4）。
      const now = this.#session.panes.get(paneId)?.agent;
      if (!now || notifyKeyOf("blocked", now) !== key || now.state !== "blocked") return;
      void this.#deliverAfterTick(kind, paneId, key);
    }, BLOCKED_DELAY_MS);
    this.#pending.set(key, h);
  }

  /**
   * 配送。**利用者の状態は `await nextTick()` の後に読む**——`isVisible` は `TerminalPane` の
   * mount/unmount に連動し、そのフックは Vue のパッチ後に走る。途中で読むと切り替え中の値を拾う。
   */
  async #deliverAfterTick(kind: NotifyKind, paneId: string, key: NotifyKey): Promise<void> {
    await nextTick();
    this.deliver(kind, paneId, key);
  }

  /** 配送の本体。3 経路 ＋ 待ち行列。 */
  deliver(kind: NotifyKind, paneId: string, key: NotifyKey): void {
    const store = this.#store;
    const audience: Audience = {
      windowFocused: (this.#opts.hasFocus ?? (() => document.hasFocus()))(),
      paneVisible: this.#opts.isPaneVisible(paneId),
    };
    // 鍵は既に手元にあるので `decide` ではなく `routesFor` を直に呼ぶ（ダミーの agent を作らない）。
    const routes = routesFor(audience, store.prefs);
    if (!shouldQueue(audience)) return; // 表の (c)：見ている pane は何も出さないし、行き先にもしない

    const lookup = { panes: this.#session.panes, tabs: this.#session.tabs, workspaces: this.#session.workspaces };
    const label = describeTarget(lookup, paneId);

    // **［移動］を添える**（US4）。既定では OS 通知が「切」なので、これが無いと
    // **マウス／タッチの利用者には移動する手段が無い**（トースト本体のクリックは「消す」＝行き先ごと捨てる）。
    const toastId = routes.toast
      ? this.#view.toast(`${label}${TOAST_SUFFIX[kind]}`, {
          kind: "sticky",
          actions: [{ label: "移動", run: () => this.focusNotification(key) }],
        })
      : null;

    // **積むのは「見ている pane ではない」とき**——`routes.toast` で条件にすると、
    // トーストを「切」にして OS 通知だけ「入」にした利用者で待ち行列が常に空になり、
    // `prefix+o` も OS 通知のクリックも効かなくなる（decisions D4）。
    //
    // **押し出された件は「新しい通知を出す前」に片付ける**——OS 通知の `tag` は pane id なので、
    // 置き換えのときに後から片付けると**新しい通知まで閉じてしまう**。
    for (const e of store.push({ key, kind, paneId, label, at: Date.now(), toastId })) this.#cleanup(e.toastId, e.paneId);

    // **許可を確かめてから出す**。確かめずに呼ぶと、`denied`／`default` のときに `show()` が
    // `false` を返し、**「この環境では使えません」を恒久的に立ててしまう**（一度立てたら下ろさない）。
    // `false` は「この環境では原理的に出せない」（Android Chrome）の合図に取っておく。
    if (routes.desktop && store.desktopUsable && this.#opts.desktop.permission() === "granted") {
      const { paneName, place } = describeParts(lookup, paneId);
      const ok = this.#opts.desktop.show({
        title: `${TITLE_PREFIX[kind]}: ${paneName}`,
        body: place,
        tag: paneId,
        onClick: () => this.focusNotification(key),
      });
      // **出せなかった環境を覚える**（Android Chrome 等）。以後は設定に「使えません」と出す。
      if (!ok) store.desktopUsable = false;
    }

    if (routes.sound) {
      const r = this.#opts.sound.play(kind);
      // **`"unsupported"` を `blocked` に畳まない**——畳むと「入」のまま注記も出ず、
      // **永久に鳴らない設定を利用者が「入」だと思い続ける**（design の異常系の表）。
      if (r === "unsupported") store.soundUsable = false;
      else {
        store.soundBlocked = r === "blocked"; // 鳴ったら下ろす
        // 鳴らせなかったら、ここで解除を試みる。一度でも操作されたページなら操作の外からの
        // `resume()` も通るので、通れば**次の知らせから鳴る**（印もその時点で下りる）。
        if (r === "blocked") this.#unlockSound();
      }
    }
  }

  /**
   * **知らせを 1 件片付ける唯一の出口**（design 振る舞い 5）。
   * 待ち行列から外し、**残っていればトーストを消し**、OS 通知も閉じる。
   * 置き換え・上限超過・pane 閉鎖・`prefix+o`・OS 通知のクリックは、すべてここを通る。
   */
  #drop(key: NotifyKey): void {
    for (const e of this.#store.removeKey(key)) this.#cleanup(e.toastId, e.paneId);
  }

  /**
   * **利用者がトーストを消した**のを拾う（`Toast.vue` の `dismiss` は変えない）。
   * `sticky` は自動消去に掛からないので、**これが唯一の観測点**。
   * **`dismissToast` は呼ばない**（既に消えている）ので `#drop` と再入しない。
   */
  syncToasts(): void {
    const alive = new Set(this.#view.toasts.map((t) => t.id));
    for (const e of this.#store.dropMissingToasts(alive)) this.#opts.desktop.closeByTag(e.paneId);
    this.#syncHint();
  }

  /**
   * `prefix+o`（AC10・AC11）。**先頭から順に試し**、対象が消えている件は捨てて次へ進む。
   * herdr は消費せず留めるが（research F58）、**この製品のトーストは自動で消えない**ので、
   * 留めると待ち行列が永久に詰まる（decisions D1）。
   */
  focusNext(): void {
    const store = this.#store;
    if (store.queue.length === 0) {
      this.#view.toast("未処理の知らせはありません。");
      return;
    }
    let dropped = false;
    while (store.queue.length > 0) {
      const head = store.queue[0]!;
      if (this.#focusEntry(head.paneId)) {
        this.#drop(head.key);
        break;
      }
      this.#drop(head.key); // 対象が消えている
      dropped = true;
    }
    // **捨てた件があれば必ず知らせる**（AC11：「その旨を出して次へ進む」）。
    // 出さないと、**1 回押しただけでトーストが何枚も消えて別の pane に着いた**ように見える。
    // 何件捨てても 1 回だけ（捨てた件数ぶん繰り返さない）。
    if (dropped) this.#view.toast(CLOSED_TARGET_MESSAGE);
  }

  /**
   * OS 通知のクリック（AC15）。**先頭ではなく、その 1 件**を消費する——
   * `tag` が pane id なので複数同時に出ており、先頭を消費すると別の pane へ飛ぶ。
   */
  focusNotification(key: NotifyKey): void {
    const entry = this.#store.queue.find((q) => q.key === key);
    if (!entry) return; // 既に片付けられている
    if (!this.#focusEntry(entry.paneId)) this.#view.toast(CLOSED_TARGET_MESSAGE);
    this.#drop(key);
  }

  /**
   * その pane へ移る（既存の 3 手）。対象が引けなければ `false`。
   *
   * **ダイアログが開いている間は `focusPane` を呼ばない**——既存の規則（D97。`StoreAdapter.applyViewRepair`
   * と同じ形）で、直接変えると**その pane の `TerminalPane` が `term.focus()` して入力欄からフォーカスを奪う**。
   * `prefix+o` は `main.ts` の window keydown が遮断するのでここへ来ないが、
   * **OS 通知のクリックは外から来る非同期の経路なので、その守りが効かない**——
   * 素通しすると、閉じたときに `closeDialog` が焦点を開く前の pane へ戻し、
   * **表示中の tab に含まれない pane が焦点のまま**残る（モバイルは焦点の pane を描くので食い違う）。
   */
  #focusEntry(paneId: string): boolean {
    const session = this.#session;
    const view = this.#view;
    const pane = session.panes.get(paneId);
    const tab = pane ? session.tabs.get(pane.tabId) : undefined;
    if (!pane || !tab) return false;
    view.setView(tab.workspaceId, tab.id);
    if (view.openDialog !== null) view.retargetPreDialogFocus(paneId);
    else view.focusPane(paneId);
    this.#opts.onFocusPane?.(paneId);
    return true;
  }

  /**
   * 案内の印を立てる（AC5・US8）。**その場では出さない**のが原則——最初の出来事は定義上
   * 「フォーカスが無いとき」に起きるのが普通で、そこで出すと**誰も見ていないタブに出て消費される**。
   * ただし**既にフォーカスがあるならその場で出す**（decisions D3）——表の (b) では
   * `window` の `focus` がもう発火しないので、これが無いと離れて戻るまで出ない。
   */
  #armHint(): void {
    const store = this.#store;
    if (store.hintDone) return;
    if (!store.hintPending) store.setHintPending(true);
    if ((this.#opts.hasFocus ?? (() => document.hasFocus()))()) this.showHintIfDue();
  }

  /** ウィンドウにフォーカスが戻ったとき（`main.ts` が `window` の `focus` に繋ぐ）。 */
  showHintIfDue(): void {
    const store = this.#store;
    if (store.hintDone || !store.hintPending) return;
    // **重ねない**。持たないと、押さずに放置したままフォーカスのたびに 1 枚ずつ増える（`sticky` なので消えない）。
    if (store.hintToastId != null && this.#view.toasts.some((t) => t.id === store.hintToastId)) return;

    store.hintToastId = this.#view.toast(hintMessage(this.#settings.keymap.hintFor("settings")), {
      kind: "sticky",
      wrap: true, // 問いかけ＋ボタン 2 つ。畳むと狭い画面で読めない
      actions: [
        { label: "許可する", run: () => void this.#acceptHint() },
        { label: "あとで", run: () => this.#consumeHint() },
      ],
    });
  }

  /** 出ている案内の文を、現在の割り当てで書き直す（出ていなければ何もしない）。 */
  #refreshHintMessage(): void {
    const id = this.#store.hintToastId;
    if (id == null) return;
    const toast = this.#view.toasts.find((t) => t.id === id);
    if (toast !== undefined) toast.message = hintMessage(this.#settings.keymap.hintFor("settings"));
  }

  /** 案内が（ボタンでも本体のクリックでも）消えたら消費する。`syncToasts` から呼ぶ。 */
  #syncHint(): void {
    const store = this.#store;
    if (store.hintToastId == null) return;
    if (this.#view.toasts.some((t) => t.id === store.hintToastId)) return;
    // 消したのは「いまは要らない」という反応——次のフォーカスでまた出すのは催促になる。
    this.#consumeHint();
  }

  async #acceptHint(): Promise<void> {
    // **どちらも利用者の操作の中**（AC7・自動再生の解除）。
    this.#unlockSound();
    const p = await this.#opts.desktop.request();
    if (p === "granted") this.#store.setPrefs({ desktop: true });
    this.#consumeHint();
  }

  #consumeHint(): void {
    const store = this.#store;
    store.setHintDone(true);
    store.setHintPending(false);
    if (store.hintToastId != null) this.#view.dismissToast(store.hintToastId);
    store.hintToastId = null;
  }

  /**
   * 案内に答えた扱いにする（20260926-settings-onboarding の AC9）。はじめの案内を確定したとき——通知の選択は済んでいるので、
   * 同じことを問う案内をあとから出さない。出ていれば消す。
   */
  markHintAnswered(): void {
    this.#consumeHint();
  }

  /** 設定ダイアログが許可の状態を出すために引く（AC8・AC12）。 */
  desktopPermission(): DesktopPermission {
    return this.#opts.desktop.permission();
  }

  /** **利用者の操作から呼ぶこと**（AC7）。設定で `default` の切り替えを押したときだけ。 */
  requestDesktopPermission(): Promise<DesktopPermission> {
    return this.#opts.desktop.request();
  }

  /** 設定で音を「入」にした瞬間＝利用者の操作なので、ここで自動再生を解除しておく。 */
  unlockSound(): void {
    this.#unlockSound();
  }

  /**
   * **利用者が画面のどこかを操作した**（`main.ts` が `pointerdown`・`pointerup`・`keydown` に繋ぐ）。
   * **`pointerup` を落とさない**——タッチとペンは `pointerdown` では活性化しない（理由は `main.ts` 側）。
   *
   * 自動再生の制限は**ページを読み込むたびに**掛かり直すので、設定を「入」にした操作は
   * 読み込み直した後には効かない。ここが無いと、**読み込み直してから何も操作しないうちに
   * 最初の知らせが来た利用者**は、設定を入れ直すまで永久に鳴らないのに、設定の注記は
   * 「どこかを押すと鳴るようになります」と言う（PR レビュー（人間）の指摘）。
   *
   * **「切」の人の操作では `AudioContext` を作らない**——鳴らすつもりが無い利用者に
   * 音の資源を持たせない。「入」にした瞬間は `unlockSound` が別に解除する。
   */
  noteUserGesture(): void {
    if (!this.#store.prefs.sound) return;
    this.#unlockSound(); // 既に `running` なら `ToneSound` 側で素通りする
  }

  /**
   * **解除の唯一の出口**。解除できたら「鳴らせませんでした」の印を下ろす。
   *
   * 下ろさないと、**解除できているのに設定は「どこかを押すと鳴るようになります」と言い続ける**
   * ——設定を開くには押す（`prefix+s` でもメニューでも）必要があるので、**開いた時点では必ず解除済み**。
   * 利用者は「押しても変わらない」と見て、設定を入れ直す元の行動に戻ってしまう（タスク点検 T24 の指摘）。
   */
  #unlockSound(): void {
    void this.#opts.sound
      .unlock()
      .then((ok) => {
        if (ok) this.#store.soundBlocked = false;
      })
      .catch(() => undefined); // 契約上 reject しないが、握らないと差し替えた実装で未処理の拒否になる
  }

  #cleanup(toastId: number | null, paneId: string): void {
    if (toastId != null) this.#view.dismissToast(toastId);
    this.#opts.desktop.closeByTag(paneId);
  }
}
