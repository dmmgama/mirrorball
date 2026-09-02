@echo off
title fase S1-relogio
REM Fase S1-relogio: arranca a bola 2D (web/index-v2.html) em musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-2D-Start.bat"
echo.
echo ================= FASE S1-relogio — o que verificar =================
type "%~dp0README.md"
echo.
pause
