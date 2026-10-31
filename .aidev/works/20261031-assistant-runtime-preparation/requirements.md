# 要求

統合assistantの資源準備(PR343)に続く共通GUI runtimeの準備。個別アプリexe/installerを利用者へ要求せず、ON時だけ公式の固定digestのruntimeを準備できるようにする。OFF/停止は準備を取消し、準備中FD/子処理は実退役まで所有する。build/通常server/help/statusはdownloadもGUI起動も行わない。

この段階はruntime cache/展開/準備の内部基盤。GUI起動role、設定ON/OFF、専用exe/installer廃止は後続で接続する。実GUI/実WSL以外の生成試験と3OSの配布データ検証を完了する。
