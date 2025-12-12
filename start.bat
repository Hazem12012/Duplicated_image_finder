
@echo off
echo ========================================
echo   Duplicate Image Finder
echo   Starting Application...
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Python is installed
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://www.python.org/
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo.
    echo WARNING: node_modules not found!
    echo Installing Node.js dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install Node.js dependencies
        pause
        exit /b 1
    )
)

echo Step 1: Starting Python API Server...
echo   (This will open in a new window)
start "Python API Server" cmd /k "python api_server.py"
timeout /t 4 /nobreak >nul

echo.
echo Step 2: Starting Electron App...
echo   (This window will show Electron output)
echo.
echo ========================================
echo   App should open shortly...
echo   If you see errors, check the Python server window
echo ========================================
echo.

call npm start

pause

