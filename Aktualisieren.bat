@echo off
rem
rem Doppelklick-Update fuer Windows. Die Tuer neben Start.bat - fuer denselben
rem Nutzer, der keine Kommandozeile oeffnet, und mit derselben Aufteilung wie
rem Aktualisieren.command: dieses Fenster sagt deutsche Saetze, die eigentliche Arbeit
rem macht `start\update.ts`. [ADR-013]
rem
rem Drei Eigenheiten, alle mit Grund:
rem
rem  1. Das Skript kopiert sich nach %TEMP% und laeuft von dort weiter. Das ist die
rem     wichtigste Zeile der Datei: cmd liest eine Batchdatei nicht auf einmal ein,
rem     sondern springt nach JEDEM Befehl an den gemerkten Byte-Versatz zurueck - und
rem     dieses Skript aktualisiert sich mitten im Lauf selbst mit. Verschiebt der Pull
rem     auch nur eine Zeile, laeuft danach irgendetwas, aber nicht dieses Programm.
rem     Aktualisieren.command loest dasselbe Problem mit einer Funktion; cmd kennt
rem     nichts Vergleichbares, also ist die Kopie der Weg.
rem  2. Am Ende uebernimmt Start.bat, und zwar die frisch gezogene Fassung.
rem     Abhaengigkeiten, Migrationen, Anmeldung und Start stehen dort schon richtig;
rem     hier waeren sie eine zweite, alternde Kopie.
rem  3. `call` vor jedem npm-Aufruf und vor Start.bat: npm ist unter Windows selbst
rem     eine .cmd-Datei, und eine .bat aus einer .bat heraus ohne `call` kehrt nie
rem     zurueck - der Rest dieser Datei liefe schlicht nicht.
rem
rem Nur ASCII, keine Umlaute, und Pfade in ( ... ) nur als !VAR! - siehe Start.bat,
rem Punkte 4 und 5.

setlocal enabledelayedexpansion

set "MINDEST_NODE=24"

rem --- 0. Aus der Kopie heraus weiterlaufen ------------------------------------

if /i "%~1"=="--kopie" goto :ausKopie

set "KOPIE=%TEMP%\scapio-aktualisieren.bat"
copy /y "%~f0" "%KOPIE%" >nul
if errorlevel 1 (
  echo.
  echo Die Aktualisierung liess sich nicht vorbereiten:
  echo   !KOPIE! ist nicht schreibbar.
  echo.
  echo Zum Schliessen eine beliebige Taste druecken.
  pause >nul
  endlocal
  exit /b 1
)
rem Der Punkt am Ende: ohne ihn endet das Argument auf \" und cmd liest das
rem Anfuehrungszeichen als geschuetzt statt als Ende der Zeichenkette.
rem `exit` auf DERSELBEN Zeile wie `call`: kehrt die Kopie zurueck, hat der Pull diese
rem Datei womoeglich schon ersetzt, und cmd laese die naechste Zeile am alten Versatz
rem aus der neuen Fassung. Eine Zeile wird vor ihrer Ausfuehrung ganz gelesen.
call "%KOPIE%" --kopie "%~dp0." & exit /b !ERRORLEVEL!

:ausKopie
cd /d "%~2" || exit /b 1

rem --- 1. Node ----------------------------------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js ist nicht installiert.
  echo.
  echo Bitte von https://nodejs.org laden ^(die LTS-Version^) und installieren.
  echo Danach dieses Fenster schliessen und Aktualisieren.bat erneut doppelklicken.
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
echo.
echo Bitte die aktuelle LTS-Version von https://nodejs.org installieren und erneut
echo doppelklicken.
goto :abbruch

:nodeOk

rem --- 2. Update --------------------------------------------------------------

call npm run --silent update -- --mit-neustart
if errorlevel 1 (
  echo.
  echo Das Update ist nicht durchgelaufen. Was zu tun ist, steht oben.
  goto :abbruch
)

rem --- 3. Neustart ueber die frisch gezogene Fassung ---------------------------

echo.
echo Starte das Dashboard neu ...
echo.
call Start.bat
endlocal & exit /b %ERRORLEVEL%

:abbruch
echo.
echo Zum Schliessen eine beliebige Taste druecken.
pause >nul
endlocal
exit /b 1
