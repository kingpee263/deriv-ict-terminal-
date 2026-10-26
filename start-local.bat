@echo off
set "PATH=C:\Users\Administrator\.gemini\antigravity\scratch\.tools\node-v20.18.0-win-x64;%PATH%"
cd /d "C:\Users\Administrator\.gemini\antigravity\scratch\deriv-ict-terminal"
echo Installing dependencies (if needed)...
call npm.cmd install --no-audit --no-fund
echo Starting Deriv ICT AI Terminal on http://localhost:5173 ...
call npm.cmd run dev
pause
