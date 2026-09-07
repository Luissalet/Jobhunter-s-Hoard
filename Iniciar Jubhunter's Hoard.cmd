@echo off
cd /d "%~dp0"
if not exist "node_modules\express" call npm install
if not exist "dist\index.html" call npm run build
start "" "http://127.0.0.1:5178"
call npm start
pause
