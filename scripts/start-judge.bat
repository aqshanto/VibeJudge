@echo off
rem VibeJudge - install / update. Double-click this file; it downloads the latest script from GitHub.
title VibeJudge judge - install / update
echo Installing or updating the VibeJudge judge on this PC...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/aqshanto/VibeJudge/main/scripts/install-judge.ps1 | iex"
echo.
pause
