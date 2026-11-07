# 子履歴の要求種別・状態表示

Base0ee709d0＋公開履歴6a413712/限定fix924d58f9を依存としてpick（duplicate be917b3f/6fbda3e5、最終追加commitだけを統合する）。独立reviewで判明した2点の小修正。

- AGYの親宛send_message要求はliteral kind:tool/name:send_messageへ。本文【親への送信要求】は維持し、Message sent成立を照合したと主張しない。一般planner/system/GENERIC/他宛先・private promptの拒否は不変。本文上限も既存整形の4000文字を維持。
- AgentSubagentTranscriptResultへoptional state(working/idle/unknown)を追加。nativeのlive item状態がある場合のみ使用し、省略や既取得grantのlive欠落・失敗はunknown。membershipからworking/completedを推測しない。legacy runningは不変。Webはstate優先で状態不明/待機中/実行中を表示し、field無しのClaude/旧サーバだけ従来runningの実行中/終了へfallbackする。TUIは終了表示を元々持たず影響なし。count/所属/取得状態を変えない。

既存5関連suites67tests pass。新旧state表示/legacy真終了、AGYtool分類と親UUID完全一致/private除外、省略state・過去grantunknown/count不変を確認。実Chromium/Vue同情報window内で状態不明・send_message道具・say0、readonly/無送信、既存4テーマのcontrol/ariaを確認しinline.png目視。生成recordだけ、実pane/model/Windows操作0。

protocol/Web型0。初回server型は新treeの未生成TUI dist参照で失敗（types.txt）、TUI依存build0後server型0（server-types-restored.txt）、製品source変更なし。protocol/coreもscoped build0。全体build/test重複なし。

旧3製品source（AGY mapper/native result/Web表示）へ戻すと6fail/61pass、実DOMもunknownを終了とするためfail。server/Vue共にsourceを直接変換するfixtureのため再build不要（protocol型の追加は保持）。保存済3sourceをbyte/SHA256完全復元し、同67tests・DOM pass。raw negative/restored各txtとrestoration.json。最終sourceと復元3SHA一致を検査済み。

この作業はUI契約の小差分で、Muse/AGY公開履歴safeopen/grantsの独立reviewは6a/924に別途記録。Museの内部assistant_message_committed fallbackは依存924で排除済み。新modelturn/OS操作/音声処理なし。Web production bundle/server distはこの作業で再生成せず、Vite直接source・型・protocol/core/TUI依存distを検証。統合側のfresh buildで稼働へ反映する。
