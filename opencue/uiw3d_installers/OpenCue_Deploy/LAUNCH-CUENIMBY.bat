@echo off
setlocal
title CueNIMBY - Debug Launch (close this window to quit)
color 0B

echo.
echo  ====================================================
echo   CueNIMBY Debug Launcher - %COMPUTERNAME%
echo   (This window shows all errors. Close it to quit.)
echo  ====================================================
echo.

set "PYTHON=C:\Program Files\Python39\python.exe"

if not exist "%PYTHON%" (
    echo ERROR: Python not found at:
    echo   %PYTHON%
    echo CueNIMBY cannot run without Python 3.9.
    goto :END
)

:: Quick import check first so any error is obvious
echo Checking cuenimby package...
"%PYTHON%" -c "import cuenimby" 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: cuenimby import failed - see above.
    echo Run UPDATE.bat from C:\ as admin first.
    goto :END
)
echo   OK - package imports without errors
echo.

:: Kill any existing pythonw CueNimby processes first
echo Stopping any existing CueNIMBY instance...
taskkill /F /IM pythonw.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul
echo   Done.
echo.

echo Starting CueNIMBY with visible output...
echo (Check the system tray - icon should appear)
echo.
echo --- CueNIMBY output below ---
"%PYTHON%" -m cuenimby --config "C:\OpenCue\config\cuenimby.json" --verbose

:END
echo.
echo --- CueNIMBY exited with code %ERRORLEVEL% ---
echo.
pause
endlocal
