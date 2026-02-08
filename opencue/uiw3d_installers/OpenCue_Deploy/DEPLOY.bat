@echo off
setlocal EnableExtensions EnableDelayedExpansion
title OpenCue RQD Deployment
color 0A

:: ============================================================================
:: OpenCue RQD Deployment
:: - PS Remoting enabled
:: - Lab-aware service account (csadmin###)
:: - Machine-level lab tagging (UIW3D_LAB)
:: - Perforce creds seeded for SYSTEM + service account
:: ============================================================================

echo.
echo  ============================================
echo   OpenCue RQD Deployment
echo  ============================================
echo.
echo   Starting deployment script...
echo   If this window closes immediately, run from
echo   an elevated Command Prompt instead.
echo.

:: --- Admin check ---
net session >nul 2>&1 || (
    echo [ERROR] Run as Administrator
    echo         Right-click DEPLOY.bat ^> Run as administrator
    pause
    exit /b 1
)

:: --- Paths ---
set "SCRIPT_DIR=%~dp0"
set "UTILS_DIR=%SCRIPT_DIR%utils\"
set "NSSM=%UTILS_DIR%nssm-2.24\win64\nssm.exe"
set "PY_INSTALLER=%UTILS_DIR%python-3.9.13-amd64.exe"
set "PYTHON_EXE=C:\Program Files\Python39\python.exe"

:: --- Core config ---
set "CUEBOT_IP=REDACTED_IP"
set "CUEBOT_PORT=8443"
set "RQD_PORT=8444"
set "DEFAULT_PASS=Adam12-angd"

:: ============================================================================
:: Lab / room auto-detection
:: ============================================================================
echo [Lab Setup]

:: Try to auto-detect room number from current username (e.g., csadmin400 -> 400)
set "LABNUM="
set "CURRENT_USER=%USERNAME%"
echo   Current user: %CURRENT_USER%

:: Extract digits from username (works for csadmin400, csadmin404, etc.)
for /f "tokens=* delims=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" %%a in ("%CURRENT_USER%") do set "LABNUM=%%a"

if "%LABNUM%"=="" (
    echo   Could not auto-detect room number from username.
    set /p "LABNUM=Enter room number (e.g., 400, 404, 405): "
    if "!LABNUM!"=="" set "LABNUM=400"
) else (
    echo   Auto-detected room: %LABNUM%
)

set "LAB_TAG=AD%LABNUM%"
set "SERVICE_USER=.\csadmin%LABNUM%"
set "SERVICE_PASS=%DEFAULT_PASS%"

echo   Service user: %SERVICE_USER%
echo   Lab tag: %LAB_TAG%
echo   Password: [using default]
echo.
pause

:: --- Machine-level lab identity ---
setx UIW3D_LAB "%LAB_TAG%" /M >nul
reg add "HKLM\SOFTWARE\UIW3D" /v Lab /t REG_SZ /d "%LAB_TAG%" /f >nul

:: ============================================================================
:: Verify required files
:: ============================================================================
echo [1/10] Verifying deployment files...
if not exist "%NSSM%" (
    echo   [ERROR] NSSM not found: %NSSM%
    pause
    exit /b 1
)
if not exist "%UTILS_DIR%wheels\*.whl" (
    echo   [ERROR] Wheel packages missing in utils\wheels\
    pause
    exit /b 1
)
echo   OK

:: ============================================================================
:: Enable PS Remoting / WinRM
:: ============================================================================
echo [2/10] Enabling PowerShell Remoting (WinRM)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "Enable-PSRemoting -Force -SkipNetworkProfileCheck | Out-Null;" ^
  "Get-NetConnectionProfile | Where-Object {$_.NetworkCategory -eq 'Public'} | ForEach-Object { Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private };" ^
  "Enable-NetFirewallRule -DisplayGroup 'Windows Remote Management' -ErrorAction SilentlyContinue | Out-Null;" ^
  "Set-Service WinRM -StartupType Automatic;" ^
  "Restart-Service WinRM -Force;" ^
  "New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Force -ErrorAction SilentlyContinue | Out-Null;" ^
  "New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'LocalAccountTokenFilterPolicy' -PropertyType DWord -Value 1 -Force -ErrorAction SilentlyContinue | Out-Null;"
echo   OK

net localgroup "Remote Management Users" "%SERVICE_USER%" /add >nul 2>&1
net localgroup "Administrators" "%SERVICE_USER%" /add >nul 2>&1

:: ============================================================================
:: Seed network credentials for render output share
:: ============================================================================
echo [3/10] Setting up network credentials...

:: Add credentials for the service account to access the render output share
:: This runs as the current admin user - credentials will be available to service
cmdkey /add:%CUEBOT_IP% /user:perforce /pass:uiw3d >nul 2>&1

:: Also try to map the drive to verify access works
net use \\%CUEBOT_IP%\RenderOutputRepo /user:perforce uiw3d >nul 2>&1
if errorlevel 1 (
    echo   [WARN] Could not verify access to \\%CUEBOT_IP%\RenderOutputRepo
    echo          Renders may fail to write output files
) else (
    echo   Network share access verified
    net use \\%CUEBOT_IP%\RenderOutputRepo /delete >nul 2>&1
)
echo   OK

:: ============================================================================
:: Remove existing service
:: ============================================================================
echo [4/10] Removing existing OpenCueRQD service...
net stop OpenCueRQD >nul 2>&1
"%NSSM%" remove OpenCueRQD confirm >nul 2>&1
echo   OK

:: ============================================================================
:: Python install
:: ============================================================================
echo [5/10] Checking Python 3.9...
if not exist "%PYTHON_EXE%" (
    "%PY_INSTALLER%" /quiet InstallAllUsers=1 PrependPath=1 TargetDir="C:\Program Files\Python39"
    timeout /t 10 >nul
)
echo   OK

:: ============================================================================
:: Python packages
:: ============================================================================
echo [6/10] Installing OpenCue packages...
"%PYTHON_EXE%" -m pip install --upgrade pip -q
for %%w in ("%UTILS_DIR%wheels\*.whl") do (
    "%PYTHON_EXE%" -m pip install "%%w" -q
)
"%PYTHON_EXE%" -m pip install wmi pywin32 -q
:: Install CueNIMBY dependencies for system tray, notifications, and activity detection
"%PYTHON_EXE%" -m pip install pystray Pillow plyer pynput -q
echo   OK

:: ============================================================================
:: Directories + config
:: ============================================================================
echo [7/10] Setting up directories...
mkdir C:\OpenCue\config >nul 2>&1
mkdir C:\OpenCue\logs >nul 2>&1
copy /y "%UTILS_DIR%config\*" "C:\OpenCue\config\" >nul
copy /y "%NSSM%" "C:\OpenCue\nssm.exe" >nul

:: Replace __LAB_TAG__ placeholder in rqd.conf with actual lab tag
powershell -Command "(Get-Content 'C:\OpenCue\config\rqd.conf') -replace '__LAB_TAG__', '%LAB_TAG%' | Set-Content 'C:\OpenCue\config\rqd.conf'"

:: Setup pycue config file (opencue.yaml) for all users
:: pycue looks for config in %USERPROFILE%\.config\opencue\opencue.yaml
echo   Setting up pycue config...
for /f "tokens=*" %%u in ('dir /b C:\Users ^| findstr /v /i "Public Default"') do (
    mkdir "C:\Users\%%u\.config\opencue" >nul 2>&1
    copy /y "%UTILS_DIR%config\opencue.yaml" "C:\Users\%%u\.config\opencue\" >nul 2>&1
)
:: Also set for Default profile (new users)
mkdir "C:\Users\Default\.config\opencue" >nul 2>&1
copy /y "%UTILS_DIR%config\opencue.yaml" "C:\Users\Default\.config\opencue\" >nul 2>&1

:: Setup CueNIMBY for user-session NIMBY control
echo   Setting up CueNIMBY auto-start...
set "STARTUP_FOLDER=C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
copy /y "%UTILS_DIR%config\StartCueNimby.vbs" "%STARTUP_FOLDER%\" >nul
echo   OK

:: ============================================================================
:: Environment + firewall
:: ============================================================================
echo [8/10] Environment + firewall...
setx ADSKFLEX_LICENSE_FILE "27000@jabba.ad.uiwtx.edu" /M >nul
setx CUEBOT_HOSTNAME "%CUEBOT_IP%" /M >nul
setx CUEBOT_HOSTS "%CUEBOT_IP%:%CUEBOT_PORT%" /M >nul

:: Maya environment - add to system PATH
set "MAYA_FOUND=0"
for %%Y in (2026 2025 2024) do (
    if "!MAYA_FOUND!"=="0" (
        set "MAYA_BIN=C:\Program Files\Autodesk\Maya%%Y\bin"
        if exist "!MAYA_BIN!" (
            powershell -Command "$oldPath = [Environment]::GetEnvironmentVariable('Path', 'Machine'); if ($oldPath -notlike '*Maya%%Y*') { [Environment]::SetEnvironmentVariable('Path', $oldPath + ';!MAYA_BIN!', 'Machine') }"
            echo   Maya %%Y added to PATH
            set "MAYA_FOUND=1"
        )
    )
)
if "!MAYA_FOUND!"=="0" (
    echo   [WARN] Maya not found - Render command may fail
)

netsh advfirewall firewall delete rule name="OpenCue RQD" >nul 2>&1
netsh advfirewall firewall add rule name="OpenCue RQD" dir=in action=allow protocol=tcp localport=%RQD_PORT% >nul
echo   OK

:: ============================================================================
:: Install service
:: ============================================================================
echo [9/10] Installing OpenCueRQD service...
"C:\OpenCue\nssm.exe" install OpenCueRQD "%PYTHON_EXE%" >nul
"C:\OpenCue\nssm.exe" set OpenCueRQD AppParameters "-m rqd -c C:\OpenCue\config\rqd.conf" >nul
"C:\OpenCue\nssm.exe" set OpenCueRQD AppDirectory "C:\OpenCue" >nul
"C:\OpenCue\nssm.exe" set OpenCueRQD Start SERVICE_AUTO_START >nul
"C:\OpenCue\nssm.exe" set OpenCueRQD AppStdout "C:\OpenCue\logs\rqd_stdout.log" >nul
"C:\OpenCue\nssm.exe" set OpenCueRQD AppStderr "C:\OpenCue\logs\rqd_stderr.log" >nul

:: Try service account first, fall back to LocalSystem if it fails
"C:\OpenCue\nssm.exe" set OpenCueRQD ObjectName "%SERVICE_USER%" "%SERVICE_PASS%" >nul 2>&1
net start OpenCueRQD >nul 2>&1
if errorlevel 1 (
    echo   [WARN] Service account failed, using LocalSystem instead
    net stop OpenCueRQD >nul 2>&1
    "C:\OpenCue\nssm.exe" set OpenCueRQD ObjectName "LocalSystem" >nul
    net start OpenCueRQD >nul 2>&1
)

:: ============================================================================
:: Post-checks (minimal, with why)
:: ============================================================================
echo.
echo  ============================================
echo   Post-checks
echo  ============================================

sc query OpenCueRQD | findstr RUNNING >nul && (
  echo  RQD: RUNNING
) || (
  echo  RQD: NOT RUNNING
  echo       WHY: check C:\OpenCue\logs\rqd_stderr.log
)

powershell.exe -NoProfile -Command "Test-WSMan localhost" >nul 2>&1 && (
  echo  WinRM: OK
) || (
  echo  WinRM: FAIL
  echo       WHY: remoting into this machine will fail
)

powershell.exe -NoProfile -Command ^
  "(Test-NetConnection localhost -Port 5985).TcpTestSucceeded" | findstr True >nul && (
  echo  Port 5985: OK
) || (
  echo  Port 5985: FAIL
)

powershell.exe -NoProfile -Command ^
  "(Test-NetConnection localhost -Port %RQD_PORT%).TcpTestSucceeded" | findstr True >nul && (
  echo  Port %RQD_PORT%: OK
) || (
  echo  Port %RQD_PORT%: FAIL
)

echo  Lab tag: %LAB_TAG%
echo  ============================================
echo   Deployment complete
echo  ============================================

pause
endlocal
