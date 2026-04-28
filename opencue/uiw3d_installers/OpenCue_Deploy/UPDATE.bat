@echo off
setlocal EnableExtensions EnableDelayedExpansion
title OpenCue Update - %COMPUTERNAME%
color 0A

:: ============================================================================
:: UPDATE.bat  —  OpenCue Incremental Update
::
:: Run automatically by REMOTE-UPDATE.bat (triggered from the web admin page).
:: Can also be run manually if needed.
::
:: For a FRESH INSTALL on a new/wiped machine, use INSTALL.bat instead.
::
:: Must be run as Administrator.
::
:: Copies updated Python source files from the UNC deploy share to the local
:: Python installation, then schedules a service restart 2 minutes later.
::
:: Usage:
::   UPDATE.bat [UNC_SHARE_PATH]
::
:: UNC share layout expected:
::   <share>\source\rqd\*.py          -> RQD source files
::   <share>\source\cuenimby\*.py     -> CueNIMBY source files
::   <share>\source\config\cuenimby.json
::   <share>\source\config\StartCueNimby.vbs
:: ============================================================================

set "UNC_BASE=%~1"
if "!UNC_BASE!"=="" set "UNC_BASE=\\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy"

:: /SILENT as second arg skips all pause calls (used when launched from a scheduled task)
set "SILENT=%~2"

set "PYTHON_SITE=C:\Program Files\Python39\Lib\site-packages"
set "OPENCUE_CONFIG=C:\OpenCue\config"
set "STARTUP_FOLDER=C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
set "LOG=C:\OpenCue\logs\update.log"

:: Ensure log directory exists
mkdir "C:\OpenCue\logs" >nul 2>&1

call :LOG "========================================="
call :LOG "OpenCue update started"
call :LOG "Source: !UNC_BASE!"
call :LOG "Host:   %COMPUTERNAME%"
echo.

:: ----------------------------------------------------------------------------
:: Admin check
:: ----------------------------------------------------------------------------
net session >nul 2>&1
if errorlevel 1 (
    call :LOG "ERROR: Not running as administrator. Re-run as admin."
    echo.
    if not "!SILENT!"=="/SILENT" pause
    exit /b 1
)

:: ----------------------------------------------------------------------------
:: Authenticate to the UNC deploy share
:: ----------------------------------------------------------------------------
call :LOG "Connecting to share..."
net use "!UNC_BASE!" /user:perforce uiw3d >nul 2>&1

if not exist "!UNC_BASE!\source\rqd\" (
    call :LOG "ERROR: Cannot reach !UNC_BASE!\source\rqd\"
    call :LOG "Run scripts/publish-to-share.ps1 on the admin machine first."
    echo.
    if not "!SILENT!"=="/SILENT" pause
    exit /b 1
)
call :LOG "Share accessible."
echo.

:: ----------------------------------------------------------------------------
:: Copy RQD source files
:: ----------------------------------------------------------------------------
call :LOG "Copying RQD sources..."
xcopy /Y /I "!UNC_BASE!\source\rqd\*.py" "!PYTHON_SITE!\rqd\" 2>>"!LOG!"
if errorlevel 1 (
    call :LOG "ERROR: Failed to copy RQD files (xcopy error %ERRORLEVEL%)"
    if not "!SILENT!"=="/SILENT" pause
    exit /b 1
)
call :LOG "RQD sources OK."
echo.

:: ----------------------------------------------------------------------------
:: Copy CueNIMBY source files (including new activity.py)
:: ----------------------------------------------------------------------------
call :LOG "Copying CueNIMBY sources..."
xcopy /Y /I "!UNC_BASE!\source\cuenimby\*.py" "!PYTHON_SITE!\cuenimby\" 2>>"!LOG!"
if errorlevel 1 (
    call :LOG "ERROR: Failed to copy CueNIMBY files (xcopy error %ERRORLEVEL%)"
    if not "!SILENT!"=="/SILENT" pause
    exit /b 1
)
call :LOG "CueNIMBY sources OK."
echo.

:: Verify the critical new file landed
if exist "!PYTHON_SITE!\cuenimby\activity.py" (
    call :LOG "Verified: activity.py is now in site-packages."
) else (
    call :LOG "WARNING: activity.py missing from site-packages after copy!"
)
echo.

:: Kill the running CueNimby process so it picks up new code on restart.
:: post-update.ps1 (SYSTEM) will relaunch it in the user session 30s from now.
call :LOG "Stopping CueNimby (old code will be replaced on relaunch)..."
taskkill /F /IM pythonw.exe /T >nul 2>&1
call :LOG "  pythonw.exe stopped."
echo.

:: ----------------------------------------------------------------------------
:: Copy config files
:: ----------------------------------------------------------------------------
call :LOG "Copying config files..."
if exist "!UNC_BASE!\source\config\cuenimby.json" (
    xcopy /Y /I "!UNC_BASE!\source\config\cuenimby.json" "!OPENCUE_CONFIG!\" 2>>"!LOG!"
    call :LOG "  cuenimby.json -> !OPENCUE_CONFIG!"
)
if exist "!UNC_BASE!\source\config\StartCueNimby.vbs" (
    xcopy /Y /I "!UNC_BASE!\source\config\StartCueNimby.vbs" "!STARTUP_FOLDER!\" 2>>"!LOG!"
    call :LOG "  StartCueNimby.vbs -> !STARTUP_FOLDER!"
)

:: Refresh opencue.yaml for any user profiles present
for /f "tokens=*" %%u in ('dir /b C:\Users ^| findstr /v /i "Public Default"') do (
    if exist "!UNC_BASE!\source\config\opencue.yaml" (
        mkdir "C:\Users\%%u\.config\opencue" >nul 2>&1
        xcopy /Y /I /Q "!UNC_BASE!\source\config\opencue.yaml" "C:\Users\%%u\.config\opencue\" >nul 2>&1
    )
)
call :LOG "Config files OK."
echo.

:: ----------------------------------------------------------------------------
:: Stage the post-update script (runs as SYSTEM when the task fires)
:: ----------------------------------------------------------------------------
call :LOG "Staging post-update.ps1 to C:\OpenCue\..."
xcopy /Y /I "!UNC_BASE!\post-update.ps1" "C:\OpenCue\" 2>>"!LOG!"
if errorlevel 1 (
    call :LOG "WARNING: Could not copy post-update.ps1 -- CueNimby auto-relaunch may not work"
) else (
    call :LOG "  post-update.ps1 staged OK."
)
echo.

:: ----------------------------------------------------------------------------
:: Schedule post-update task ~40 seconds from now (runs as SYSTEM).
:: Uses native schtasks /create to avoid the inline PowerShell hang that
:: occurs when Register-ScheduledTask is run from a non-interactive SYSTEM
:: session (the cmdlet blocks waiting for a desktop/window station).
:: ----------------------------------------------------------------------------
call :LOG "Scheduling post-update task in ~40 seconds..."

schtasks /delete /tn "OpenCueRQDRestart" /f >nul 2>&1

:: Compute the target time (now+40s) via a simple non-interactive PS call.
:: The result (HH:mm:ss) is written to a temp file then read back.
powershell.exe -NoProfile -NonInteractive -Command "(Get-Date).AddSeconds(40).ToString('HH:mm:ss') | Set-Content 'C:\OpenCue\sched_time.tmp' -Encoding ASCII" >nul 2>&1

set "SCHED_TIME="
for /f "usebackq tokens=*" %%T in ("C:\OpenCue\sched_time.tmp") do set "SCHED_TIME=%%T"
del "C:\OpenCue\sched_time.tmp" >nul 2>&1

if "!SCHED_TIME!"=="" (
    call :LOG "  WARNING: Could not compute schedule time -- falling back to +2 min"
    powershell.exe -NoProfile -NonInteractive -Command "(Get-Date).AddMinutes(2).ToString('HH:mm') | Set-Content 'C:\OpenCue\sched_time.tmp' -Encoding ASCII" >nul 2>&1
    for /f "usebackq tokens=*" %%T in ("C:\OpenCue\sched_time.tmp") do set "SCHED_TIME=%%T"
    del "C:\OpenCue\sched_time.tmp" >nul 2>&1
)

:: /tr has no spaces in the path so quotes around the path are not needed.
:: /rl HIGHEST = equivalent to RunLevel Highest (elevated SYSTEM).
schtasks /create /tn "OpenCueRQDRestart" /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -NonInteractive -File C:\OpenCue\post-update.ps1" /sc once /st "!SCHED_TIME!" /ru SYSTEM /rl HIGHEST /f >nul 2>&1

if errorlevel 1 (
    call :LOG "  WARNING: schtasks /create failed -- CueNimby relaunch may not occur"
) else (
    call :LOG "  Post-update task scheduled for !SCHED_TIME! (SYSTEM)"
)

call :LOG "RQD will restart (and CueNimby relaunch) at approximately !SCHED_TIME!."
echo.
call :LOG "========================================="
call :LOG "UPDATE COMPLETE on %COMPUTERNAME%"
call :LOG "========================================="
echo.
echo  RQD restarts in ~30 seconds. CueNimby will relaunch automatically.
echo  If CueNimby does not appear, run LaunchCueNimby.bat as the logged-in user.
echo.
if not "!SILENT!"=="/SILENT" pause
exit /b 0

:: ============================================================================
:LOG
:: Write message to both screen and log file
echo [%DATE% %TIME%] %~1
echo [%DATE% %TIME%] %~1 >> "!LOG!"
exit /b 0
exit /b 0
