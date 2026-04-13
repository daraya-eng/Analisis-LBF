@echo off
chcp 65001 >nul
echo Iniciando LBF Analytics...
echo.

set APP_DIR=C:\lbf-analytics

:: Iniciar Backend
echo Iniciando Backend API en puerto 8000...
start "LBF-Backend" /min cmd /c "cd /d %APP_DIR%\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000"

:: Esperar 3 segundos
timeout /t 3 /nobreak >nul

:: Iniciar Frontend
echo Iniciando Frontend en puerto 3000...
start "LBF-Frontend" /min cmd /c "cd /d %APP_DIR%\frontend && npm run start -- -p 3000"

echo.
echo LBF Analytics iniciado correctamente.
echo   Backend:  http://localhost:8000
echo   Frontend: http://192.0.0.137:3000
echo.
