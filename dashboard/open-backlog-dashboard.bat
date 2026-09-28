@echo off
rem Open this project's read-only backlog dashboard in the default browser.
rem The local server reads only backlog.json and docs/backlog from this project.
rem It selects an available port and reuses this project's existing dashboard server.
rem The server exits after ten minutes with no requests.
cd /d "%~dp0.."
start "Backlog Dashboard" /min cmd /c "node dashboard\serve-dashboard.js"
