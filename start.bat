@echo off
echo ========================================
echo   LBF Advanced Analytics Platform
echo ========================================
echo.
echo Starting Backend (FastAPI) on port 8000...
start "LBF-Backend" cmd /c "cd /d %~dp0backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo Starting Frontend (Next.js) on port 3000...
start "LBF-Frontend" cmd /c "cd /d %~dp0frontend && npm run dev"
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Both services are starting in separate windows.
pause
