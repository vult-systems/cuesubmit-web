@echo off
:: CueGUI - Monitor Jobs and Hosts
set "CUEBOT_HOSTNAME=REDACTED_IP"
set "CUEBOT_HOSTS=REDACTED_IP:8443"

if exist "C:\Program Files\Python39\pythonw.exe" (
    start "" "C:\Program Files\Python39\pythonw.exe" -m cuegui
) else (
    echo [ERROR] Python not found. Run SetupClientTools.bat first.
    pause
)
