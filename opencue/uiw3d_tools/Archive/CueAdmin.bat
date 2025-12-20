@echo off
:: CueAdmin - Command Line Administration
set "CUEBOT_HOSTNAME=REDACTED_IP"
set "CUEBOT_HOSTS=REDACTED_IP:8443"

if exist "C:\Program Files\Python39\python.exe" (
    "C:\Program Files\Python39\python.exe" -m cueadmin %*
) else (
    echo [ERROR] Python not found. Run SetupClientTools.bat first.
)
