@echo off
rem VibeJudge - remove. Double-click this file; it downloads the latest script from GitHub.
title VibeJudge judge - remove
echo Removing the VibeJudge judge from this PC...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/aqshanto/VibeJudge/main/scripts/uninstall-judge.ps1 | iex"
echo.
pause
