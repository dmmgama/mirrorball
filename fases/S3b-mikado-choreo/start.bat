@echo off
title fase S3b-mikado-choreo
REM Fase S3b-mikado-choreo: arranca a bola v3 em modo musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-V3-Start.bat"
echo.
echo ================= FASE S3b-mikado-choreo — o que verificar =================
type "%~dp0README.md"
echo.
pause
