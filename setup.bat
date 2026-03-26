@echo off
chcp 65001 >nul
echo =========================================
echo   PDF2Sheet 설치 스크립트 (Windows)
echo =========================================
echo.

:: 1. Node.js 확인
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/4] Node.js 설치 중...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo.
        echo   Node.js 자동 설치에 실패했습니다.
        echo   https://nodejs.org 에서 직접 설치해주세요.
        echo.
        pause
        exit /b 1
    )
    echo   Node.js 설치 완료. 터미널을 다시 열고 setup.bat을 다시 실행해주세요.
    pause
    exit /b 0
) else (
    echo [1/4] Node.js 이미 설치됨
)

:: 2. poppler (pdftotext) 확인 및 설치
where pdftotext >nul 2>&1
if %errorlevel% neq 0 (
    echo [2/4] poppler (PDF 파서) 설치 중...

    set POPPLER_DIR=%USERPROFILE%\poppler
    if not exist "%POPPLER_DIR%" mkdir "%POPPLER_DIR%"

    echo   poppler 다운로드 중...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/oschwartz10612/poppler-windows/releases/download/v24.08.0-0/Release-24.08.0-0.zip' -OutFile '%TEMP%\poppler.zip'"

    echo   압축 해제 중...
    powershell -Command "Expand-Archive -Path '%TEMP%\poppler.zip' -DestinationPath '%POPPLER_DIR%' -Force"

    :: PATH에 추가
    for /d %%i in ("%POPPLER_DIR%\poppler-*") do set POPPLER_BIN=%%i\Library\bin
    setx PATH "%PATH%;%POPPLER_BIN%" >nul 2>&1
    set PATH=%PATH%;%POPPLER_BIN%

    echo   poppler 설치 완료
) else (
    echo [2/4] poppler 이미 설치됨
)

:: 3. 의존성 설치
echo [3/4] 의존성 설치 중...
cd /d "%~dp0"
call npm install

:: 4. 바탕화면 바로가기 생성
echo [4/4] 바탕화면 바로가기 생성 중...
set SHORTCUT_PATH=%USERPROFILE%\Desktop\PDF2Sheet.bat
if not exist "%SHORTCUT_PATH%" (
    echo @echo off > "%SHORTCUT_PATH%"
    echo chcp 65001 ^>nul >> "%SHORTCUT_PATH%"
    echo cd /d "%~dp0" >> "%SHORTCUT_PATH%"
    echo echo PDF2Sheet 시작 중... >> "%SHORTCUT_PATH%"
    echo echo 브라우저에서 http://localhost:3000 을 열어주세요. >> "%SHORTCUT_PATH%"
    echo echo 종료하려면 이 창을 닫으세요. >> "%SHORTCUT_PATH%"
    echo echo. >> "%SHORTCUT_PATH%"
    echo start http://localhost:3000 >> "%SHORTCUT_PATH%"
    echo call npm run dev >> "%SHORTCUT_PATH%"
)

:: 환경 설정 확인
if not exist "%~dp0service-account-key.json" (
    echo.
    echo =========================================
    echo   service-account-key.json 파일 필요!
    echo =========================================
    echo.
    echo   관리자에게 받은 service-account-key.json 파일을
    echo   아래 경로에 넣어주세요:
    echo.
    echo   %~dp0
    echo.
    echo   파일을 넣은 후 바탕화면의 PDF2Sheet를 더블클릭하세요.
    echo.
    explorer "%~dp0"
    pause
    exit /b 0
)

echo.
echo =========================================
echo   설치 완료!
echo =========================================
echo.
echo   바탕화면의 PDF2Sheet를 더블클릭하세요.
echo.
pause
