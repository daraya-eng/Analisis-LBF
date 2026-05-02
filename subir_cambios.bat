@echo off
chcp 65001 >nul
echo ============================================
echo   SUBIR CAMBIOS A PRODUCCION
echo ============================================
echo.

cd /d C:\Users\comer\lbf-analytics

:: Mostrar que cambio
echo Archivos modificados:
echo ---------------------
git status --short
echo.

:: Pedir descripcion del cambio
set /p MENSAJE=Describe el cambio (ej: "arregle tabla clientes"):

:: Subir
echo.
echo Subiendo cambios...
git add backend/ frontend/ deploy/
git commit -m "%MENSAJE%"
git push origin main
echo.

echo ============================================
echo   CAMBIOS SUBIDOS A GITHUB
echo.
echo   Ahora conectate al servidor por RDP y
echo   ejecuta: C:\lbf-analytics\deploy\actualizar.bat
echo ============================================
pause
