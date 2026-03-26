@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: 최신 버전 업데이트
echo 업데이트 확인 중...
git pull origin main >nul 2>&1

:: poppler PATH 확인
where pdftotext >nul 2>&1
if !errorlevel! neq 0 (
    for /d %%i in ("%USERPROFILE%\poppler\poppler-*") do set "PATH=!PATH!;%%i\Library\bin"
)

:: 첫 실행 시 의존성 설치
if not exist node_modules (
    echo 최초 실행: 의존성 설치 중...
    call npm install
    echo.
)

:: service-account-key.json 확인
if not exist service-account-key.json (
    echo.
    echo =========================================
    echo   service-account-key.json 파일 필요!
    echo =========================================
    echo.
    echo   관리자에게 받은 파일을 이 폴더에 넣어주세요:
    echo   %cd%
    echo.
    explorer "%cd%"
    pause
    exit /b 0
)

echo =========================================
echo   PDF2Sheet 시작!
echo =========================================
echo.
echo   잠시 후 브라우저가 자동으로 열립니다.
echo   종료하려면 이 창을 닫으세요.
echo.

:: 2초 후 브라우저 열기
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

call npm run dev
