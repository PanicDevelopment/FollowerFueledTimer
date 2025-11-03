@echo off
echo Starting Microsoft Edge with remote debugging...
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Microsoft\Edge\User Data"
echo Edge started with remote debugging on port 9222
pause
