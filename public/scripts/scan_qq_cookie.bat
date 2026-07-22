@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo  QQ Music Cookie Extractor (local script)
echo  Prereq: Open QQ Music, login VIP, play a VIP song
echo  Output: cookie / guid / uin (paste into app settings)
echo ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scan_qq_cookie.ps1"
echo.
pause
