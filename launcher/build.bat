@echo off
REM Windows build script for CueWeb Launcher
REM This builds the Zig launcher and packages the Next.js standalone app

setlocal enabledelayedexpansion

REM Get script directory
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."

echo ========================================
echo Building CueWeb Launcher for Windows
echo ========================================

REM Step 1: Build Next.js with webpack (not turbopack, due to Windows path issues)
echo.
echo [1/4] Building Next.js app with webpack...
if exist ".next" (
    rmdir /s /q ".next"
)
call npx next build --webpack
if errorlevel 1 (
    echo ERROR: Next.js build failed!
    exit /b 1
)

REM Step 2: Build Zig launcher
echo.
echo [2/4] Building Zig launcher...
cd launcher
zig build -Doptimize=ReleaseSmall
if errorlevel 1 (
    echo ERROR: Zig build failed!
    exit /b 1
)

REM Step 3: Copy standalone app to zig-out/bin
echo.
echo [3/4] Copying standalone app...
cd zig-out\bin
if exist "app" (
    rmdir /s /q "app"
)
xcopy /E /I /Y "..\..\..\..\.next\standalone" "app"
xcopy /E /I /Y "..\..\..\..\.next\static" "app\.next\static"
xcopy /E /I /Y "..\..\..\..\public" "app\public"

REM Step 4: Copy config file
echo.
echo [4/4] Copying config file...
copy /Y "..\..\config.json" "config.json" 2>nul
if not exist "config.json" (
    echo Creating default config.json...
    (
        echo {
        echo   "port": 3000,
        echo   "mode": "offline",
        echo   "nodePath": "node",
        echo   "serverEntry": "./app/server.js",
        echo   "openBrowser": true,
        echo   "urlPath": "/",
        echo   "logFile": "./logs/cueweb-launcher.log"
        echo }
    ) > config.json
)

echo.
echo ========================================
echo Build complete!
echo ========================================
echo.
echo Output: %SCRIPT_DIR%zig-out\bin\
echo   - cueweb-launcher.exe
echo   - app\ (Next.js standalone)
echo   - config.json
echo.
echo To run: cd zig-out\bin ^&^& cueweb-launcher.exe
echo.

cd /d "%SCRIPT_DIR%"
