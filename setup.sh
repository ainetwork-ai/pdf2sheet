#!/bin/bash
set -e

echo "========================================="
echo "  PDF2Sheet 설치 스크립트"
echo "========================================="
echo ""

# 1. Homebrew 확인 및 설치
if ! command -v brew &>/dev/null; then
  echo "[1/5] Homebrew 설치 중..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Apple Silicon Mac PATH 설정
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  fi
else
  echo "[1/5] Homebrew 이미 설치됨"
fi

# 2. Node.js 확인 및 설치
if ! command -v node &>/dev/null; then
  echo "[2/5] Node.js 설치 중..."
  brew install node
else
  echo "[2/5] Node.js 이미 설치됨 ($(node -v))"
fi

# 3. poppler (pdftotext) 확인 및 설치
if ! command -v pdftotext &>/dev/null; then
  echo "[3/5] poppler (PDF 파서) 설치 중..."
  brew install poppler
else
  echo "[3/5] poppler 이미 설치됨"
fi

# 4. 프로젝트 클론 및 의존성 설치
INSTALL_DIR="$HOME/pdf2sheet"

if [[ -d "$INSTALL_DIR" ]]; then
  echo "[4/5] 기존 설치 업데이트 중..."
  cd "$INSTALL_DIR"
  git pull
  npm install
else
  echo "[4/5] 프로젝트 다운로드 중..."
  git clone https://github.com/ainetwork-ai/pdf2sheet.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  npm install
fi

# 5. 환경 설정 확인
if [[ ! -f "$INSTALL_DIR/service-account-key.json" ]]; then
  echo ""
  echo "========================================="
  echo "  service-account-key.json 파일 필요!"
  echo "========================================="
  echo ""
  echo "  관리자에게 받은 service-account-key.json 파일을"
  echo "  아래 경로에 넣어주세요:"
  echo ""
  echo "    $INSTALL_DIR/service-account-key.json"
  echo ""
  echo "  파일을 넣은 후 아래 명령어로 실행하세요:"
  echo ""
  echo "    cd $INSTALL_DIR && npm run dev"
  echo ""
  exit 0
fi

# .env.local 생성 (없으면)
if [[ ! -f "$INSTALL_DIR/.env.local" ]]; then
  echo "GOOGLE_SERVICE_ACCOUNT_KEY_FILE=service-account-key.json" > "$INSTALL_DIR/.env.local"
fi

# 바탕화면에 바로가기 생성
if [[ ! -f "$HOME/Desktop/PDF2Sheet.command" ]]; then
  ln -s "$INSTALL_DIR/PDF2Sheet.command" "$HOME/Desktop/PDF2Sheet.command"
  echo "[5/5] 바탕화면에 PDF2Sheet 바로가기 생성됨"
fi

echo ""
echo "========================================="
echo "  설치 완료!"
echo "========================================="
echo ""
echo "  바탕화면의 PDF2Sheet 아이콘을 더블클릭하세요."
echo "  브라우저가 자동으로 열립니다."
echo ""
