@echo off
title PressPoint Print Agent Setup
color 0A
echo ========================================================
echo       PressPoint Windows Print Agent Installer
echo ========================================================
echo.

:: 1. Configuration & Web App Location
if "%APP_WEB_URL%"=="" set "APP_WEB_URL=https://cyber-cafer.onrender.com"
set "INSTALL_DIR=%LOCALAPPDATA%\PressPointPrintAgent"
echo [*] Installing to: %INSTALL_DIR%
echo [*] Web Application Location: %APP_WEB_URL%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\spool" mkdir "%INSTALL_DIR%\spool"

:: 2. Obtain Print Agent Runtime Files
echo [*] Provisioning Print Agent runtime files...
if exist "%~dp0print_agent_service.mjs" (
    copy /Y "%~dp0print_agent_service.mjs" "%INSTALL_DIR%\print_agent_service.mjs" >nul 2>&1
    echo [OK] Copied local agent file.
) else (
    echo [*] Fetching print_agent_service.mjs from %APP_WEB_URL%/print_agent_service.mjs...
    curl -s -f -o "%INSTALL_DIR%\print_agent_service.mjs" "%APP_WEB_URL%/print_agent_service.mjs"
    if exist "%INSTALL_DIR%\print_agent_service.mjs" (
        echo [OK] Successfully downloaded print_agent_service.mjs.
    ) else (
        echo [!] Warning: Could not download agent from %APP_WEB_URL%. Please ensure web server is running.
    )
)

:: 3. Provision Environment Configuration
if exist "%~dp0.env" (
    copy /Y "%~dp0.env" "%INSTALL_DIR%\.env" >nul 2>&1
    echo [OK] Copied environment configuration.
) else (
    (
    echo VITE_SUPABASE_URL=%VITE_SUPABASE_URL%
    echo VITE_SUPABASE_ANON_KEY=%VITE_SUPABASE_ANON_KEY%
    echo VITE_APP_WEB_URL=%APP_WEB_URL%
    ) > "%INSTALL_DIR%\.env"
)

:: 4. Configure Windows Automatic Startup on User Login (HKCU\Run)
echo [*] Configuring automatic startup in Windows Registry...
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PressPointPrintAgent" /t REG_SZ /d "\"%INSTALL_DIR%\run_agent.bat\"" /f >nul 2>&1
echo [OK] Automatic startup configured.

:: 5. Write launch script
(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo node print_agent_service.mjs
) > "%INSTALL_DIR%\run_agent.bat"

echo.
echo ========================================================
echo [OK] Print Agent setup completed successfully!
echo [*] Starting local agent interface on http://localhost:9876...
echo ========================================================
echo.

start "" "http://localhost:9876"
cd /d "%INSTALL_DIR%"
node print_agent_service.mjs
pause

