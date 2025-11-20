@echo off
title Bot Starter (Concurrent) - Mebsuta

echo Changing directory to the script's location...
cd /d %~dp0
echo Current directory: %CD%
echo.

echo Starting bots concurrently in this window using 'concurrently'...
echo (Requires 'npm install --save-dev concurrently' first)
echo Logs will be interleaved below. Press Ctrl+C to stop all bots.
echo.

REM concurrently paketini kullanarak hepsini başlat
npx concurrently "node main.js" "node voice-bot1.js" "node voice-bot2.js"

echo.
echo Bots have stopped or failed to start.
pause