@echo off
:: CueGUI - Monitor Jobs and Hosts
set "CUEBOT_HOSTNAME=10.40.14.25"
set "CUEBOT_HOSTS=10.40.14.25:8443"

if exist "C:\Program Files\Python39\pythonw.exe" (
    start "" "C:\Program Files\Python39\pythonw.exe" -m cuegui
) else (
    echo [ERROR] Python not found. Run SetupClientTools.bat first.
    pause
)
