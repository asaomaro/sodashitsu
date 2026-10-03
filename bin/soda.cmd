@echo off
rem Dev launcher for soda. Runs packages\server\dist directly (run pnpm build first).
node --enable-source-maps "%~dp0..\packages\server\dist\main.js" %*
exit /b %ERRORLEVEL%
