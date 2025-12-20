@echo off
:: CueSubmit - OpenCue Job Submission Tool
set "SCRIPT_DIR=%~dp0"

if exist "C:\Program Files\Python39\pythonw.exe" (
    start "" "C:\Program Files\Python39\pythonw.exe" "%SCRIPT_DIR%CueSubmit.py"
) else (
    echo [ERROR] Python not found. Run SetupClientTools.bat first.
    pause
)
