@echo off
title fase V2V3-fog-exposicao
REM Fase V2V3-fog-exposicao: arranca a bola v3 em modo musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-V3-Start.bat" 
echo.
echo ================= FASE V2V3-fog-exposicao — o que verificar =================
type "%~dp0README.md"
echo.
pause
