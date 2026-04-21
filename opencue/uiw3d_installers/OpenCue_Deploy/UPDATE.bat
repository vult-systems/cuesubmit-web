@echo off
setlocal EnableExtensions EnableDelayedExpansion
title OpenCue Update - %COMPUTERNAME%
color 0A

:: ============================================================================
:: OpenCue Incremental Update Script
::
:: IMPORTANT: Copy this file to C:\ before running. Do NOT run from a UNC path.
::   copy \\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy\UPDATE.bat C:\UPDATE.bat
::   C:\UPDATE.bat
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
:: Schedule post-update task 30 seconds from now (runs as SYSTEM).
:: Restarts OpenCueRQD AND relaunches CueNimby in the active user session.
:: 30s is enough: DEPLOY-AS-ADMIN.bat exits immediately after launching the
:: admin schtask, so the OpenCue frame reports Done well before this fires.
:: ----------------------------------------------------------------------------
call :LOG "Scheduling post-update task in 30 seconds..."

schtasks /delete /tn "OpenCueRQDRestart" /f >nul 2>&1

powershell.exe -NoProfile -Command " ^
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File ""C:\OpenCue\post-update.ps1""'; ^
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(30); ^
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest; ^
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5); ^
    Register-ScheduledTask -TaskName 'OpenCueRQDRestart' -Action $action -Trigger $trigger ^
        -Principal $principal -Settings $settings -Force | Out-Null; ^
    Write-Host '  Task registered OK'"

call :LOG "RQD will restart (and CueNimby relaunch) at approximately %TIME% +30s."
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
