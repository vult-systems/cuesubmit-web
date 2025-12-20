@echo off
:: CueAdmin - Command Line Administration
set "CUEBOT_HOSTNAME=10.40.14.25"
set "CUEBOT_HOSTS=10.40.14.25:8443"

if exist "C:\Program Files\Python39\python.exe" (
    "C:\Program Files\Python39\python.exe" -m cueadmin %*
) else (
    echo [ERROR] Python not found. Run SetupClientTools.bat first.
)
