@echo off
echo Stopping existing Node.js processes on port 8009...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8009" ^| find "LISTENING"') do (
    echo Killing process %%a
    taskkill /F /PID %%a
)

echo Waiting for port to be released...
timeout /t 2 /nobreak > nul

echo Starting municipal inquiry system...
cd /d "%~dp0"
npm start