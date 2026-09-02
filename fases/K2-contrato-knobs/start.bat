@echo off
title fase K2-contrato-knobs
REM Fase K2: so leitura. Abre o contrato e mostra o checklist.
start "" "%~dp0..\..\docs\k2-contrato.md"
echo.
echo ================= FASE K2 — o que verificar =================
type "%~dp0README.md"
echo.
pause
