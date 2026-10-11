@echo off
rem
rem Doppelklick-Deinstallation fuer Windows. Die dritte Tuer neben Start.bat und
rem Aktualisieren.bat: dieses Fenster sagt deutsche Saetze, die eigentliche Arbeit macht
rem `start\deinstallieren.ts`. Es loescht nur das Datenverzeichnis; den Scapio-Ordner
rem loescht der Nutzer danach selbst - cmd haelt die laufende .bat und ihren Ordner
rem offen. [ADR-049]
rem
rem `call` vor npm: npm ist unter Windows selbst eine .cmd-Datei, und ohne `call` kehrt
rem sie nie zurueck. Nur ASCII, keine Umlaute - siehe Start.bat.

setlocal enabledelayedexpansion
cd /d "%~dp0" || exit /b 1

set "MINDEST_NODE=24"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js ist nicht installiert. Ohne Node.js laesst sich der Datenordner nicht
  echo sicher finden - bitte von Hand loeschen, siehe README, Abschnitt "Deinstallieren".
  goto :abbruch
)

set "NODE_VERSION="
for /f "usebackq tokens=*" %%v in (`node -v 2^>nul`) do set "NODE_VERSION=%%v"
set "NODE_GROSS="
for /f "tokens=1 delims=." %%a in ("!NODE_VERSION:~1!") do set "NODE_GROSS=%%a"

echo !NODE_GROSS!| findstr /r /c:"^[0-9][0-9]*$" >nul
if errorlevel 1 goto :nodeZuAlt
if !NODE_GROSS! LSS %MINDEST_NODE% goto :nodeZuAlt
goto :nodeOk

:nodeZuAlt
echo.
echo Node.js ist zu alt: gefunden !NODE_VERSION!, gebraucht wird %MINDEST_NODE% oder neuer.
echo Bitte den Datenordner von Hand loeschen, siehe README, Abschnitt "Deinstallieren".
goto :abbruch

:nodeOk

call npm run --silent deinstallieren
if errorlevel 1 (
  echo.
  echo Die Deinstallation ist nicht durchgelaufen. Was zu tun ist, steht oben.
  goto :abbruch
)

echo.
echo Zum Schliessen eine beliebige Taste druecken.
pause >nul
endlocal
exit /b 0

:abbruch
echo.
echo Zum Schliessen eine beliebige Taste druecken.
pause >nul
endlocal
exit /b 1
