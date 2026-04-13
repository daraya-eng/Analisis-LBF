@echo off
chcp 65001 >nul
echo ============================================
echo   ACTUALIZAR LBF Analytics
echo ============================================
echo.

:: Verificar admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecuta este script como ADMINISTRADOR
    pause
    exit /b 1
)

:: Refrescar PATH
set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Program Files\Python312;C:\Program Files\Python312\Scripts;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;C:\Program Files\Python313;C:\Program Files\Python313\Scripts;%LOCALAPPDATA%\Programs\Python\Python313;%LOCALAPPDATA%\Programs\Python\Python313\Scripts"

set APP_DIR=C:\lbf-analytics
set NSSM=%APP_DIR%\deploy\nssm.exe

:: --- Parar servicios ---
echo Deteniendo servicios...
%NSSM% stop LBF-Frontend >nul 2>&1
%NSSM% stop LBF-Backend >nul 2>&1
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
pip install -r requirements.txt --quiet
echo [OK] Backend actualizado
echo.

:: --- Frontend ---
echo Actualizando frontend...
cd /d %APP_DIR%\frontend
call npm install --silent
echo Recompilando (1-2 minutos)...
call npm run build
echo [OK] Frontend actualizado
echo.

:: --- Reiniciar servicios ---
echo Reiniciando servicios...
%NSSM% start LBF-Backend
timeout /t 3 /nobreak >nul
%NSSM% start LBF-Frontend
echo.

echo ============================================
echo   ACTUALIZACION COMPLETADA
echo   La app ya esta corriendo con la nueva version
echo ============================================
pause
