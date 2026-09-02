@echo off
title fase S3a-chapeus
REM Fase S3a-chapeus: arranca a bola v3 em modo musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-V3-Start.bat" 
echo.
echo ================= FASE S3a-chapeus — o que verificar =================
type "%~dp0README.md"
echo.
pause
