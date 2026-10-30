# Desktop assistant

User requests implementation after reviewing the proposal. Existing remote desktop work is retained in isolated worktrees; this feature uses its own branch. Initial operating environment is Windows with Soda/agents in WSL. Design OS adapters for future native Linux/macOS support without claiming their unavailable real-device verification.

- User can enable/disable the assistant and choose desktop captain character or tray-only mode. Keep a tray exit/settings path in both modes. Include male/female captain defaults and character-pack extension points.
- Deliver agent attention/completion notices without invoking a model. Clicking a notice opens its exact source project/machine/session; replies to that source are distinct from dedicated assistant chat. Expired/closed targets cannot silently redirect replies. Ask-form responses remain exactly-once across normal Soda and assistant views.
- Maintain one dedicated assistant agent session while enabled; idle process/session is not continuous model generation. Preserve conversation across application/server reconnection, avoid duplicate agent launches, and do not mix project content automatically.
- Show existing terminal, ask-form and plugin display surfaces. Plugins can define assistant views/actions; character assets, UI and executable functions have separate capabilities and approval. Existing project-extension approval remains mandatory.
- Standard chat and user-selected screenshot/OCR tools. Prefer local OCR; capture selection/preview and transmission are explicit. No background screen capture or automatic image upload.
- Settings include mode, character, position/size/monitor, quiet notification choices, optional login startup, server connection and dedicated agent. Device geometry/startup/permissions are local to the operating PC.
- Character does not steal focus; panel does when explicitly opened. Handle DPI/work area, removed monitors, sleep, reconnect, offline and permanent exit. Respect reduced motion/fullscreen silence.
- Native host and content are separate. Renderer has no Node access; fixed validated IPC and sender/role checks. Untrusted plugin content receives no native filesystem/capture/shell/session-token access. Explicit native capabilities do not inherit remote-PC input grants.

No live OS capture/input, actual model/agent launch, user credentials/store changes, startup registration or service/driver/trust alteration during automated tests. Use generated frames, fake agent processes and injected native adapters.

追加要望: 標準キャラクターは男性船長・女性船長・ロボット船長の3種。表示上の選択で権限・モデル・通知送信先を変えない。

追加要望: 通知はバッジだけにせず、キャラクターの吹き出しで「作業が完了しました」「確認してください」など言葉で伝える。専用チャットと通知元への返答も吹き出しで行う。送信先は常に表示する。ターミナル/大きなask-formは吹き出しから展開する。通知だけではフォーカスを奪わず、利用者が会話を開いた場合に入力へフォーカスする。トレイモードでも吹き出し会話を利用できる。

追加標準機能: マイク音声/音声ファイルの文字起こし（明示的開始/停止、録音中表示、停止/キャンセル、結果を確認後にチャットへ送信）。ローカル/外部処理と音声送信の有無を明示する。読み上げ、利用者が選んだ文章の要約/翻訳、簡易メモ、既存予約機能を用いたリマインダーも吹き出しから呼び出す。常時録音や自動的な画面/音声/選択文の外部送信は行わない。モデルが必要な処理だけ専用セッションまたは明示したプロバイダへ委譲する。
