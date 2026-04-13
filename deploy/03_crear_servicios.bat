@echo off
chcp 65001 >nul
echo ============================================
echo   PASO 3: Crear servicios Windows
echo ============================================
echo.

:: Verificar admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecuta este script como ADMINISTRADOR
    pause
    exit /b 1
)

set APP_DIR=C:\lbf-analytics
set NSSM=%APP_DIR%\deploy\nssm.exe

:: --- Descargar NSSM si no existe ---
if exist "%NSSM%" goto nssm_ok
echo Descargando NSSM (gestor de servicios)...
powershell -Command "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'"
powershell -Command "Expand-Archive -Path '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm' -Force"
copy "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" "%NSSM%"
echo [OK] NSSM descargado
:nssm_ok
echo.

:: --- Crear carpeta de logs ---
if not exist "%APP_DIR%\logs" mkdir "%APP_DIR%\logs"

:: --- Obtener rutas de Python y npm ---
for /f "delims=" %%i in ('where python') do set PYTHON_PATH=%%i
for /f "delims=" %%i in ('where npm.cmd') do set NPM_PATH=%%i

echo Python: %PYTHON_PATH%
echo npm:    %NPM_PATH%
echo.

:: --- Servicio Backend (FastAPI) ---
echo Creando servicio: LBF-Backend...
%NSSM% stop LBF-Backend >nul 2>&1
%NSSM% remove LBF-Backend confirm >nul 2>&1
%NSSM% install LBF-Backend "%PYTHON_PATH%" -m uvicorn main:app --host 0.0.0.0 --port 8000
%NSSM% set LBF-Backend AppDirectory %APP_DIR%\backend
%NSSM% set LBF-Backend DisplayName "LBF Analytics - Backend API"
%NSSM% set LBF-Backend Description "FastAPI backend para LBF Analytics"
%NSSM% set LBF-Backend Start SERVICE_AUTO_START
%NSSM% set LBF-Backend AppStdout %APP_DIR%\logs\backend.log
%NSSM% set LBF-Backend AppStderr %APP_DIR%\logs\backend_err.log
%NSSM% set LBF-Backend AppRotateFiles 1
%NSSM% set LBF-Backend AppRotateBytes 5000000
echo [OK] Servicio LBF-Backend creado
echo.

:: --- Servicio Frontend (Next.js) ---
echo Creando servicio: LBF-Frontend...
%NSSM% stop LBF-Frontend >nul 2>&1
%NSSM% remove LBF-Frontend confirm >nul 2>&1
%NSSM% install LBF-Frontend "%NPM_PATH%" run start -- -p 80
%NSSM% set LBF-Frontend AppDirectory %APP_DIR%\frontend
%NSSM% set LBF-Frontend DisplayName "LBF Analytics - Frontend"
%NSSM% set LBF-Frontend Description "Next.js frontend para LBF Analytics"
%NSSM% set LBF-Frontend Start SERVICE_AUTO_START
%NSSM% set LBF-Frontend AppStdout %APP_DIR%\logs\frontend.log
%NSSM% set LBF-Frontend AppStderr %APP_DIR%\logs\frontend_err.log
%NSSM% set LBF-Frontend AppRotateFiles 1
%NSSM% set LBF-Frontend AppRotateBytes 5000000
%NSSM% set LBF-Frontend AppEnvironmentExtra NEXT_PUBLIC_API_URL=http://localhost:8000
echo [OK] Servicio LBF-Frontend creado
echo.

:: --- Iniciar servicios ---
echo Iniciando servicios...
%NSSM% start LBF-Backend
timeout /t 3 /nobreak >nul
%NSSM% start LBF-Frontend
echo.

echo ============================================
echo   SERVICIOS CREADOS E INICIADOS
echo.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost (puerto 80)
echo.
echo   Los usuarios acceden desde su navegador:
echo   http://192.0.0.137
echo.
echo   Los servicios se inician automaticamente
echo   cuando se reinicia el servidor.
echo ============================================
pause
