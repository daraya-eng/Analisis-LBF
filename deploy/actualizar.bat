@echo off
chcp 65001 >nul
echo ============================================
echo   ACTUALIZAR LBF Analytics
echo ============================================
echo.

set APP_DIR=C:\lbf-analytics

:: --- Detener servicios ---
echo Deteniendo servicios...
taskkill /FI "WINDOWTITLE eq LBF-Backend" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq LBF-Frontend" /F >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] Servicios detenidos
echo.

:: --- Actualizar codigo ---
echo Descargando ultima version...
cd /d %APP_DIR%
git pull
echo.

:: --- Backend ---
echo Actualizando backend...
cd /d %APP_DIR%\backend
python -m pip install -r requirements.txt --quiet
echo [OK] Backend actualizado
echo.

:: --- Frontend ---
echo Actualizando frontend...
cd /d %APP_DIR%\frontend
call npm install --silent
echo Limpiando cache anterior...
if exist .next rd /s /q .next
echo Recompilando (1-2 minutos)...
call npm run build
echo [OK] Frontend actualizado
echo.

:: --- Reiniciar ---
echo Iniciando servicios...
start "LBF-Backend" /min cmd /c "cd /d %APP_DIR%\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak >nul
start "LBF-Frontend" /min cmd /c "cd /d %APP_DIR%\frontend && npm run start -- -p 3000"
echo.

echo ============================================
echo   ACTUALIZACION COMPLETADA
echo   http://192.0.0.137:3000
echo ============================================
pause
