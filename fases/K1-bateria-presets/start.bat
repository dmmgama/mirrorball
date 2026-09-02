@echo off
title fase K1-bateria-presets
REM Fase K1-bateria-presets: nao precisa de browser — corre a bateria em Node e mostra o checklist.
cd /d "%~dp0..\.."
node spike-babylon\v2\test-knobs-compat.js
echo.
echo ================= FASE K1-bateria-presets — o que verificar =================
type "%~dp0README.md"
echo.
pause
