@echo off
REM — 1) Vérifie si une console “Serveur CESAD” est déjà active
tasklist /FI "WINDOWTITLE eq Serveur FCESAD" 2>NUL | findstr /I "cmd.exe" >NUL
if %ERRORLEVEL%==0 (
  echo Le serveur est déjà en cours d'exécution.
  pause
  exit /B
)

REM — 2) Se placer dans le dossier du .bat (où se trouve server.js)
cd /d "%~dp0"

REM — 3) Lancer node dans une fenêtre minimisée, en ajoutant les logs
start "Serveur FCESAD" /min cmd /C "node server.js >> server.log 2>&1"

REM — 4) Attendre 2 secondes que le serveur monte
timeout /t 2 /nobreak >nul

REM — 5) Ouvrir la page index.html dans le navigateur par défaut
start "" "http://localhost:4000"

REM — 6) Fermer la fenêtre du batch
exit
