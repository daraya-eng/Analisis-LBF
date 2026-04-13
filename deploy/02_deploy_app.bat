@echo off
chcp 65001 >nul
echo ============================================
echo   PASO 2: Desplegar LBF Analytics
echo ============================================
echo.

:: Refrescar PATH (despues de instalar Python/Node/Git el PATH no se actualiza en la misma ventana)
set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Program Files\Python312;C:\Program Files\Python312\Scripts;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;C:\Program Files\Python313;C:\Program Files\Python313\Scripts;%LOCALAPPDATA%\Programs\Python\Python313;%LOCALAPPDATA%\Programs\Python\Python313\Scripts"

:: Verificar que todo esta disponible
echo Verificando programas...
git --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Git no encontrado. Cierra TODAS las ventanas de CMD,
    echo         abre una nueva como Administrador y ejecuta este script de nuevo.
    echo         Si sigue fallando, reinicia el servidor.
    pause
    exit /b 1
)
echo [OK] Git encontrado

python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Python no encontrado. Cierra todas las ventanas de CMD y abre una nueva.
    pause
    exit /b 1
)
echo [OK] Python encontrado

node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js no encontrado. Cierra todas las ventanas de CMD y abre una nueva.
    pause
    exit /b 1
)
echo [OK] Node.js encontrado
echo.

set APP_DIR=C:\lbf-analytics
set REPO=https://github.com/daraya-eng/Analisis-LBF.git

:: --- Clonar o actualizar repositorio ---
if exist "%APP_DIR%\.git" (
    echo [OK] Repositorio ya existe, actualizando...
    cd /d %APP_DIR%
    git pull
) else (
    if exist "%APP_DIR%" (
        echo Carpeta existe pero no es un repo Git. Eliminando y clonando de nuevo...
        rmdir /s /q %APP_DIR%
    )
    echo Clonando repositorio desde GitHub...
    git clone %REPO% %APP_DIR%
    cd /d %APP_DIR%
)

if not exist "%APP_DIR%\backend\requirements.txt" (
    echo.
    echo [ERROR] El repositorio no se clono correctamente.
    echo         Verifica tu conexion a internet y que puedas acceder a:
    echo         %REPO%
    pause
    exit /b 1
)
echo [OK] Codigo descargado
echo.

:: --- Backend: instalar dependencias Python ---
echo Instalando dependencias Python (backend)...
cd /d %APP_DIR%\backend
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt --quiet
echo [OK] Dependencias Python instaladas
echo.

:: --- Crear carpeta data si no existe ---
if not exist "%APP_DIR%\backend\data" mkdir "%APP_DIR%\backend\data"

:: --- Frontend: instalar y compilar ---
echo Instalando dependencias Node.js (frontend)...
cd /d %APP_DIR%\frontend
call npm install
echo.

echo Compilando frontend (esto tarda 1-2 minutos)...
call npm run build
echo.

if exist "%APP_DIR%\frontend\.next" (
    echo ============================================
    echo   APP DESPLEGADA CORRECTAMENTE
    echo   Ahora:
    echo   1. Edita C:\lbf-analytics\frontend\.env.production
    echo      Cambia la IP por la de este servidor
    echo      (para saber la IP escribe: ipconfig)
    echo   2. Recompila: cd C:\lbf-analytics\frontend
    echo      npm run build
    echo   3. Ejecuta: 03_crear_servicios.bat
    echo ============================================
) else (
    echo [ERROR] El frontend no se compilo correctamente.
    echo         Revisa los errores arriba.
)
pause
