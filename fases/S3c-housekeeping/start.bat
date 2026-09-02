@echo off
title fase S3c-housekeeping
REM Fase S3c: arranca a bola 2D (o achado principal e la) e mostra o checklist. Para a v3 usa start-Mirror-v3.
call "%~dp0..\..\Mirror-2D-Start.bat"
echo.
echo ================= FASE S3c — o que verificar =================
type "%~dp0README.md"
echo.
pause
