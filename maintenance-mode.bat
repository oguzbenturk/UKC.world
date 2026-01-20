@echo off
REM Plannivo Maintenance Mode - Windows Batch Wrapper

if "%1"=="" (
    echo Usage: maintenance-mode.bat [on^|off^|status]
    echo.
    echo Examples:
    echo   maintenance-mode.bat on       - Enable maintenance mode
    echo   maintenance-mode.bat off      - Disable maintenance mode
    echo   maintenance-mode.bat status   - Check status
    exit /b 1
)

node maintenance-mode.js %*
