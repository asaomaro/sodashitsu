@echo off
rem migrate-from-wtm.bat - one-time migration of the local state of wtm (web-tn-multiplexer)
rem to the new names of Sodashitsu (soda / sodactl) on Windows.
rem
rem   scripts\migrate-from-wtm.bat [--dry-run]
rem
rem This mirrors scripts/migrate-from-wtm.sh (same checks, same steps, same exit codes); see
rem docs/migrate-from-wtm.md. NOT VERIFIED ON WINDOWS (it could not be run where it was written).
rem Messages are ASCII (English) on purpose: cmd.exe reads a batch file in the console code page.
rem
rem Phases: check (read only; collects refusals and counts steps) -> plan (--dry-run: prints the steps)
rem         or run (performs the steps).
rem Exit codes: 0 done / dry-run / nothing to migrate, 1 refused (nothing changed), 2 usage error,
rem             3 failed midway (steps printed as "done:" were performed and are not rolled back).
setlocal EnableExtensions DisableDelayedExpansion

rem Take the script's own directory before the argument loop: SHIFT (without /n) also shifts %0.
set "SCRIPT_DIR=%~dp0"
set "DRY_RUN=0"
:args
if "%~1"=="" goto args_done
if /i "%~1"=="--dry-run" goto arg_dry
if /i "%~1"=="-h" goto arg_help
if /i "%~1"=="--help" goto arg_help
echo migrate-from-wtm: unknown argument: %~1 1>&2
call :print_usage 1>&2
exit /b 2
:arg_dry
set "DRY_RUN=1"
shift
goto args
:arg_help
call :print_usage
exit /b 0
:args_done

if not defined USERPROFILE goto no_home
set "HOMEDIR=%USERPROFILE%"
rem Drop a trailing backslash (the app normalizes the worktree root the same way; the saved layout would not match otherwise).
if "%HOMEDIR:~-1%"=="\" set "HOMEDIR=%HOMEDIR:~0,-1%"
set "STATE_BASE=%USERPROFILE%\AppData\Local"
if defined LOCALAPPDATA set "STATE_BASE=%LOCALAPPDATA%"

rem Same places as the app (packages/server/src/config.ts defaultStateDir, agent/AgentIntegrationInstaller.ts HOOK_SPECS).
set "OLD_STATE=%STATE_BASE%\web-tn-multiplexer"
set "NEW_STATE=%STATE_BASE%\sodashitsu"
set "OLD_CLI=%HOMEDIR%\.wtmctl"
set "NEW_CLI=%HOMEDIR%\.sodactl"
set "OLD_WT_PARENT=%HOMEDIR%\.wtm"
set "OLD_WT=%HOMEDIR%\.wtm\worktrees"
set "NEW_WT_PARENT=%HOMEDIR%\.sodashitsu"
set "NEW_WT=%HOMEDIR%\.sodashitsu\worktrees"
set "CLAUDE_DIR=%HOMEDIR%\.claude"
if defined CLAUDE_CONFIG_DIR set "CLAUDE_DIR=%CLAUDE_CONFIG_DIR%"
set "CODEX_DIR=%HOMEDIR%\.codex"
if defined CODEX_HOME set "CODEX_DIR=%CODEX_HOME%"
set "DEVIN_DIR=%HOMEDIR%\.devin"
if defined DEVIN_CONFIG_DIR set "DEVIN_DIR=%DEVIN_CONFIG_DIR%"
set "HOOK_ASSET=%SCRIPT_DIR%..\packages\server\assets\agent-hook-report.cjs"
set "BAK=.bak-wtm-migration"
set "MYHOST="
for /f "delims=" %%H in ('hostname') do if not defined MYHOST set "MYHOST=%%H"

set "PHASE=check"
set "COUNT=0"
set "REFUSED=0"
set "FAILED="
set "WARNED="
set "HAS_STATE=0"
set "HAS_CLI=0"
set "HAS_WT=0"
set "RM_OLD_WT_PARENT=0"
set "NEED_ASSET=0"

call :check_running
call :all_items

if not "%REFUSED%"=="0" goto refused
if "%COUNT%"=="0" goto nothing
if "%DRY_RUN%"=="1" goto dry_run

set "PHASE=run"
set "COUNT=0"
call :all_items
if defined FAILED goto failed
echo migrate: %COUNT% step(s) done. Log in again once in the browser (docs/migrate-from-wtm.md).
call :print_notes
if defined WARNED exit /b 3
exit /b 0

:refused
echo migrate-from-wtm: refusing to migrate for the reasons above. Nothing was changed. 1>&2
exit /b 1

:nothing
echo Nothing to migrate (already migrated, or no state with the old names).
call :print_notes
exit /b 0

:dry_run
set "PHASE=plan"
set "COUNT=0"
call :all_items
echo migrate: %COUNT% step(s) planned (--dry-run: nothing was changed).
call :print_notes
exit /b 0

:failed
echo migrate-from-wtm: stopped midway. Steps printed as "done:" were performed (not rolled back). 1>&2
exit /b 3

:no_home
echo migrate-from-wtm: USERPROFILE is not set 1>&2
exit /b 2

rem ---------------------------------------------------------------- helpers

:print_usage
echo usage: scripts\migrate-from-wtm.bat [--dry-run]
echo.
echo Moves the local state of wtm (web-tn-multiplexer) to the places of Sodashitsu (soda), once:
echo   - state dir   %%LOCALAPPDATA%%\web-tn-multiplexer -^> %%LOCALAPPDATA%%\sodashitsu
echo                 (wtm.lock -^> soda.lock, clipboard-images\wtm-image-* -^> soda-image-*, also sessions\*\)
echo   - CLI cache   %%USERPROFILE%%\.wtmctl -^> %%USERPROFILE%%\.sodactl (and the cached cookie name)
echo   - worktrees   %%USERPROFILE%%\.wtm\worktrees -^> %%USERPROFILE%%\.sodashitsu\worktrees (git worktree repair)
echo   - agent hooks (claude, codex, cursor, copilot, devin, droid [.factory], grok, qwen):
echo                 wtm-agent-report -^> soda-agent-report (originals kept as ^<file^>.bak-wtm-migration)
echo Refuses (exit 1, nothing changed) while an old wtm serve is running or a destination exists.
echo.
echo   --dry-run   print the planned steps only
echo   -h, --help  show this help
exit /b 0

:print_notes
rem Claude Code keeps conversations under projects\<name derived from the cwd>; moved worktrees leave them under the old name (not changed here).
for /d %%P in ("%CLAUDE_DIR%\projects\*-wtm-worktrees-*") do echo note: the Claude Code conversations %%~fP still have the name of the old worktree path ^(not changed^). Rename it as in docs/migrate-from-wtm.md to resume them.
if exist "%CLAUDE_DIR%\skills\wtmctl\" echo note: the skill you installed by hand, %CLAUDE_DIR%\skills\wtmctl, was not changed. Remove it and install it again with sodactl skill (docs/sodactl.md).
exit /b 0

:refuse
echo migrate-from-wtm: %~1 1>&2
set /a REFUSED+=1
exit /b 0

rem need_absent <path> <what>: in the check phase, refuse when the destination already exists (never overwrite).
:need_absent
if not "%PHASE%"=="check" exit /b 0
if exist "%~1" call :refuse "destination already exists (%~2): %~1"
exit /b 0

rem Step descriptions must not contain > or < (they are echoed through %~1 and would become redirections).
rem do <description>: one step. The command is in CMD. check: count only / plan: print / run: perform.
:do
if defined FAILED exit /b 1
set /a COUNT+=1
if "%PHASE%"=="check" exit /b 0
if "%PHASE%"=="plan" goto do_plan
%CMD% >nul 2>&1
if errorlevel 1 goto do_fail
echo done: %~1
exit /b 0
:do_plan
echo planned: %~1
exit /b 0
:do_fail
echo failed: %~1 1>&2
set "FAILED=1"
exit /b 1

rem do_warn <description>: like do, but a failure is a warning and the rest continues (git worktree repair).
:do_warn
if defined FAILED exit /b 1
set /a COUNT+=1
if "%PHASE%"=="check" exit /b 0
if "%PHASE%"=="plan" goto do_plan
rem stderr is not hidden here, so the reason of a failing git worktree repair is visible.
%CMD% >nul
if errorlevel 1 goto do_warn_fail
echo done: %~1
exit /b 0
:do_warn_fail
echo warning: failed (run it again by hand): %~1 1>&2
set "WARNED=1"
exit /b 0

rem Text replacement via PowerShell: [IO.File]::WriteAllText writes UTF-8 without a BOM
rem (Set-Content -Encoding UTF8 of Windows PowerShell 5.1 adds a BOM, which JSON.parse in Node rejects).
:op_rewrite
copy /y "%~1" "%~1%BAK%" >nul || exit /b 1
set "MIG_SRC=%~1"
set "MIG_DST=%~1"
set "MIG_FROM=%~2"
set "MIG_TO=%~3"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:MIG_SRC); [IO.File]::WriteAllText($env:MIG_DST, $t.Replace($env:MIG_FROM, $env:MIG_TO))"
exit /b %ERRORLEVEL%

:op_rename_rewrite
copy /y "%~1" "%~1%BAK%" >nul || exit /b 1
set "MIG_SRC=%~1"
set "MIG_FROM=wtm-agent-report"
set "MIG_TO=soda-agent-report"
rem Write to a temporary file first: the destination is read as hooks\*.json, so never leave a half-written one there.
set "MIG_DST=%~2.tmp-wtm-migration"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:MIG_SRC); [IO.File]::WriteAllText($env:MIG_DST, $t.Replace($env:MIG_FROM, $env:MIG_TO))" || goto op_rename_rewrite_fail
move /y "%~2.tmp-wtm-migration" "%~2" >nul || goto op_rename_rewrite_fail
del "%~1"
if exist "%~1" exit /b 1
exit /b 0
:op_rename_rewrite_fail
if exist "%~2.tmp-wtm-migration" del "%~2.tmp-wtm-migration"
exit /b 1

rem The copied hook script reads WTM_*; renaming it is not enough, so install the bundled (new) one.
:op_replace_script
copy /y "%~1" "%~1%BAK%" >nul || exit /b 1
copy /y "%HOOK_ASSET%" "%~2" >nul || exit /b 1
rem DEL can return 0 even when it could not delete, so check the result.
del "%~1"
if exist "%~1" exit /b 1
exit /b 0

rem The saved layout may hold the old worktree path in two forms: JSON-escaped backslashes and forward slashes.
:op_rewrite_layout
copy /y "%~1" "%~1%BAK%" >nul || exit /b 1
set "MIG_SRC=%~1"
set "MIG_HOME=%HOMEDIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$h=$env:MIG_HOME; $b=$h.Replace('\','\\'); $f=$h.Replace('\','/'); $t=[IO.File]::ReadAllText($env:MIG_SRC); $t=$t.Replace($b+'\\.wtm\\worktrees', $b+'\\.sodashitsu\\worktrees').Replace($f+'/.wtm/worktrees', $f+'/.sodashitsu/worktrees'); [IO.File]::WriteAllText($env:MIG_SRC, $t)"
exit /b %ERRORLEVEL%

:has_old_layout_path
set "MIG_SRC=%~1"
set "MIG_HOME=%HOMEDIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$h=$env:MIG_HOME; $b=$h.Replace('\','\\'); $f=$h.Replace('\','/'); $t=[IO.File]::ReadAllText($env:MIG_SRC); if ($t.Contains($b+'\\.wtm\\worktrees') -or $t.Contains($f+'/.wtm/worktrees')) { exit 0 } else { exit 1 }"
exit /b %ERRORLEVEL%

:op_move_worktrees
if not exist "%NEW_WT_PARENT%\" mkdir "%NEW_WT_PARENT%" || exit /b 1
move "%OLD_WT%" "%NEW_WT%" >nul
exit /b %ERRORLEVEL%

:op_rmdir
rem RD does not always set ERRORLEVEL on failure, so check the result.
rmdir "%~1"
if exist "%~1\" exit /b 1
exit /b 0

:op_repair
git -C "%~1" worktree repair
exit /b %ERRORLEVEL%

rem ---------------------------------------------------------------- check 1: is an old server running?
rem Same judgement as packages/server/src/persist/StateDirLock.ts (line 1 = pid, line 2 = host name).

:check_running
if not exist "%OLD_STATE%\" exit /b 0
call :check_lock "%OLD_STATE%\wtm.lock"
for /d %%D in ("%OLD_STATE%\sessions\*") do call :check_lock "%%~fD\wtm.lock"
exit /b 0

:check_lock
if not exist "%~1" exit /b 0
set "LPID="
set "LHOST="
for /f "usebackq delims=" %%L in ("%~1") do call :lock_line "%%L"
if not defined LPID exit /b 0
echo %LPID%| findstr /r /x "[0-9][0-9]*" >nul || exit /b 0
if "%LPID%"=="0" exit /b 0
if not defined LHOST goto check_lock_pid
if /i "%LHOST%"=="%MYHOST%" goto check_lock_pid
call :refuse "an old wtm (pid %LPID%) on another host %LHOST% uses this state dir: %~1 (if it is not running, delete this file and run again)"
exit /b 0
:check_lock_pid
tasklist /FI "PID eq %LPID%" /NH 2>nul | find " %LPID% " >nul || exit /b 0
call :refuse "an old wtm serve is running (pid %LPID%, %~1). Stop it and run again"
exit /b 0

:lock_line
if not defined LPID (
  set "LPID=%~1"
  exit /b 0
)
if not defined LHOST set "LHOST=%~1"
exit /b 0

rem ---------------------------------------------------------------- items

:all_items
call :item_state
call :item_commands
call :item_cli
call :item_worktrees
call :item_hooks
exit /b 0

:item_state
if not "%PHASE%"=="check" goto item_state_go
if not exist "%OLD_STATE%\" exit /b 0
set "HAS_STATE=1"
call :need_absent "%NEW_STATE%" "state dir"
:item_state_go
if not "%HAS_STATE%"=="1" exit /b 0
set CMD=move "%OLD_STATE%" "%NEW_STATE%"
call :do "move the state dir: %OLD_STATE% to %NEW_STATE%"
set "SD=%OLD_STATE%"
if "%PHASE%"=="run" set "SD=%NEW_STATE%"
call :state_files "%SD%"
for /d %%D in ("%SD%\sessions\*") do call :state_files "%%~fD"
exit /b 0

:state_files
if exist "%~1\wtm.lock" call :rename_in "%~1\wtm.lock" "soda.lock" "lock"
for %%F in ("%~1\clipboard-images\wtm-image-*") do call :rename_image "%%~fF"
exit /b 0

:rename_image
set "IMG=%~nx1"
set "IMG=soda-image-%IMG:~10%"
call :rename_in "%~1" "%IMG%" "clipboard image"
exit /b 0

:rename_in
call :need_absent "%~dp1%~2" "%~3"
set CMD=ren "%~1" "%~2"
call :do "rename the %~3: %~1 to %~2"
exit /b 0

rem Custom commands (commands.json) may reference WTM_* variables; the new app passes SODA_* only.
:item_commands
set "CSD=%NEW_STATE%"
if "%PHASE%"=="run" goto item_commands_go
if "%HAS_STATE%"=="1" set "CSD=%OLD_STATE%"
:item_commands_go
call :commands_file "%CSD%\commands.json"
for /d %%D in ("%CSD%\sessions\*") do call :commands_file "%%~fD\commands.json"
exit /b 0

:commands_file
if not exist "%~1" exit /b 0
findstr /c:"WTM_" "%~1" >nul || exit /b 0
call :need_absent "%~1%BAK%" "backup of the custom commands"
set CMD=call :op_rewrite "%~1" "WTM_" "SODA_"
call :do "rewrite WTM_ to SODA_ in the custom commands: %~1 (original kept as commands.json%BAK%)"
exit /b 0

:item_cli
if not "%PHASE%"=="check" goto item_cli_go
if not exist "%OLD_CLI%\" exit /b 0
set "HAS_CLI=1"
call :need_absent "%NEW_CLI%" "CLI cache"
:item_cli_go
if not "%HAS_CLI%"=="1" exit /b 0
set CMD=move "%OLD_CLI%" "%NEW_CLI%"
call :do "move the CLI cache: %OLD_CLI% to %NEW_CLI%"
set "CF=%OLD_CLI%\session.json"
if "%PHASE%"=="run" set "CF=%NEW_CLI%\session.json"
if not exist "%CF%" exit /b 0
findstr /c:"wtm_session" "%CF%" >nul || exit /b 0
call :need_absent "%CF%%BAK%" "backup of the CLI cache"
set CMD=call :op_rewrite "%CF%" "wtm_session" "soda_session"
call :do "rewrite the cookie name in the CLI cache: %CF% (original kept as session.json%BAK%)"
exit /b 0

:item_worktrees
if not "%PHASE%"=="check" goto item_wt_go
if not exist "%OLD_WT%\" exit /b 0
set "HAS_WT=1"
call :need_absent "%NEW_WT%" "worktree root"
where git >nul 2>&1 || call :refuse "git was not found (needed to run git worktree repair in the moved worktrees)"
set "RM_OLD_WT_PARENT=1"
for /f "delims=" %%E in ('dir /b /a "%OLD_WT_PARENT%" ^| findstr /v /x /i /c:"worktrees"') do set "RM_OLD_WT_PARENT=0"
:item_wt_go
if not "%HAS_WT%"=="1" exit /b 0
set CMD=call :op_move_worktrees
call :do "move the worktree root: %OLD_WT% to %NEW_WT%"
set "WTROOT=%OLD_WT%"
if "%PHASE%"=="run" set "WTROOT=%NEW_WT%"
rem Worktrees are <root>\<repo name>\<branch slug> (depth 2); their .git is a file, not a directory.
rem (for /d also lists names that start with a dot; it skips only hidden/system directories.)
for /d %%R in ("%WTROOT%\*") do for /d %%W in ("%%~fR\*") do call :maybe_repair "%%~fW"
if not "%RM_OLD_WT_PARENT%"=="1" goto item_wt_layout_dir
set CMD=call :op_rmdir "%OLD_WT_PARENT%"
call :do "remove the now empty %OLD_WT_PARENT%"
:item_wt_layout_dir
set "LSD=%NEW_STATE%"
if "%PHASE%"=="run" goto item_wt_layout
if "%HAS_STATE%"=="1" set "LSD=%OLD_STATE%"
:item_wt_layout
call :layout_file "%LSD%\session.json"
for /d %%D in ("%LSD%\sessions\*") do call :layout_file "%%~fD\session.json"
exit /b 0

:maybe_repair
if not exist "%~1\.git" exit /b 0
if exist "%~1\.git\" exit /b 0
set CMD=call :op_repair "%~1"
call :do_warn "fix the worktree links (git worktree repair): %~1"
exit /b 0

:layout_file
if not exist "%~1" exit /b 0
call :has_old_layout_path "%~1" || exit /b 0
call :need_absent "%~1%BAK%" "backup of the saved layout"
set CMD=call :op_rewrite_layout "%~1"
call :do "rewrite the worktree paths in the saved layout: %~1 (original kept as session.json%BAK%)"
exit /b 0

:item_hooks
call :one_agent claude "%CLAUDE_DIR%\settings.json" "%CLAUDE_DIR%\hooks"
call :one_agent codex "%CODEX_DIR%\hooks.json" "%CODEX_DIR%\hooks"
call :one_agent cursor "%HOMEDIR%\.cursor\hooks.json" "%HOMEDIR%\.cursor\hooks"
call :one_agent copilot "" "%HOMEDIR%\.copilot\hooks"
call :one_agent devin "%DEVIN_DIR%\hooks.json" "%DEVIN_DIR%\hooks"
call :one_agent droid "%HOMEDIR%\.factory\hooks.json" "%HOMEDIR%\.factory\hooks"
call :one_agent grok "" "%HOMEDIR%\.grok\hooks"
call :one_agent qwen "%HOMEDIR%\.qwen\settings.json" "%HOMEDIR%\.qwen\hooks"
if not "%PHASE%"=="check" exit /b 0
if not "%NEED_ASSET%"=="1" exit /b 0
if not exist "%HOOK_ASSET%" goto no_asset
findstr /c:"SODA_PANE_ID" "%HOOK_ASSET%" >nul || call :refuse "the bundled hook script is an old version (it does not read SODA_PANE_ID): %HOOK_ASSET% (run this from the renamed checkout)"
exit /b 0
:no_asset
call :refuse "the bundled hook script was not found: %HOOK_ASSET% (run this from scripts\ of the repository)"
exit /b 0

rem one_agent <kind> <config file, empty for copilot/grok> <hooks dir>
:one_agent
if "%~2"=="" goto one_agent_json
if not exist "%~2" goto one_agent_script
findstr /c:"wtm-agent-report" "%~2" >nul || goto one_agent_script
call :need_absent "%~2%BAK%" "backup of the %~1 hook config"
set CMD=call :op_rewrite "%~2" "wtm-agent-report" "soda-agent-report"
call :do "rewrite the %~1 hook config: %~2 (original kept as %~nx2%BAK%)"
goto one_agent_script
:one_agent_json
if not exist "%~3\wtm-agent-report.json" goto one_agent_script
call :need_absent "%~3\soda-agent-report.json" "%~1 hook config"
call :need_absent "%~3\wtm-agent-report.json%BAK%" "backup of the %~1 hook config"
set CMD=call :op_rename_rewrite "%~3\wtm-agent-report.json" "%~3\soda-agent-report.json"
call :do "rename and rewrite the %~1 hook config: %~3\wtm-agent-report.json to soda-agent-report.json (original kept as wtm-agent-report.json%BAK%)"
:one_agent_script
if not exist "%~3\wtm-agent-report.cjs" exit /b 0
call :need_absent "%~3\soda-agent-report.cjs" "%~1 hook script"
call :need_absent "%~3\wtm-agent-report.cjs%BAK%" "backup of the %~1 hook script"
set "NEED_ASSET=1"
set CMD=call :op_replace_script "%~3\wtm-agent-report.cjs" "%~3\soda-agent-report.cjs"
call :do "replace the %~1 hook script with the new version: %~3\wtm-agent-report.cjs to soda-agent-report.cjs (original kept as wtm-agent-report.cjs%BAK%)"
exit /b 0
