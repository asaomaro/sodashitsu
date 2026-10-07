# 仕様: エージェント連携のフックの設定を、現行の公式文書に合わせ直す（Grok CLI・Devin CLI・Qoder CLI）

## 概要

`AgentIntegrationInstaller` の `HOOK_SPECS` を、research.md（2026-10-07 に原文で取った公式文書）に合わせて
3 か所直す（grok の形・devin の場所と包み方・qodercli の追加）。以前の版が入れたエントリを見つけて片づける
ために、`HookSpec` に「古い形・古い場所」（`legacy`）を持たせ、status / install / uninstall がそれも見る。
あわせて、報告の受け口が連携の kind の全部を受けるようにする（research X1）。

## 設計方針

- **kind ごとの違いは `HOOK_SPECS` の中だけに置く**（20260923-other-agents-session-resume の設計のまま）。
  読み書き・アトミックな書き出し・「配列でない値には書かない」は共通のまま使う。
- **古いものは「更新が必要」に乗せる**: 既にある `needsUpdate` →［更新］（＝ `install`）の道（20261004-subagent-display）
  をそのまま使う。画面・プロトコルに新しい項目を足さない。
- **status は書かない。install・uninstall だけが片づける**（既存の決まり）。
- **解釈できないファイルは書き換えない**（既存の決まり）。コメントを取り除いて読み、書き戻す方式は取らない
  （利用者のコメントが消える。decisions D3）。

### 検討した代替案

- Grok を平らな形のまま残す: 文書に平らな形の記述が無く、読まれる根拠が無い。採らない（decisions D1）。
- Grok に両方の形のエントリを書く: 両方が読まれる版では報告が 2 回になるだけだが、片方が読めない形として
  ファイルごと捨てられる恐れがあり、確かめる実機も無い。採らない。
- Devin で古い `hooks.json` も書き続ける: 読まれる根拠の無いファイルを増やすだけ。採らない（decisions D2）。
- 連携の kind の一覧を protocol に実行時の定数として出す: `model.ts` は型だけのファイル。サーバの中では
  `HOOK_SPECS`（`Record<AgentIntegrationKind, HookSpec>` で型が漏れを捕まえる）のキーを正とする。web・tui の
  一覧は表示名を持つ別の表なので、そのまま 1 行ずつ足す。

## 対象範囲

| ファイル | 変更 |
|---|---|
| `packages/protocol/src/model.ts`・`messages.ts` | `AgentIntegrationKind`・zod の列挙に `qodercli` |
| `packages/server/src/agent/AgentIntegrationInstaller.ts` | `HookSpec` に `legacy`・`altBinNames`・`unparsableHint`。grok・devin を直し、qodercli を足す。status / install / uninstall が古いものを見る。`AGENT_INTEGRATION_KINDS`・`isAgentIntegrationKind` を出す |
| `packages/server/src/agent/AgentIntegrationService.ts` | `KINDS` を `AGENT_INTEGRATION_KINDS` に替える |
| `packages/server/src/agent/resumeCommand.ts` | `qodercli` → `qoder --resume <id>` |
| `packages/server/src/composeServer.ts` | 受け口の条件を `isAgentIntegrationKind` に |
| `packages/web/src/components/SettingsDialog.vue`・`packages/tui/src/settings/sections.ts` | 一覧の末尾に「Qoder CLI」。［更新］の説明・既定の知らせの「Claude Code」の文は claude の行だけにし、ほかの行は kind によらない文にする |
| 上の各テスト・kind を数え上げているテスト | 追加・一覧に `qodercli` |
| `docs/verification.md`・`docs/herdr-parity.md`・`docs/migrate-from-wtm.md`・`.aidev/backlog/product-roadmap.md` | 場所・形・kind・実機未確認の明記 |

`packages/server/assets/agent-hook-report.cjs` は変えない（`session_id`・`sessionId` の両方を既に受ける。
`argv[2]` の kind をそのまま送る）。`scripts/migrate-from-wtm.sh`（旧名からの一度きりの移行）も変えない
（古い場所の名前を替えるだけ。替えた後は、この work の「更新が必要」に乗る）。

## 依拠する既存の事実

- `status()` は `{cliDetected, installed, needsUpdate}` を返し、web・tui は `needsUpdate` で［更新］を出して
  `install` を呼ぶ（`SettingsDialog.vue` の `updateAgentIntegration`・`sections.ts`）。`install` の結果の
  `message` が null でなければ、それがそのまま知らせに出る。
- `uninstall` は、追加のエントリを持つ kind（claude）ではスクリプトを何もしない中身に替え、ほかは消す
  （`AgentIntegrationInstaller.ts` の `uninstall` の末尾）。
- ［更新］の文は Claude Code 専用のものが 2 か所にある: web の既定の知らせ（`SettingsDialog.vue` の
  `updateAgentIntegration`。`message` が null のとき）と、端末版の更新の行の `note`（`sections.ts` の `agentSection`）。
- `AgentReportSocket` は kind を見ずに通す。pane に記録するかは `composeServer.ts` の 1 か所が決める。
- `resumeCommandFor(kind, sessionId)` は、知らない kind・危ない文字の id で `undefined`（`resumeCommand.ts`）。
- 検出（`agents.ts`）の Qoder の kind は `qodercli`。既存の 8 つの連携の kind は、検出の kind と同じ名前。

## インターフェース / データ構造

### `HookSpec` に足す項目

```ts
interface LegacyHookSpec {
  configFile(env: NodeJS.ProcessEnv, home: string): string;
  hooksDir(env: NodeJS.ProcessEnv, home: string): string;
  entriesPath: string[];
  isOurs(entry: unknown): boolean;
}

interface HookSpec {
  // …既存の項目…
  /** `binName` のほかに、CLI の検出に使う名前。 */
  altBinNames?: string[];
  /** 以前の版が入れた形・場所。status は「更新が必要」、install は入れ直して除く、uninstall は一緒に除く。 */
  legacy?: LegacyHookSpec[];
  /** 設定ファイルを解釈できなかったときに、知らせに足す一言。 */
  unparsableHint?: string;
}
```

### 3 つの `HookSpec`

| kind | configFile | hooksDir | entriesPath | エントリ | isOurs | legacy |
|---|---|---|---|---|---|---|
| grok | `~/.grok/hooks/soda-agent-report.json`（変えない） | `~/.grok/hooks`（変えない） | `hooks.SessionStart` | `{hooks:[{type:"command",command,timeout:10}]}` | 入れ子 | 同じファイル・同じ経路の、平らな形（直下の `command`） |
| devin | `<devin の設定の場所>/config.json` | `<同>/hooks` | `hooks.SessionStart` | `{matcher:"",hooks:[{type:"command",command,timeout:10}]}`（変えない） | 入れ子 | `($DEVIN_CONFIG_DIR \|\| ~/.devin)/hooks.json` の `SessionStart`（入れ子）。スクリプトは `…/hooks/` |
| qodercli | `($QODER_CONFIG_DIR \|\| ~/.qoder)/settings.json` | `<同>/hooks` | `hooks.SessionStart` | `{hooks:[{type:"command",command,async:true}]}` | 入れ子 | なし |

- `<devin の設定の場所>` = `devinUserConfigDir(env, home, platform)`:
  `platform === "win32"` で `env.APPDATA` があれば `<APPDATA>\devin`、ほかは `<home>/.config/devin`
  （research D1・D6。`XDG_CONFIG_HOME` は見ない。decisions D2）。`HookSpec.configFile(env, home)` の形は変えず、
  devin の `configFile`・`hooksDir` の中で `devinUserConfigDir(env, home)`（`platform` は既定の `process.platform`）を
  呼ぶ。Windows の場合は、この関数を出して（export）`platform` を渡す単体テストで確かめる（installer を通した
  確かめは、動かしている OS の場合だけ）。
- devin の `unparsableHint`: 「Devin CLI の設定はコメントつきの JSON を許しますが、本製品はコメントの入った
  ファイルを書き換えられません」。
- qodercli: `binName: "qoder"`・`altBinNames: ["qodercli"]`（research Q-9）。コマンドの名乗りは
  `node "<スクリプト>" qodercli`。
- grok・qodercli のエントリに `matcher` は書かない（research G3・Q-3・Q-4。decisions D1・D4）。

### 受け口

```ts
// AgentIntegrationInstaller.ts
export const AGENT_INTEGRATION_KINDS: readonly AgentIntegrationKind[];   // HOOK_SPECS のキー
export function isAgentIntegrationKind(kind: string): kind is AgentIntegrationKind;  // Object.hasOwn
```

`composeServer.ts`: `report.type === "session"` のとき `isAgentIntegrationKind(report.kind)` なら
`session.reportAgentSession(...)`。サブエージェントの報告は今までどおり claude だけ。

## 振る舞いの詳細

「古いものがある」＝ `legacy` のどれかについて、そのファイルが JSON のオブジェクトとして読めて、
その経路の配列に `legacy.isOurs` のエントリがある（読めないファイル・無いファイルは「無い」）。

### status

- `installed` = 今の場所に本製品のエントリがある **または** 古いものがある。
- `needsUpdate` = 今の設定ファイルが読めて、書く先の経路が「配列でない値」でなく、
  （古いものがある **または** 既存の判定〔追加のエントリの不足・スクリプトの古さ。今の場所に導入済みのとき〕）。
  今の設定ファイルが読めない・形が違うときは、押しても直らないので出さない（既存の決まり）。

### install

1. 今の設定ファイルを読む。解釈できなければ `ok:false`（`unparsableHint` を足す）。**何も変えない**。
2. 書く先の経路が配列でない値なら `ok:false`。**何も変えない**（既存）。
3. 今の場所に導入済みで、古いものが無く、既存の `needsUpdate` も false なら「既に導入済みです」（既存）。
4. スクリプトを写す。今の設定の中で、**同じファイルにある古いエントリを除いてから**、足りない経路にエントリを
   足す。アトミックに書く。
5. **別のファイルにある古いもの**を片づける: そのファイルから本製品のエントリを除く（空になった経路はキーごと
   消す）。その結果ファイルが空のオブジェクト `{}` になれば、ファイルを消す。ならなければ書き戻す。古い
   スクリプト（古い `hooksDir` が今の `hooksDir` と違うとき）を消す。
6. 古いものがあったとき（4 で同じファイルから除いた場合〔Grok〕も、5 で別のファイルを片づけた場合〔Devin〕も）は
   `message` に「古い形のフックを、現行の形に入れ直しました」。ほかは null。

4 → 5 の順（新しいほうを先に書く）にするのは、途中で失敗しても、導入済みの状態が失われないようにするため。

### uninstall

1. 別のファイルにある古いものを片づける（install の 5 と同じ）。
2. 今の設定ファイルを読む。解釈できなければ、今の設定ファイルは書き換えない。1 で片づけたものがあれば
   `{ok:true, message:null}`（この後の status は `installed:false` になり、画面と合う）、無ければ `ok:false`
   （`unparsableHint` を足す）。
3. 今の設定から、今の形のエントリ（全経路）と、同じファイルにある古いエントリを除く（空になった経路は
   キーごと消す。既存）。
4. どこにも無ければ「未導入でした」。今の設定から除いたときは、書き出し、スクリプトを消す
   （追加のエントリを持つ kind は何もしない中身に替える。既存）。

### 報告と再開

- hook スクリプトは、Qoder の `session_id`・Grok の `sessionId`・Devin の `session_id` をそのまま送る（変更なし）。
- 受け口は連携の kind なら pane に記録し、`session.json` に保存される（既存の経路）。
- 復元のとき `resumeCommandFor("qodercli", id)` → `qoder --resume <id>`。

## ドメイン固有の考慮

- **Devin の本体の設定に書く**: `config.json` は利用者の設定の本体。既存の非破壊のマージ（`setPath`）で
  `hooks.SessionStart` だけを足す。ほかのキーの値・順は保つ。字下げは 2 つの空白に揃う（既存の kind と同じ）。
- **Qoder の `async: true`**: 文書は「results are injected as additional context in the next model turn」と書く。
  hook スクリプトは stdout に何も書かないので、足されるものは無い。
- **Qoder の `matcher` を省く**: `clear`・`new`・`compact` でも報告する。報告は同じ pane の記録の上書きなので、
  何度届いてもよい。
- **安全**: 受け口を広げても、記録されるのは kind（`HOOK_SPECS` のキーだけ）と id。再開のコマンドに使う id は
  `resumeCommandFor` が安全な文字だけに絞る（既存）。打たれるコマンドの名前は表にある固定の文字列だけ。

## エラー処理 / 異常系

| 場合 | 動き |
|---|---|
| 今の設定ファイルが JSON として読めない（Devin のコメントつきを含む） | 今の設定ファイルは書き換えない。install は `ok:false`（古いものにも触らない）。uninstall は、別のファイルの古いものを片づけたなら `ok:true`、何も無ければ `ok:false`。status は `needsUpdate:false` |
| 古いファイルが読めない・JSON でない | 「古いものは無い」として扱う（触らない） |
| 古いファイルに利用者のほかのエントリがある | 本製品のエントリだけ除いて書き戻す。ファイルは消さない |
| `APPDATA` の無い Windows | `<home>/.config/devin` に落ちる（文書に定めが無い。実機未確認） |

## 受け入れ基準との対応

- AC1・AC2: `AgentIntegrationInstaller.test.ts`（grok の形・平らな形からの status / install / uninstall）。
  - AC1: 入力は一時の `home` に書かれた `~/.grok/hooks/soda-agent-report.json`。
  - AC2: 入力はテストが先に置く平らな形のエントリ。
- AC3・AC4・AC5: 同（devin の場所と形・Windows の場所・古い `hooks.json` からの移行・コメントつき）。
  - AC3: 入力は一時の `home`・`env.APPDATA`・`platform`。
  - AC4: 入力はテストが先に置く古い `hooks.json`（`$DEVIN_CONFIG_DIR` と `~/.devin` の両方の場合）。
  - AC5: 入力はテストが先に置くコメントつきの `config.json`。
- AC6: 同（qodercli の導入・解除・`QODER_CONFIG_DIR`・`PATH` に置いた偽の `qoder`／`qodercli`）＋ `resumeCommand.test.ts`。
- AC7: `composeServer.subagents.integration.test.ts`（実物の受け口へ 1 行の電文を送る）。直す前のコードで落ちることを確かめる。
- AC8: 既存の単体テスト（中身を変えない）。
- AC-I1: `SettingsDialog.test.ts`・tui の設定のテスト（一覧に Qoder CLI）。
- AC-I2: `AgentIntegrationInstaller.test.ts`（`needsUpdate` と、［更新］＝ install の結果の `message`）。画面は既存の `needsUpdate` の表示を使い、［更新］の説明・既定の知らせの文だけを claude とそれ以外で分ける（入力は一覧の `value`。`SettingsDialog.test.ts`・tui の設定のテストで、claude 以外の行の文に「Claude Code」が無いことを見る）。
- AC9: docs の差分の点検。
- AC10: `pnpm build`・`pnpm typecheck`・`pnpm test`。
