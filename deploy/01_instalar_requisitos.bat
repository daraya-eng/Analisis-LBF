@echo off
chcp 65001 >nul
echo ============================================
echo   PASO 1: Instalar requisitos en el servidor
echo ============================================
echo.

:: Verificar si se ejecuta como administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecuta este script como ADMINISTRADOR
    echo    Click derecho → Ejecutar como administrador
    pause
    exit /b 1
)

echo Verificando programas instalados...
echo.

:: --- Python ---
python --version >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Python ya esta instalado:
    python --version
) else (
    echo [FALTA] Python no encontrado. Descargando...
    echo.
    echo    DESCARGA MANUAL: https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe
    echo.
    echo    IMPORTANTE al instalar:
    echo      [x] Add Python to PATH  ← MARCAR ESTA CASILLA
    echo      → Install Now
    echo.
    start https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe
    echo Cuando termine de instalar Python, CIERRA esta ventana y ejecuta este script de nuevo.
    pause
    exit /b 1
)
echo.

:: --- Node.js ---
node --version >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Node.js ya esta instalado:
    node --version
) else (
    echo [FALTA] Node.js no encontrado. Descargando...
    echo.
    echo    Se abrira el instalador. Haz click en Next → Next → Install.
    echo.
    start https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi
    echo Cuando termine de instalar Node.js, CIERRA esta ventana y ejecuta este script de nuevo.
    pause
    exit /b 1
)
echo.

:: --- Git ---
git --version >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Git ya esta instalado:
    git --version
) else (
    echo [FALTA] Git no encontrado. Descargando...
    echo.
    echo    Se abrira el instalador. Haz click en Next en todo hasta Install.
    echo.
    start https://github.com/git-for-windows/git/releases/download/v2.47.0.windows.2/Git-2.47.0.2-64-bit.exe
    echo Cuando termine de instalar Git, CIERRA esta ventana y ejecuta este script de nuevo.
    pause
    exit /b 1
)
echo.

:: --- ODBC Driver 18 ---
reg query "HKLM\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server" >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] ODBC Driver 18 ya esta instalado
) else (
    echo [FALTA] ODBC Driver 18 no encontrado. Descargando...
    start https://go.microsoft.com/fwlink/?linkid=2249006
    echo Instala el driver y luego ejecuta este script de nuevo.
    pause
    exit /b 1
)
echo.

echo ============================================
echo   TODOS LOS REQUISITOS ESTAN INSTALADOS
echo   Ahora ejecuta: 02_deploy_app.bat
echo ============================================
pause
