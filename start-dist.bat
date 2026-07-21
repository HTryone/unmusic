@echo off
title Unlock Music - dist preview (port 8787)
cd /d "%~dp0"
cd dist

echo.
echo ============================================================
echo   Unlock Music - Local preview of the built "dist/" output
echo ============================================================
echo.
echo   URL : http://localhost:8787
echo   NOTE: All decryption runs locally in your browser.
echo         Close this window to stop the server.
echo.
echo   Starting static server on port 8787 ...
echo.

start "" http://localhost:8787
python -m http.server 8787
pause
