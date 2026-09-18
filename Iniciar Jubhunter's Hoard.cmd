@echo off
cd /d "%~dp0"
if not exist "node_modules\express" call npm install
if not exist "dist\index.html" call npm run build
call npm run open
pause
