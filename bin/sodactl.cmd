@echo off
rem Dev launcher for sodactl. Runs packages\cli\dist directly (run pnpm build first).
node --enable-source-maps "%~dp0..\packages\cli\dist\main.js" %*
exit /b %ERRORLEVEL%
