@echo off
setlocal
title OpenCue Client Tools Setup

:: ============================================================================
:: OpenCue Client Tools Setup
:: Run once to install CueSubmit, CueGUI, CueAdmin
:: ============================================================================

echo.
echo  OpenCue Client Tools Setup
echo  ==========================
echo.

:: --- Check Python ---
set "PYTHON_EXE=C:\Program Files\Python39\python.exe"
if not exist "%PYTHON_EXE%" (
    echo [ERROR] Python 3.9 not found.
    echo        Install Python first or run the full RQD deployment.
    pause
    exit /b 1
)

:: --- Store network credentials ---
echo [1/3] Storing network credentials...
cmdkey /add:REDACTED_IP /user:perforce /pass:uiw3d >nul

:: --- Install packages from wheels ---
echo [2/3] Installing OpenCue packages...
set "WHEELS=\\REDACTED_IP\RenderSourceRepository\Utility\OpenCue_Deploy\wheels"

"%PYTHON_EXE%" -m pip install --upgrade pip -q --no-warn-script-location
for %%w in ("%WHEELS%\*.whl") do (
    "%PYTHON_EXE%" -m pip install "%%w" -q --no-warn-script-location
)
"%PYTHON_EXE%" -m pip install PySide2 qtpy -q --no-warn-script-location

:: --- Verify installation ---
echo [3/3] Verifying installation...
"%PYTHON_EXE%" -c "import opencue; import cuesubmit; import cuegui; print('       All packages installed!')"
if %errorlevel% neq 0 (
    echo [ERROR] Installation failed.
    pause
    exit /b 1
)

echo.
echo  [SUCCESS] Setup complete!
echo.
echo  You can now use:
echo    - CueSubmit.bat  (submit jobs)
echo    - CueGUI.bat     (monitor jobs)
echo    - CueAdmin.bat   (command line)
echo.
pause
