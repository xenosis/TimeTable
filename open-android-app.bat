@echo off
setlocal

rem Double-click launcher for the TimeTable Android development app.
rem It always targets the project emulator, never a connected physical phone.

cd /d "%~dp0"

where npx >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm are required. Install Node.js, then run this file again.
  if not defined NO_PAUSE pause
  exit /b 2
)

if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_SDK_ROOT set "ANDROID_SDK_ROOT=%ANDROID_HOME%"

if not exist "%ANDROID_SDK_ROOT%\platform-tools\adb.exe" (
  echo Android SDK was not found at "%ANDROID_SDK_ROOT%".
  echo Open Android Studio once and install the Android SDK, then run this file again.
  if not defined NO_PAUSE pause
  exit /b 2
)

set "ADB=%ANDROID_SDK_ROOT%\platform-tools\adb.exe"
set "EMULATOR=%ANDROID_SDK_ROOT%\emulator\emulator.exe"
set "AVD_NAME=Medium_Phone_API_36.0"
if not defined EMULATOR_WAIT_ATTEMPTS set "EMULATOR_WAIT_ATTEMPTS=60"

if not exist "%EMULATOR%" (
  echo Android Emulator was not found at "%EMULATOR%".
  echo Install Android Emulator in Android Studio SDK Manager, then run this file again.
  if not defined NO_PAUSE pause
  exit /b 2
)

"%ADB%" start-server >nul 2>nul
"%ADB%" -s emulator-5554 get-state 2>nul | findstr /r /c:"^device$" >nul
if errorlevel 1 (
  echo Starting the project emulator. This can take a minute on the first run...
  rem Software graphics and disabled Vulkan avoid the current AMD/gfxstream crash.
  rem No snapshot prevents a failed Quick Boot state from being reused.
  start "TimeTable Android Emulator" "%EMULATOR%" -avd "%AVD_NAME%" -gpu software -feature -Vulkan -no-snapshot
)

set "BOOTED="
for /l %%I in (1,1,%EMULATOR_WAIT_ATTEMPTS%) do (
  "%ADB%" -s emulator-5554 get-state 2>nul | findstr /r /c:"^device$" >nul
  if not errorlevel 1 (
    for /f %%B in ('"%ADB%" -s emulator-5554 shell getprop sys.boot_completed 2^>nul') do (
      if "%%B"=="1" set "BOOTED=1"
    )
  )
  if defined BOOTED goto :emulator_ready
  ping 127.0.0.1 -n 4 >nul
)

echo.
echo The Android emulator did not finish starting within three minutes.
echo Open Android Studio - Device Manager and start "%AVD_NAME%" once to see its error.
echo This launcher did not install or change anything on a physical phone.
if not defined NO_PAUSE pause
exit /b 2

:emulator_ready
echo Starting the current TimeTable Android development app...
call npx expo run:android --device emulator-5554
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" (
  echo.
  echo The app did not start. Read the message above, fix the reported issue, and run this file again.
  if not defined NO_PAUSE pause
)

exit /b %RESULT%
