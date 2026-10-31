# 設計

Node所有のオンデマンドworker、固定argv/private bootstrap、親PID/UID固定Unix socket、bounded 1932byte PCM、100ms期限。共有poolの排他所有と実worker終了確認を分離。既定/physical fallbackなし。Linux libpulse nonblocking、macOS既存helper専用mode/CoreAudio AudioQueue。
