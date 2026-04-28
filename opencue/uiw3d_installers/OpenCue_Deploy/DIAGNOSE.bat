@echo off
setlocal EnableExtensions EnableDelayedExpansion
title OpenCue Diagnostics
color 0A

:: Run from C: drive - do NOT run this from a UNC path
:: Copy this file locally first: copy \\server\share\DIAGNOSE.bat C:\DIAGNOSE.bat

echo.
echo  =====================================================
echo   OpenCue Diagnostics - %COMPUTERNAME%
echo  =====================================================
echo.

set "PYTHON=C:\Program Files\Python39\python.exe"
set "SITE=C:\Program Files\Python39\Lib\site-packages"
set "UNC=\\10.40.14.25\RenderSourceRepository\Utility\OpenCue_Deploy"
set "LOG=C:\OpenCue\logs\update.log"

:: -------------------------------------------------------------------
echo [1] Admin check
net session >nul 2>&1
if errorlevel 1 (
    echo   WARNING: Not running as administrator
    echo   Some checks may fail. Right-click DIAGNOSE.bat and Run as administrator.
) else (
    echo   OK - running as administrator
)
echo.

:: -------------------------------------------------------------------
echo [2] Python 3.9
if exist "%PYTHON%" (
    echo   Found: %PYTHON%
    "%PYTHON%" --version
) else (
    echo   ERROR: Python not found at %PYTHON%
)
echo.

:: -------------------------------------------------------------------
echo [3] CueNIMBY package in site-packages
if exist "%SITE%\cuenimby\" (
    echo   OK - cuenimby package folder exists
    echo   Files:
    dir /b "%SITE%\cuenimby\*.py" 2>nul | findstr /v __pycache__
) else (
    echo   ERROR: %SITE%\cuenimby\ not found
    echo   OpenCue was not fully installed - run DEPLOY.bat
)
echo.

:: -------------------------------------------------------------------
echo [4] activity.py present  ^(NEW FILE - required for NIMBY to work^)
if exist "%SITE%\cuenimby\activity.py" (
    echo   OK - activity.py is present
) else (
    echo   MISSING - activity.py not found
    echo   This is why CueNIMBY fails to start silently.
    echo   Run UPDATE.bat from C: drive to fix this.
)
echo.

:: -------------------------------------------------------------------
echo [5] Import test - will show any Python errors
echo   Running: python -c "import cuenimby"
"%PYTHON%" -c "import cuenimby; print('  OK - cuenimby imports successfully')" 2>&1
echo.

:: -------------------------------------------------------------------
echo [6] RQD service status
sc query OpenCueRQD 2>nul | findstr /i "STATE"
if errorlevel 1 echo   ERROR: OpenCueRQD service not found
echo.

:: -------------------------------------------------------------------
echo [7] Cuebot TCP connectivity ^(port 8443^)
for /f "tokens=2 delims=: " %%h in ('findstr /i "cuebot_host" "C:\OpenCue\config\cuenimby.json" 2^>nul') do (
    set "CBHOST=%%~h"
    set "CBHOST=!CBHOST: =!"
    set "CBHOST=!CBHOST:,=!"
    set "CBHOST=!CBHOST:"=!"
)
if defined CBHOST (
    echo   Cuebot host from config: !CBHOST!
    echo   Testing TCP port 8443...
    powershell -Command "
        try {
            $t = New-Object Net.Sockets.TcpClient
            $t.Connect('!CBHOST!', 8443)
            if ($t.Connected) { Write-Host '  OK - port 8443 is reachable'; $t.Close() }
        } catch {
            Write-Host '  ERROR - port 8443 is NOT reachable'
            Write-Host "  Detail: $_"
            Write-Host ''
            Write-Host '  Possible causes:'
            Write-Host '    1. Windows Firewall on this machine blocking outbound 8443'
            Write-Host '    2. Server firewall blocking this machine specifically'
            Write-Host '    3. Docker/Cuebot container not running on the server'
        }
    "
) else (
    echo   Could not read cuebot_host from cuenimby.json
)
echo.

:: -------------------------------------------------------------------
echo [8] UNC share access
echo   Testing: %UNC%
if exist "%UNC%\" (
    echo   OK - share is reachable
    if exist "%UNC%\source\rqd\" (
        echo   OK - source\rqd\ folder exists on share
    ) else (
        echo   MISSING - source\rqd\ not on share yet
        echo   Run: scripts\publish-to-share.ps1  from the admin machine
    )
    if exist "%UNC%\source\cuenimby\activity.py" (
        echo   OK - activity.py is on the share
    ) else (
        echo   MISSING - activity.py not on share
    )
) else (
    echo   Attempting net use...
    net use "%UNC%" /user:perforce uiw3d >nul 2>&1
    if exist "%UNC%\" (
        echo   OK - connected after net use
    ) else (
        echo   ERROR - cannot reach share
    )
)
echo.

:: -------------------------------------------------------------------
echo [9] C:\OpenCue\config
if exist "C:\OpenCue\config\cuenimby.json" (
    echo   OK - cuenimby.json exists
    echo   Contents:
    type "C:\OpenCue\config\cuenimby.json"
) else (
    echo   ERROR: C:\OpenCue\config\cuenimby.json not found
)
echo.

:: -------------------------------------------------------------------
echo [10] Startup entry
set "STARTUP=C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\StartCueNimby.vbs" (
    echo   OK - StartCueNimby.vbs is in Startup folder
) else (
    echo   MISSING - StartCueNimby.vbs not in Startup folder
)
echo.

:: -------------------------------------------------------------------
echo [11] Last update log
if exist "%LOG%" (
    echo   --- Last 30 lines of %LOG% ---
    powershell -Command "Get-Content '%LOG%' | Select-Object -Last 30"
) else (
    echo   No update log found at %LOG%
    echo   UPDATE.bat has not been run yet, or log dir missing.
)
echo.

echo  =====================================================
echo   Diagnostics complete
echo  =====================================================
echo.
echo  To fix: copy UPDATE.bat to C:\ and run as admin:
echo    copy "%UNC%\UPDATE.bat" C:\UPDATE.bat
echo    C:\UPDATE.bat
echo.
endlocal
