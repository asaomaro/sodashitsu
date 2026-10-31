# 検証

- Windows Node 24.19.0 + fixed Windows PowerShell: private generated CLR、3role STA/MTA、未選択moduleなし、未知role/wrong SHA/tamper/hardlink拒否、metadata破損とabsent current pointerをfresh immutable cohortで復旧、実role --preflightのみ。pass。ログ /tmp/soda-common-native-roles-recovery-validation.log。実desktop/input/audio device呼出なし。
- Node関連7files/67tests pass。/tmp/soda-common-native-focused-final.log。
- build pass（close latch追加前、最終incrementalは後続）、typecheck pass。全体試験実行中。
- 独立whole/delta review_transfer: must/shouldなし。前shouldの同時closeはPromise latchで修正。

## 回帰の負例

同じprivate source copyで先にclose回帰が1pass。latchだけ外すと1failになり、二重unlink ENOENTも観測。実装を元へ復元済み。製品ソースは変更せず全体試験と分離。ログ /tmp/soda-common-native-negative-{positive,failure}.log。

```text
 FAIL  DesktopNativeRoleBinary.node.test.ts > shares one physical retirement and cleanup for concurrent close calls
AssertionError: expected Promise{…} to be Promise{…} // Object.is equality

If it should pass with deep equality, replace "toBe" with "toStrictEqual"

Expected: Promise{…}
Received: serializes to the same string


Compared values have no visual difference.

```

初期Windows builderはFile.Replace(temporary,pointer,$null)で、PowerShellのnull→empty path変換によりmetadata repair試験が失敗した。owned explicit backupへ修正して同一試験pass。

```text
Error: Generated native builder failed: #< CLIXML
"3" 個の引数を指定して "Replace" を呼び出し中に例外が発生しました: "パスの形式が無効です。"
```

初期失敗生ログ: /tmp/soda-common-native-roles-final-validation.log。
