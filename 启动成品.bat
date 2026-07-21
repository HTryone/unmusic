@echo off
title Unlock Music (Vue3 + Vite Build)

echo.
echo ============================================================
echo.
echo     Unlock Music - Vue3 + Vite Build (dist/)
echo.
echo ============================================================
echo.
echo   [What is this?]
echo     The production build output (dist/) of the migrated
echo     Vue 3 + Vite version. Functionally replaces local/.
echo.
echo   [How to use]
echo     1. Open your browser and go to:
echo.
echo            http://localhost:8080
echo.
echo     2. Drag encrypted music files into the page.
echo     3. Click "Download" to save decrypted files.
echo.
echo   [Note]
echo     - All decryption runs locally in your browser, no upload.
echo     - New QQ Music STag format is NOT supported.
echo     - If you changed the source, run "npm run build" first.
echo.
echo ============================================================
echo.

cd /d "%~dp0dist"
if not exist "index.html" (
  echo   [ERROR] dist\index.html not found.
  echo   Please run "npm run build" in the source folder first.
  echo.
  pause
  exit /b 1
)

echo   Starting server on port 8080 ...
start http://localhost:8080
python -m http.server 8080
pause
