' CueNIMBY Startup Script
' This script launches CueNIMBY in the background without showing a console window
' Place in: C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup

Set WshShell = CreateObject("WScript.Shell")
Set WshEnv = WshShell.Environment("Process")

' Set environment variables for pycue connection
' These ensure cuenimby can connect to cuebot even if machine-level vars aren't loaded yet
WshEnv("CUEBOT_HOSTS") = "REDACTED_IP:8443"
WshEnv("CUEBOT_HOSTNAME") = "REDACTED_IP"

' Launch cuenimby using pythonw (windowless Python)
' Configuration is loaded from C:\OpenCue\config\cuenimby.json
WshShell.Run """C:\Program Files\Python39\pythonw.exe"" -m cuenimby --config ""C:\OpenCue\config\cuenimby.json"" --verbose", 0, False

Set WshEnv = Nothing
Set WshShell = Nothing
