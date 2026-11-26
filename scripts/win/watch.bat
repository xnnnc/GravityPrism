@echo off
chcp 65001 >nul
if "%~1"=="--foreground" (
  shift
  node "%~dp0..\..\inject.js" --watch %1 %2 %3 %4 %5
) else (
  powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "Start-Process -FilePath 'node' -ArgumentList @('\"%~dp0..\..\inject.js\"','--watch') -WorkingDirectory '%~dp0..\..' -WindowStyle Hidden"
)
