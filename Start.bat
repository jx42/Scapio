@echo off
chcp 65001 >nul
rem
rem Doppelklick-Start fuer Windows. Die Schwester von Start.command, Schritt fuer
rem Schritt dieselbe: dasselbe Fenster, dieselben drei Meldungen, dieselbe Marke in
rem .start\. Zwei Einstiege mit unterschiedlichem Verhalten waeren schlimmer als keiner.
rem
rem Sechs Windows-Eigenheiten stecken darin, jede mit Grund:
rem
rem  1. `call` vor jedem npm-Aufruf. npm ist unter Windows selbst eine .cmd-Datei; ohne
rem     `call` uebergibt cmd die Kontrolle dorthin und kehrt NIE hierher zurueck - der
rem     Rest dieser Datei liefe schlicht nicht.
rem  2. `certutil -hashfile` statt `shasum`. Steckt in jedem Windows, braucht kein
rem     PowerShell. Es schreibt drei Zeilen; gebraucht wird die zweite.
rem  3. Kein `exec`. Das gibt es in cmd nicht - die Datei endet einfach mit dem Aufruf.
rem     Dafuer `pause` in jedem Fehlerfall, sonst klappt das Fenster zu, bevor jemand
rem     die Meldung gelesen hat.
rem  4. Innerhalb von ( ... ) nur !VAR!, nie %VAR% fuer einen Pfad. cmd setzt %VAR% ein,
rem     BEVOR es den Block liest - ein Ordner wie "Scapio (1)" (so benennt der
rem     Explorer ein zweites Mal entpacktes ZIP) schlosse die Klammer mitten im Pfad,
rem     und die ganze Datei braeche mit einem Syntaxfehler ab, schon beim ersten Start.
rem  5. `chcp 65001` als erste Zeile, sonst kaemen die Emojis unter Codepage 850
rem     oder 437 als Zeichensalat an. Die Datei ist UTF-8 und muss es bleiben. Die
rem     alte Konsole von Windows 10 zeigt statt Emojis leere Kaestchen, der Satz
rem     bleibt lesbar. Umlaute trotzdem als "ae", "oe", "ue", "ss" - wie drueben.
rem  6. Fehlt Node, kommt ein Satz mehr als drueben: Der Installer setzt PATH erst fuer
rem     neu gestartete Programme, und ein Fenster aus einem Explorer, der das nicht
rem     mitbekommen hat, findet Node trotz Installation nicht. Ab- und wieder anmelden
rem     hilft dann. Unter macOS gibt es diesen Fall nicht.
rem
rem Bewusst NICHT hier, wie drueben auch: `npm audit`, ein Selbst-Update, ein
rem Hintergrunddienst. Dieses Skript startet die Anwendung und tut sonst nichts.

setlocal enabledelayedexpansion
cd /d "%~dp0" || exit /b 1

set "MINDEST_NODE=24"
set "MARKE=.start"
set "PROTOKOLL=%MARKE%\installation.log"
set "HASHDATEI=%MARKE%\package-lock.sha256"

rem --- 1. Node ---------------------------------------------------------------

rem Ein Doppelklick auf die .bat in der ZIP-Ansicht des Explorers startet eine
rem einzelne Kopie aus %TEMP% - ohne den Rest des Ordners daneben.
if not exist "package.json" (
  echo.
  echo 📂  Scapio ist noch nicht entpackt - diese Datei liegt nicht im Scapio-Ordner.
  echo.
  echo Bitte das ZIP zuerst vollstaendig entpacken, unter Windows mit Rechtsklick auf
  echo das ZIP und "Alle extrahieren". Danach Start im entpackten Ordner doppelklicken.
  goto :abbruch
)

set "NODE_SEITE=https://nodejs.org/de/download"

where node >nul 2>nul
if errorlevel 1 (
  start "" "!NODE_SEITE!"
  echo.
  echo ⏬  Node.js ist nicht installiert.
  echo.
  echo Die Download-Seite !NODE_SEITE! oeffnet sich im Browser.
  echo Dort den Installer fuer dein System laden ^(die LTS-Version^), oeffnen und durchklicken.
  echo Danach dieses Fenster schliessen und Start.bat erneut doppelklicken.
  echo Meldet es dann noch immer, Node.js fehle: einmal ab- und wieder anmelden.
  goto :abbruch
)

set "NODE_VERSION="
for /f "usebackq tokens=*" %%v in (`node -v 2^>nul`) do set "NODE_VERSION=%%v"
rem Fuehrendes "v" abschneiden, dann alles ab dem ersten Punkt.
set "NODE_GROSS="
for /f "tokens=1 delims=." %%a in ("!NODE_VERSION:~1!") do set "NODE_GROSS=%%a"

rem Ohne diese Pruefung wuerde `if LSS` eine nicht-numerische Angabe als Text
rem vergleichen und stillschweigend das Falsche sagen.
echo !NODE_GROSS!| findstr /r /c:"^[0-9][0-9]*$" >nul
if errorlevel 1 goto :nodeZuAlt
if !NODE_GROSS! LSS %MINDEST_NODE% goto :nodeZuAlt
goto :nodeOk

:nodeZuAlt
start "" "!NODE_SEITE!"
echo.
echo ⏬  Node.js ist zu alt: gefunden !NODE_VERSION!, gebraucht wird %MINDEST_NODE% oder neuer.
echo.
echo Grund: die Datenbank steckt in Node selbst ^(node:sqlite^) und gibt es erst ab
echo Version %MINDEST_NODE%. Die Download-Seite !NODE_SEITE! oeffnet sich im Browser.
echo Bitte die aktuelle LTS-Version installieren und erneut doppelklicken.
goto :abbruch

:nodeOk

rem --- 2. Abhaengigkeiten -----------------------------------------------------

if not exist "%MARKE%" mkdir "%MARKE%" || exit /b 1

rem Ein ZIP braucht nur, was Start und Bau brauchen; Testwerkzeuge gibt es nur im Git-Checkout.
rem Der Modus steht mit in der Marke, damit ein Wechsel neu installiert. [ADR-055]
set "MODUS=ohne-dev"
set "CI_SCHALTER=--omit=dev"
if exist ".git" (
  set "MODUS=voll"
  set "CI_SCHALTER="
)

set "HASH_NEU="
for /f "usebackq skip=1 tokens=*" %%h in (`certutil -hashfile package-lock.json SHA256 2^>nul`) do (
  if not defined HASH_NEU set "HASH_NEU=%%h"
)
rem Aeltere certutil-Fassungen setzen Leerzeichen zwischen die Bytes.
if defined HASH_NEU set "HASH_NEU=!HASH_NEU: =!"
if defined HASH_NEU set "HASH_NEU=!MODUS!:!HASH_NEU!"

set "HASH_ALT="
if exist "%HASHDATEI%" set /p HASH_ALT=<"%HASHDATEI%"

set "INSTALLIEREN=1"
rem `"node_modules\."` statt `"node_modules\"`: ein Backslash direkt vor dem
rem Anfuehrungszeichen hebt dessen Wirkung auf, und `if exist` sieht dann Unsinn.
if exist "node_modules\." if defined HASH_NEU if "!HASH_NEU!"=="!HASH_ALT!" set "INSTALLIEREN=0"

if "!INSTALLIEREN!"=="0" (
  echo ✅  1/3  Softwarebausteine sind aktuell.
) else (
  if defined HASH_ALT (
    echo 🔄  1/3  Softwarebausteine werden aktualisiert - die Paketliste hat sich geaendert ...
  ) else (
    echo ⏬  1/3  Softwarebausteine werden installiert - das dauert beim ersten Mal einige Minuten ...
  )
  call npm ci --ignore-scripts !CI_SCHALTER! >"%PROTOKOLL%" 2>&1
  if errorlevel 1 (
    echo.
    echo ❌  Die Softwarebausteine liessen sich nicht installieren.
    echo.
    echo Was genau schiefging, steht in dieser Datei:
    echo   !CD!\%PROTOKOLL%
    goto :abbruch
  )
  rem Erst nach dem Erfolg: eine Marke fuer einen abgebrochenen Lauf waere schlimmer
  rem als gar keine - der naechste Start hielte die halbe Installation fuer fertig.
  >"%HASHDATEI%" echo !HASH_NEU!
)

rem --- 3. Anmeldung und Start -------------------------------------------------

echo 🔐  2/3  Anmeldung bei Scalable Capital pruefen ...
call npm run --silent mcp-login -- --nur-wenn-noetig
if errorlevel 1 (
  echo.
  echo ❌  Die Anmeldung beim Broker ist fehlgeschlagen.
  echo.
  echo Die Meldung dazu steht oben in diesem Fenster; mehr dazu in docs/RUNBOOK.md.
  goto :abbruch
)

echo 🚀  3/3  Dashboard startet - der Browser oeffnet sich gleich von selbst.
call npm start --silent
if errorlevel 1 (
  echo.
  echo ❌  Der Start ist fehlgeschlagen.
  echo.
  echo Die Meldung dazu steht oben in diesem Fenster; mehr dazu in docs/RUNBOOK.md.
  goto :abbruch
)

endlocal
exit /b 0

:abbruch
echo.
echo ⌨️  Zum Schliessen eine beliebige Taste druecken.
pause >nul
endlocal
exit /b 1
