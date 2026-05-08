@echo off
echo Iniciando Analisis Comercial LBF...

:: Matar procesos anteriores
taskkill /F /IM python.exe /FI "WINDOWTITLE eq ppto*" >nul 2>&1
taskkill /F /IM devtunnel.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Iniciar app Dash
start "App LBF" /MIN python "C:\Users\comer\Proyecto Dash\ppto_analisis_app.py"
timeout /t 5 /nobreak >nul

:: Iniciar tunel
start "Tunel LBF" /MIN "C:\Users\comer\Proyecto Dash\devtunnel.exe" host lbf-analisis

echo.
echo App corriendo en: http://localhost:8055
echo URL publica:      https://fn9z51zc-8055.brs.devtunnels.ms
echo.
echo Compartir esta URL con quien necesite acceder.
pause
