@echo off
REM Guitar Song Trainer - avvio su Windows (doppio clic).
REM Serve Node.js (https://nodejs.org) oppure Python (https://python.org).
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8080
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  echo Guitar Song Trainer su http://localhost:%PORT%  -  chiudi questa finestra per fermarlo.
  node tools\serve.mjs
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:%PORT%
  echo Guitar Song Trainer su http://localhost:%PORT%  -  chiudi questa finestra per fermarlo.
  python -m http.server %PORT%
  goto :eof
)
echo.
echo Per avviare l'app serve Node.js oppure Python.
echo Scarica Node.js da https://nodejs.org (versione LTS), installalo e fai di nuovo doppio clic su avvia.bat
pause
