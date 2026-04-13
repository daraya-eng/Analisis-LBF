@echo off
chcp 65001 >nul
echo ============================================
echo   PASO 3: Configurar servicios LBF Analytics
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

:: --- Crear carpeta de logs ---
if not exist "%APP_DIR%\logs" mkdir "%APP_DIR%\logs"

:: --- Verificar Python real (no el stub de Windows Store) ---
echo Buscando Python real...
python -c "import sys; print(sys.executable)" > "%TEMP%\pypath.txt" 2>nul
set /p PYTHON_PATH=<"%TEMP%\pypath.txt"
del "%TEMP%\pypath.txt"

echo Python: %PYTHON_PATH%
echo.

:: --- Verificar que es Python real ---
python -c "print('ok')" >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Python no funciona correctamente.
    echo         Reinstala Python desde python.org y marca "Add to PATH"
    pause
    exit /b 1
)

:: --- Instalar uvicorn si falta ---
python -m uvicorn --version >nul 2>&1
if %errorLevel% neq 0 (
    echo Instalando uvicorn...
    python -m pip install uvicorn
)

:: --- Crear script de inicio ---
echo Creando script de inicio...
(
echo @echo off
echo chcp 65001 ^>nul
echo echo Iniciando LBF Analytics...
echo echo.
echo.
echo :: Iniciar Backend
echo echo Iniciando Backend API en puerto 8000...
echo start "LBF-Backend" /min cmd /c "cd /d %APP_DIR%\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 >> %APP_DIR%\logs\backend.log 2>> %APP_DIR%\logs\backend_err.log"
echo.
echo :: Esperar 3 segundos
echo timeout /t 3 /nobreak ^>nul
echo.
echo :: Iniciar Frontend
echo echo Iniciando Frontend en puerto 80...
echo start "LBF-Frontend" /min cmd /c "cd /d %APP_DIR%\frontend && npm run start -- -p 80 >> %APP_DIR%\logs\frontend.log 2>> %APP_DIR%\logs\frontend_err.log"
echo.
echo echo.
echo echo LBF Analytics iniciado correctamente.
echo echo   Backend:  http://localhost:8000
echo echo   Frontend: http://192.0.0.137
echo echo.
echo echo Puedes cerrar esta ventana. Los servicios seguiran corriendo.
) > "%APP_DIR%\iniciar_lbf.bat"
echo [OK] Script de inicio creado: %APP_DIR%\iniciar_lbf.bat
echo.

:: --- Crear script para detener ---
(
echo @echo off
echo echo Deteniendo LBF Analytics...
echo taskkill /FI "WINDOWTITLE eq LBF-Backend" /F ^>nul 2^>^&1
echo taskkill /FI "WINDOWTITLE eq LBF-Frontend" /F ^>nul 2^>^&1
echo taskkill /F /IM node.exe ^>nul 2^>^&1
echo echo [OK] Servicios detenidos.
echo pause
) > "%APP_DIR%\detener_lbf.bat"
echo [OK] Script de detener creado: %APP_DIR%\detener_lbf.bat
echo.

:: --- Crear tarea programada para inicio automatico ---
echo Creando tarea programada (inicio automatico con Windows)...
schtasks /delete /tn "LBF Analytics" /f >nul 2>&1
schtasks /create /tn "LBF Analytics" /tr "\"%APP_DIR%\iniciar_lbf.bat\"" /sc onstart /ru SYSTEM /rl HIGHEST /f
echo [OK] Tarea programada creada
echo.

:: --- Abrir puerto 80 y 8000 en firewall ---
echo Configurando firewall...
netsh advfirewall firewall delete rule name="LBF Analytics" >nul 2>&1
netsh advfirewall firewall add rule name="LBF Analytics" dir=in action=allow protocol=TCP localport=80,8000 >nul 2>&1
echo [OK] Firewall configurado (puertos 80 y 8000 abiertos)
echo.

:: --- Iniciar ahora ---
echo Iniciando LBF Analytics ahora...
call "%APP_DIR%\iniciar_lbf.bat"
echo.

echo ============================================
echo   TODO LISTO
echo.
echo   Los usuarios acceden desde su navegador:
echo   http://192.0.0.137
echo.
echo   Se inicia automaticamente al reiniciar
echo   el servidor.
echo.
echo   Para detener:  C:\lbf-analytics\detener_lbf.bat
echo   Para iniciar:  C:\lbf-analytics\iniciar_lbf.bat
echo ============================================
pause
