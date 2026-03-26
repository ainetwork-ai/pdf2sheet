@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
echo =========================================
echo   PDF2Sheet 설치 스크립트 (Windows)
echo =========================================
echo.

:: 1. Node.js 확인
call :find_node
if !NODE_FOUND!==0 (
    echo [1/4] Node.js 설치 중...
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>nul

    :: 설치 후 PATH 갱신
    set "PATH=!PATH!;C:\Program Files\nodejs"
    call :find_node
    if !NODE_FOUND!==0 (
        echo.
        echo   Node.js를 찾을 수 없습니다.
        echo   https://nodejs.org 에서 직접 설치 후
        echo   이 창을 닫고 setup.bat을 다시 실행해주세요.
        echo.
        pause
        exit /b 1
    )
    echo   Node.js 설치 완료
) else (
    echo [1/4] Node.js 이미 설치됨
)

:: 2. poppler (pdftotext) 확인 및 설치
call :find_poppler
if !POPPLER_FOUND!==0 (
    echo [2/4] poppler ^(PDF 파서^) 설치 중...

    set "POPPLER_DIR=%USERPROFILE%\poppler"
    if not exist "!POPPLER_DIR!" mkdir "!POPPLER_DIR!"

    echo   다운로드 중...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/oschwartz10612/poppler-windows/releases/download/v24.08.0-0/Release-24.08.0-0.zip' -OutFile '%TEMP%\poppler.zip'" 2>nul

    if not exist "%TEMP%\poppler.zip" (
        echo   다운로드 실패. 수동 설치가 필요합니다.
        echo   https://github.com/oschwartz10612/poppler-windows/releases
        pause
        exit /b 1
    )

    echo   압축 해제 중...
    powershell -Command "Expand-Archive -Path '%TEMP%\poppler.zip' -DestinationPath '!POPPLER_DIR!' -Force"

    :: PATH에 추가
    for /d %%i in ("!POPPLER_DIR!\poppler-*") do set "POPPLER_BIN=%%i\Library\bin"
    setx PATH "!PATH!;!POPPLER_BIN!" >nul 2>&1
    set "PATH=!PATH!;!POPPLER_BIN!"
    del "%TEMP%\poppler.zip" >nul 2>&1

    echo   poppler 설치 완료
) else (
    echo [2/4] poppler 이미 설치됨
)

:: 3. 의존성 설치
echo [3/4] 의존성 설치 중...
cd /d "%~dp0"
call npm install

:: 4. 환경 설정 확인
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
    echo   파일을 넣은 후 PDF2Sheet.bat을 더블클릭하세요.
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
echo   PDF2Sheet.bat을 더블클릭하세요.
echo.
pause
exit /b 0

:: --- 함수 ---

:find_node
set NODE_FOUND=0
where node >nul 2>&1 && set NODE_FOUND=1
if !NODE_FOUND!==0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=!PATH!;C:\Program Files\nodejs"
        set NODE_FOUND=1
    )
)
exit /b 0

:find_poppler
set POPPLER_FOUND=0
where pdftotext >nul 2>&1 && set POPPLER_FOUND=1
if !POPPLER_FOUND!==0 (
    for /d %%i in ("%USERPROFILE%\poppler\poppler-*") do (
        if exist "%%i\Library\bin\pdftotext.exe" (
            set "PATH=!PATH!;%%i\Library\bin"
            set POPPLER_FOUND=1
        )
    )
)
exit /b 0
