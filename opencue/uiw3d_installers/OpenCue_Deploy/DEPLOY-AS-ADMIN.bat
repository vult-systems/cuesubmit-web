@echo off
setlocal EnableExtensions EnableDelayedExpansion

:: ============================================================================
:: DEPLOY-AS-ADMIN.bat
::
:: Launched by the OpenCue RQD render frame (non-admin context).
:: Creates a scheduled task that runs UPDATE.bat elevated as the local admin
:: account (.\csadminXXX), then immediately triggers it.
::
:: The local admin username is derived from the computer name:
::   AD400-BYWXK44  ->  room=400  ->  .\csadmin400
::   AD415-XXXXXXXX ->  room=415  ->  .\csadmin415
::
:: Usage (called from RQD frame command):
::   DEPLOY-AS-ADMIN.bat \\<server>\<share>
:: ============================================================================

set "SHARE=%~1"
if "!SHARE!"=="" set "SHARE=\\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy"

:: COMPUTERNAME is not passed through by RQD — use 'hostname' command instead
for /f "tokens=*" %%h in ('hostname') do set "HOST=%%h"
:: Derive room number from hostname (chars 2-4, e.g. AD400-BYWXK44 -> 400)
set "ROOM=!HOST:~2,3!"
set "PASS=Adam12-angd"

:: schtasks /ru requires COMPUTERNAME\username for local accounts
set "ADMIN_FULL=!HOST!\csadmin!ROOM!"

echo.
echo [DEPLOY] Host:   !HOST!
echo [DEPLOY] Admin:  !ADMIN_FULL!
echo [DEPLOY] Share:  !SHARE!
echo.

:: Delete any leftover task from a previous run
schtasks /delete /tn "OC_Deploy" /f >nul 2>&1

:: Create the scheduled task to run UPDATE.bat elevated as local admin.
:: /sc once /st 00:00  = one-shot trigger (we use /run to fire it immediately)
:: /rl HIGHEST         = elevated (bypasses UAC token filtering)
:: /f                  = force overwrite
::
:: net use inside the task command: the scheduled task runs in a FRESH logon
:: session (different from the RQD process session), so /user:perforce works
:: without conflicting with RQD's existing SMB session to the same server.
schtasks /create ^
    /tn "OC_Deploy" ^
    /tr "cmd.exe /c net use !SHARE! /user:perforce uiw3d >nul 2>&1 && !SHARE!\UPDATE.bat !SHARE! /SILENT" ^
    /sc once /st 00:00 ^
    /ru "!ADMIN_FULL!" /rp "!PASS!" ^
    /rl HIGHEST /f

if errorlevel 1 (
    echo [DEPLOY] ERROR: schtasks /create failed ^(exit %ERRORLEVEL%^)
    echo [DEPLOY] Check admin credentials and task scheduler permissions.
    exit /b 1
)

:: Trigger it immediately (async - returns right away, task runs in background)
schtasks /run /tn "OC_Deploy"
if errorlevel 1 (
    echo [DEPLOY] ERROR: schtasks /run failed ^(exit %ERRORLEVEL%^)
    exit /b 1
)

echo.
echo [DEPLOY] Task launched. UPDATE.bat is running elevated as !ADMIN_FULL! in the background.
echo [DEPLOY] Progress log: C:\OpenCue\logs\update.log
echo [DEPLOY] RQD will restart ~2 minutes after update completes.
echo.
exit /b 0
