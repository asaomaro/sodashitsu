# タスク: エージェント連携のフックの設定を、現行の公式文書に合わせ直す（Grok CLI・Devin CLI・Qoder CLI）

> **引き継ぎ**: 上流の文書（research → requirements → design → tasks）までを書いたセッションと、実装するセッションは別。
> 製品コード・テスト・docs は、この文書を書いた時点では**何も変えていない**（T1 から未着手）。
> 実装する人は、この tasks.md と design.md「インターフェース / データ構造」「振る舞いの詳細」を読めば足りるように書いた。
> 公式文書の引用（項目名・場所の根拠）は research.md の G・Q・D・X。

## 環境

- Node 24: `export PATH="$HOME/.local/share/fnm/node-versions/v24.15.0/installation/bin:$PATH"`。
  pnpm は `/tmp/pnpmbin/pnpm`（無ければ `corepack pnpm`）。worktree では `pnpm install --frozen-lockfile` 済み。
- 1 ファイルのテスト: `pnpm vitest run packages/server/src/agent/AgentIntegrationInstaller.test.ts`。
- 動いている 7780 番のサーバ、利用者の実際の `~/.grok`・`~/.qoder`・`~/.devin`・`~/.config/devin` には触らない。
  installer のテストは、コンストラクタの第 2・第 3 引数（`env`・`home`）に一時ディレクトリを渡す（既存のテストと同じ）。
- 実機（`grok`・`qoder`・`qodercli`・`devin`）はこの環境に無い。「動く」と書かない。

## 実装方針

design.md の順に、下から積む。1 タスク 1 コミット。コミットの文は日本語、末尾に次の 2 行。

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FhqZ3JdDWbazPQNXe3U53f
```

1. 古いものを見つけて片づける仕組み（`legacy`）と grok（同じファイルの中の古い形）
2. devin（別のファイルの古い場所）
3. qodercli（protocol → server → web・tui）
4. 受け口（research X1）
5. docs
6. 全体の確認

## 作業順序と依存関係

T1 → T2 → T3 → T4 → T5 → T6（直列）。T4 は T3 の `isAgentIntegrationKind` に `qodercli` が入っていることを使う。

## リスク / 留意点

- research.md の引用と**逐語で**突き合わせて書く（エントリの項目名・場所）。
- 既存の kind（claude・codex・cursor・copilot・droid・qwen）の単体テストは、kind の一覧を数え上げる箇所を除いて
  変えない（AC8）。変えたくなったら設計から外れている合図。grok・devin の既存のテスト（下に挙げるもの）は
  新しい形に書き換える。
- `uninstall` の既存の細かい決まりを保つ: 自分のエントリを除いて空になった経路はキーごと消す／自分のエントリが
  無かった経路は触らない／どの経路にも無ければ「未導入でした」／`extraEntries` を持つ kind はスクリプトを
  何もしない中身に替え、ほかは消す。
- `status` は何も書かない。

## 独立点検（`aidev taskcheck`）を掛けるタスク

AGENTS.md「点検とテストの掛け方」に従い、壊れやすいタスクだけに掛ける。

- **掛ける: T1・T2**（利用者の設定ファイルの書き換え・削除。保存と移行）。T2 の後にまとめて 1 回
  （`aidev taskcheck start T2 --mode delegated`）。
- 掛けない（全タスクの後の全体の点検にまとめる）: T3・T4・T5・T6。T3 は protocol の列挙に値を 1 つ足すが、
  漏れは `Record<AgentIntegrationKind, …>` の型が捕まえる。T4 は信頼できない入力の受け口の条件を変えるが、
  通すのは `HOOK_SPECS` のキーだけで、id の絞り込み（`resumeCommandFor`）は変えず、実物の受け口を通す回帰テスト
  （直す前で落ちることを確かめる）を足す。どちらも最後の独立レビューで見る。
- 最後の独立レビュー（差分全体。別のコンテキスト）は省かない。

## テスト方針

- 単体: `AgentIntegrationInstaller.test.ts`（書いた JSON を文書の例の形と突き合わせる・移行・断る場合）、
  `resumeCommand.test.ts`。
- 統合: `composeServer.subagents.integration.test.ts`（実物の受け口。AC7）。
  **直した 1 行だけを元に戻して落ちることを確かめ、生の出力を test-result.md に貼り、戻した後に `git diff` が
  空であることを確かめる**（`.aidev/conventions/regression-negative-control.md`）。
- 全体: `pnpm build`・`pnpm typecheck`・`pnpm test`。結果はそのまま報告する。
- 実機: 無い。E2E は足さない（設定画面の一覧の 1 行は単体テストで見る）。

## タスク

- [x] T1: `HookSpec` に `legacy` を足し、status / install / uninstall が古いものを見るようにする。grok を入れ子に変える。**タスク点検あり（T2 とまとめて）**。
      対象: `packages/server/src/agent/AgentIntegrationInstaller.ts`・`AgentIntegrationInstaller.test.ts` / 根拠: research G2・G3、design「`HookSpec` に足す項目」「振る舞いの詳細」、decisions D1
      依存: なし
      AC: AC1, AC2, AC8, AC-I2
- [x] T2: devin の書き先を `~/.config/devin/config.json`（Windows は `%APPDATA%\devin\config.json`）の `hooks` キーに変え、古い `hooks.json` を片づける。コメントつきは断る。**タスク点検あり**。
      対象: `packages/server/src/agent/AgentIntegrationInstaller.ts`・`AgentIntegrationInstaller.test.ts` / 根拠: research D1・D2・D5・D6、decisions D2・D3
      依存: T1
      AC: AC3, AC4, AC5, AC8, AC-I2
- [x] T3: 連携の kind に `qodercli` を足す（protocol・installer・service・再開のコマンド・web・tui・kind を数え上げるテスト）。
      対象: `packages/protocol/src/model.ts`・`messages.ts`・`messages.test.ts`、`packages/server/src/agent/AgentIntegrationInstaller.ts`・`AgentIntegrationService.ts`・`resumeCommand.ts` と各テスト、`packages/server/src/session/SessionService.test.ts`、`packages/web/src/components/SettingsDialog.vue` と web の各テスト、`packages/tui/src/settings/sections.ts` と tui のテスト / 根拠: research Q-1〜Q-9、decisions D4
      依存: T2
      AC: AC6, AC8, AC-I1
- [ ] T4: 受け口が連携の kind の全部の報告を pane に記録する。
      対象: `packages/server/src/composeServer.ts`・`composeServer.subagents.integration.test.ts` / 根拠: research X1、decisions D5
      依存: T3
      AC: AC7
- [ ] T5: docs を合わせる。
      対象: `docs/verification.md`・`docs/herdr-parity.md`・`docs/migrate-from-wtm.md`・`.aidev/backlog/product-roadmap.md` / 根拠: research 全体
      依存: T4
      AC: AC9
- [ ] T6: 全体の確認（`pnpm build`・`pnpm typecheck`・`pnpm test`）と test-result.md。
      対象: `.aidev/works/20261007-agent-hook-drift/test-result.md`
      依存: T5
      AC: AC10

## タスクごとの細目

### T1（legacy の仕組み＋ grok）

**コード（`AgentIntegrationInstaller.ts`）**

1. `LegacyHookSpec`（`configFile`・`hooksDir`・`entriesPath`・`isOurs`）を足し、`HookSpec` に
   `altBinNames?: string[]`・`legacy?: LegacyHookSpec[]`・`unparsableHint?: string` を足す（design の型のとおり）。
2. `isOnPath` を、名前の配列を受ける形にする（`[spec.binName, ...(spec.altBinNames ?? [])]`）。
3. 補助を足す。
   - `removeOurs(root, path, isOurs)` → `{root, found}`: 経路から `isOurs` のエントリを除く。除いて空なら
     `deletePath`、残れば `setPath`。自分のエントリが無ければ `root` をそのまま返す（`found:false`）。
     いまの `uninstall` のループの中身を切り出したもの。
   - `legacyHits(spec)`: `spec.legacy` のそれぞれについて `readJsonObject(file)` が ok で、
     `getPath(root, entriesPath).some(isOurs)` のものを `{legacy, file, root}` で返す。
     **ファイルが無い（`readJsonObject` は `{}` を返す）・読めない・JSON でないものは入らない。**
   - `removeLegacyFile(spec, hit)`: `removeOurs` の結果が `Object.keys(root).length === 0` なら
     `rm(hit.file, {force:true})`、ほかは `writeFileAtomic`。古い `hooksDir` が今の `hooksDir` と違えば、
     古い場所の `soda-agent-report.cjs` を `rm(..., {force:true})`。
   - `unparsable(spec, configFile)`: `{ok:false, message: "設定ファイルを解釈できませんでした（<path>）" + (hint ? "。" + hint : "")}`。
     hint の無い kind の文は**今と 1 字も変えない**（既存のテストが文を見ている場合がある）。
4. `status`: design「status」のとおり。
   `current` = 今のファイルが読めて今の形のエントリがある。`installed = current || legacy.length > 0`。
   `fixable` = 今のファイルが読めて、書く先（`entriesPath` と `extraEntries`）のどれも `pathShape` が `"invalid"` でない。
   `needsUpdate = fixable && (legacy.length > 0 || (current && 既存の needsUpdate(spec, root)))`。
5. `install`: design「install」の 1〜6 の順。同じファイルの古いエントリは、足す前に `updated` から除く。
   別のファイルの古いものは、今のファイルを書いた**後**に `removeLegacyFile`。古いものを片づけたら
   `message: "古い形のフックを、現行の形に入れ直しました"`。「既に導入済みです」の条件に `legacy.length === 0` を足す。
6. `uninstall`: design「uninstall」の 1〜4 の順。除く対象は「今の経路（全部）× `spec.isOurs`」と
   「同じファイルの `legacy` の経路 × `legacy.isOurs`」。別のファイルの古いものだけを除いたときは
   `{ok:true, message:null}`（「未導入でした」にしない。スクリプトの後始末は `removeLegacyFile` が済ませている）。
7. grok の `HookSpec`:
   - `buildEntry` → `{ hooks: [{ type: "command", command: hookCommand(scriptPath, kind), timeout: 10 }] }`
     （**`matcher` を書かない**）。
   - `isOurs: isOursNested`。
   - `legacy: [{ configFile・hooksDir は今と同じ, entriesPath: ["hooks","SessionStart"], isOurs: isOursField("command") }]`。
   - `configFile`・`hooksDir`・`binName`・`entriesPath` は変えない。

**テスト（`AgentIntegrationInstaller.test.ts`）**

- 書き換える（既存）: 「grok: writes a dedicated file with a flat entry …」→ 入れ子を確かめる
  （`entry.hooks` が長さ 1、`entry.hooks[0]` が `{type:"command", command: <soda-agent-report.cjs と grok を含む>, timeout:10}`、
  `entry.matcher`・`entry.command`・`entry.type` が `undefined`。ほかの `*.json` が変わらないことは残す）。
- 足す（AC2）。先に置く平らな形は、以前の版が書いた形そのもの:
  `{hooks:{SessionStart:[{matcher:"", type:"command", command:'node "<home>/.grok/hooks/soda-agent-report.cjs" grok', timeout:10}]}}`。
  - status → `{installed:true, needsUpdate:true}`。status の後、ファイルの中身が 1 バイトも変わらない。
  - install → `{ok:true, message:"古い形のフックを、現行の形に入れ直しました"}`。`hooks.SessionStart` が長さ 1 で入れ子。
    status → `needsUpdate:false`。もう一度 install → 「既に導入済みです」。
  - 平らな形のままの状態から uninstall → `{ok:true, message:null}`、`hooks` に `SessionStart` が無い、スクリプトが無い。
- 足す（AC8）: 「ほかの 7 種は追加のエントリを持たず、needsUpdate は常に false」は、中身を変えずに通ること
  （新しく入れた grok・devin は古いものを持たないので false のまま）。

**確かめ方**: 上のテスト＋既存の installer のテスト全部。

### T2（devin）

**コード（`AgentIntegrationInstaller.ts`）**

1. `export function devinUserConfigDir(env, home, platform = process.platform): string` を足す。
   `platform === "win32" && env.APPDATA` なら `join(env.APPDATA, "devin")`、ほかは `join(home, ".config", "devin")`。
   **`XDG_CONFIG_HOME`・`DEVIN_CONFIG_DIR` は見ない**（decisions D2）。
2. devin の `HookSpec`:
   - `configFile` → `join(devinUserConfigDir(env, home), "config.json")`。
   - `hooksDir` → `join(devinUserConfigDir(env, home), "hooks")`。
   - `entriesPath: ["hooks", "SessionStart"]`。
   - `buildEntry: nestedTimeoutEntry`・`isOurs: isOursNested`・`binName: "devin"` は変えない。
   - `unparsableHint: "Devin CLI の設定はコメントつきの JSON を許しますが、本製品はコメントの入ったファイルを書き換えられません"`。
   - `legacy: [{ configFile: join(env.DEVIN_CONFIG_DIR || join(home, ".devin"), "hooks.json"), hooksDir: join(同, "hooks"), entriesPath: ["SessionStart"], isOurs: isOursNested }]`。
   - 「推測値（decisions D4）」のコメントを、research D1・D2 を指すものに替える。
3. droid は変えない（`~/.factory/hooks.json`・トップレベル直下。今回の疑いの外）。

**テスト（`AgentIntegrationInstaller.test.ts`）**

- 書き換える（既存）: 「devin: installs at a top-level SessionStart key …」→ `<home>/.config/devin/config.json` の
  `hooks.SessionStart[0]` が `{matcher:"", hooks:[{type:"command", command, timeout:10}]}`、`async` が無い。
  スクリプトが `<home>/.config/devin/hooks/soda-agent-report.cjs` にある。uninstall で消える。
- 書き換える（既存）: 「devin: honors DEVIN_CONFIG_DIR override」→ **新しい導入は `DEVIN_CONFIG_DIR` を見ない**
  （`DEVIN_CONFIG_DIR` を渡して install しても、`<home>/.config/devin/config.json` に書かれ、
  `DEVIN_CONFIG_DIR` のフォルダには何も作られない）。
- 足す（AC3）:
  - 既存の `config.json`（`{agent:{model:"x"}, permissions:{allow:["a"]}, hooks:{PreToolUse:[{matcher:"exec",hooks:[{type:"command",command:"./mine.sh"}]}]}}`）
    に install → ほかのキーが `toEqual` で変わらず、`hooks.SessionStart` が長さ 1。uninstall → 元の中身に `toEqual` で戻る。
  - `devinUserConfigDir({APPDATA:"/appdata"}, "/home/u", "win32")` が `join("/appdata","devin")`、
    `devinUserConfigDir({}, "/home/u", "win32")`・`devinUserConfigDir({APPDATA:"/appdata"}, "/home/u", "linux")` が
    `join("/home/u",".config","devin")`。
- 足す（AC4）。先に置く古い形は、以前の版が書いた形そのもの:
  `<古い場所>/hooks.json` = `{SessionStart:[{matcher:"", hooks:[{type:"command", command:'node "<古い場所>/hooks/soda-agent-report.cjs" devin', timeout:10}]}]}` と、
  `<古い場所>/hooks/soda-agent-report.cjs`。`<古い場所>` は `<home>/.devin` の場合と、`DEVIN_CONFIG_DIR` を渡した場合の 2 通り。
  - status → `{installed:true, needsUpdate:true}`。古いファイルは変わらない。
  - install → `message` が「古い形のフックを、現行の形に入れ直しました」。新しい場所にエントリ 1 つ。
    古い `hooks.json` と古いスクリプトが無い。status → `{installed:true, needsUpdate:false}`。
  - 古い `hooks.json` に利用者のほかのエントリ（`PreToolUse` と、`SessionStart` の中の別のエントリ）がある場合:
    install の後、古いファイルにそれらだけが `toEqual` で残り、ファイルは消えない。
  - 古い場所だけにある状態から uninstall → `{ok:true, message:null}`。古い `hooks.json`・古いスクリプトが無い。
    新しい `config.json` は作られない。status → `installed:false`。
  - 新旧の両方にある状態から uninstall → 両方から消える。
- 足す（AC5）: `config.json` が `'{\n  // comment\n  "agent": {}\n}\n'`、古い `hooks.json` に本製品のエントリ。
  - status → `{installed:true, needsUpdate:false}`（押しても直らない「更新が必要」を出さない）。
  - install → `ok:false`、`message` に「コメント」を含む。`config.json` の中身が文字列として同じ。古い `hooks.json`・
    古いスクリプトも変わらない。新しい場所の `hooks/` にスクリプトが作られない。
- 既存の「uninstall leaves other kinds' entries untouched …（droid と devin）」は中身を変えずに通ること。

**確かめ方**: 上のテスト＋既存の installer のテスト全部。この後に T1・T2 の独立点検（別のコンテキスト。差分と
design「振る舞いの詳細」を渡す。見てほしい点: 利用者のファイルを壊さないか・古いものが残らないか・途中で失敗した
ときに導入済みの状態が失われないか）。

### T3（qodercli を足す）

**コード**

- `packages/protocol/src/model.ts`: `AgentIntegrationKind` の末尾に `"qodercli"`。上のコメントに 1 行足す。
- `packages/protocol/src/messages.ts`: `agentIntegrationKind` の `z.enum` の末尾に `"qodercli"`（並びを揃える）。
- `AgentIntegrationInstaller.ts`:
  - `HOOK_SPECS.qodercli`:
    `configFile: join(env.QODER_CONFIG_DIR || join(home, ".qoder"), "settings.json")`、
    `hooksDir: join(同, "hooks")`、`binName: "qoder"`、`altBinNames: ["qodercli"]`、
    `entriesPath: ["hooks", "SessionStart"]`、
    `buildEntry` → `{ hooks: [{ type: "command", command: hookCommand(scriptPath, kind), async: true }] }`（**`matcher` を書かない**）、
    `isOurs: isOursNested`。`legacy` は無い。
  - `export const AGENT_INTEGRATION_KINDS = Object.keys(HOOK_SPECS) as readonly AgentIntegrationKind[];`
  - `export function isAgentIntegrationKind(kind: string): kind is AgentIntegrationKind`（`Object.hasOwn(HOOK_SPECS, kind)`。
    `__proto__`・`constructor`・`toString` は false）。
- `AgentIntegrationService.ts`: 自前の `KINDS` をやめ、`AGENT_INTEGRATION_KINDS` を使う。
- `resumeCommand.ts`: `case "qodercli": return \`qoder --resume ${sessionId}\`;`
- `packages/web/src/components/SettingsDialog.vue`（`AGENT_INTEGRATION_KINDS`）・
  `packages/tui/src/settings/sections.ts`（`AGENT_KINDS`）: **末尾に** `{ value: "qodercli", label: "Qoder CLI" }`
  （既存の行の並びを変えない。`SettingsDialog.test.ts` は行の番号で grok を引いている）。
- ［更新］の文を claude とそれ以外で分ける（AC-I2）:
  - `SettingsDialog.vue` の `updateAgentIntegration`: `result.message` が null のときの既定の文を、`kind === "claude"` なら
    今の文のまま、ほかは「更新しました。」にする。
  - `sections.ts` の更新の行の `note`: `k.value === "claude"` なら今の文のまま、ほかは
    「本製品のフックを、現行の形に入れ直します。」にする。
- `packages/server/assets/agent-hook-report.cjs`・`packages/protocol/src/agentStart.ts`・`agents.ts` は変えない。

**テスト**

- `AgentIntegrationInstaller.test.ts`（足す）:
  - qodercli の install → `<home>/.qoder/settings.json` の `hooks.SessionStart[0]` が
    `{hooks:[{type:"command", command:<soda-agent-report.cjs と qodercli を含む>, async:true}]}`、`matcher` が `undefined`。
    2 回目は「既に導入済みです」。status → `{installed:true, needsUpdate:false}`。uninstall で消え、スクリプトも消える。
  - 既存の `settings.json`（ほかのキーとほかのフック）を保つ。
  - `QODER_CONFIG_DIR` を渡すと、そこに書く。
  - `cliDetected`: 一時の `bin` フォルダに実行できる `qoder` だけ／`qodercli` だけを置いて `PATH` に渡すと、どちらも
    `true`。どちらも無ければ `false`（Windows では拡張子の扱いが違うので、既存の `cliDetected` のテストの流儀に合わせる。
    無ければ `it.skipIf(process.platform === "win32")`）。
  - `isAgentIntegrationKind`: 9 つの kind で true、`"gemini"`・`"__proto__"`・`"constructor"`・`""` で false。
    `AGENT_INTEGRATION_KINDS` が 9 つで `qodercli` を含む。
- `resumeCommand.test.ts`（足す）: `resumeCommandFor("qodercli", "abc-123")` → `"qoder --resume abc-123"`、
  `resumeCommandFor("qodercli", "a; rm -rf /")` → `undefined`。
- kind を数え上げているテストに `qodercli` を足す（型・中身の都合。ほかは変えない）:
  `packages/protocol/src/messages.test.ts:93`、`packages/server/src/session/SessionService.test.ts:2166`、
  `packages/server/src/agent/AgentIntegrationService.test.ts`（一覧があれば）、
  `packages/web/src/store/agentIntegrations.test.ts`・`StoreAdapter.test.ts`・`actions/ActionDispatcher.test.ts`・
  `components/SettingsDialog.test.ts`（`Record` の固定値。`SettingsDialog.test.ts` はラベルの一覧に "Qoder CLI"）、
  tui の設定のテスト（`AGENT_KINDS` を見ているもの。`grep -rn "Qwen Code" packages/tui`）。
- 足す（AC-I2）: `SettingsDialog.test.ts` で、`needsUpdate:true` の grok の行の［更新］を押し、`installAgentIntegration` が
  `{ok:true, message:null}` を返したときの知らせに「Claude Code」が無いこと（claude の行では今の文のまま）。
  tui の設定のテストで、`needsUpdate:true` の grok の更新の行の `note` に「Claude Code」が無いこと。
  `scripts/migrate-from-wtm.test.ts` の `KINDS` は**足さない**（旧名の頃に qodercli の連携は無い）。
  installer のテスト「ほかの 7 種は…」の一覧は、足しても足さなくてもよい（足すなら題の数も直す）。

**確かめ方**: `pnpm typecheck`（`Record<AgentIntegrationKind, …>` の漏れを型が捕まえる）＋触ったテスト。

### T4（受け口）

**コード（`packages/server/src/composeServer.ts` の `startAgentReportSocket` の呼び出し）**

```ts
if (report.type === "session") {
  if (isAgentIntegrationKind(report.kind)) session.reportAgentSession(report.paneId, report.kind, report.sessionId);
} else if (report.kind === "claude") {
  subagents.report(report); // サブエージェントの報告は claude だけ（変えない）
}
```

**テスト（`composeServer.subagents.integration.test.ts`。既存の `boot`／`bootWithAgent` と `sendRaw` を使う）**

- 足す: `sendRaw(stateDir, {paneId, kind: "grok", sessionId: "grok-1"})` の後、`vi.waitFor` で
  `server.session.getPane(paneId)?.agentSession` が `{kind:"grok", sessionId:"grok-1"}` を含む。`qodercli`・`devin` でも同じ。
- 足す: 連携の kind でない名乗り（`"gemini"`・`"__proto__"`）は記録されない。確かめ方は、先にそれを送り、
  続けて `{kind:"codex", sessionId:"after"}` を送って `agentSession.sessionId === "after"` を待ち、
  その間に `agentSession.kind` が `gemini` になっていないこと（受け口は 1 接続ずつ順に読むとは限らないので、
  「待ってから見る」形にする。落ちる側の確かめを sleep だけに頼らない）。
- **負の確かめ（必須）**: `composeServer.ts` の条件だけを `report.kind === "claude" || report.kind === "codex"` に戻し、
  1 つ目のテストが落ちることを確かめる。出力を test-result.md に貼る。戻して `git diff -- packages/server/src/composeServer.ts`
  が T4 の差分だけであることを確かめる。

**確かめ方**: `pnpm vitest run packages/server/src/composeServer.subagents.integration.test.ts`（Linux・`/bin/bash` が要る）。

### T5（docs）

- `docs/verification.md`（「エージェントの会話の再開・Claude Code・Codex 以外の6エージェント」の項。340 行あたり）:
  - 対象を 7 エージェント（＋Qoder CLI）に。
  - 「Devin CLI だけ設定ファイルのパス（`~/.devin/hooks.json`）が推測値」を、
    「`~/.config/devin/config.json`（Windows は `%APPDATA%\devin\config.json`）の `hooks.SessionStart`。2026-10-07 に公式文書
    （`docs.devin.ai/cli/extensibility/hooks/overview`）で確認。**文書だけで確認。実機は未確認**。コメントつきの
    `config.json` には導入できない。`XDG_CONFIG_HOME` は見ない」に替える。
  - Grok CLI: 入れ子の形に替えたこと・平らな形を現行版が受けるかは未確認・古い版が入れ子を受けるかも未確認。
  - Qoder CLI: 場所・形・`qoder --resume`・実機未確認。
  - 以前の版で導入した Grok・Devin は「導入済み（更新が必要）」と出て、［更新］で入れ直されること（手で確かめる手順）。
  - 形の一覧の参照先に `.aidev/works/20261007-agent-hook-drift/research.md` を足す。
- `docs/herdr-parity.md` の H32b: Qoder CLI を「対応」に移し（「`SessionStart` 相当の hook 自体が無いと判明」の対象から外す）、
  Devin の「推測値」の文を新しい場所に替え、20261007-agent-hook-drift と「文書だけで確認。実機は未確認」を足す。
  claude・codex 以外の報告が受け口で捨てられていたのを直したことも 1 文で。
- `docs/migrate-from-wtm.md`（81 行あたり）: 移行スクリプトは古い場所（`~/.devin/hooks.json`・Grok の平らな形）の名前を
  替えるだけなので、移行の後に Devin・Grok でも「更新が必要」と出たら［更新］で現行の場所・形に入れ直す、と 1 文足す。
  スクリプト（`scripts/migrate-from-wtm.sh`）は変えない。
- `.aidev/backlog/product-roadmap.md`（245〜251 行あたりの「非対応・参考」）: Qoder CLI を外し、
  現行の文書に `SessionStart` があり 20261007-agent-hook-drift で対応した、と書く。
- AGENTS.md は変えない（該当の案内が無い）。

**確かめ方**: `grep -rn "\.devin/hooks\.json\|DEVIN_CONFIG_DIR\|推測値" docs/` の残りが、古い場所の説明（移行）だけであること。

### T6（全体の確認）

- `pnpm build`・`pnpm typecheck`・`pnpm test` を流し、結果（失敗があれば出力ごと）を test-result.md に書く。
- test-result.md に、AC ごとの判定・T4 の負の確かめの生の出力・「未検証の穴（実機）」を書く。
- `aidev smoke`（作業フォルダの外の worktree で）は、受け取った側の決まりに従う（AGENTS.md）。

## 実装の後に報告へ残すこと（直さない）

- research X2: Claude Code 用のフックを Devin CLI・Grok CLI も読んで実行する（kind が `claude` のまま、別のエージェントの
  セッション id が届く）。
- research G8・D7: `GROK_HOME`・`XDG_CONFIG_HOME` に従うかは未確認。
- Claude Code・Codex の `matcher: "startup|resume"` は `/clear` で替わったセッションを報告しない（既存の決まり。今回は変えない）。
- 古い場所の空のフォルダ（`~/.devin/hooks/`・`~/.devin/`）は残る（消さない）。
