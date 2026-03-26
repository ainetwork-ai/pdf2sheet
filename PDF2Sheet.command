#!/bin/bash
cd "$(dirname "$0")"

# 처음 실행 시 설치
if [[ ! -d node_modules ]]; then
  echo "========================================="
  echo "  PDF2Sheet 최초 설치 중..."
  echo "========================================="
  echo ""

  # Homebrew
  if ! command -v brew &>/dev/null; then
    echo "Homebrew 설치 중..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [[ -f /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
      echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    fi
  fi

  # Node.js
  if ! command -v node &>/dev/null; then
    echo "Node.js 설치 중..."
    brew install node
  fi

  # poppler
  if ! command -v pdftotext &>/dev/null; then
    echo "poppler 설치 중..."
    brew install poppler
  fi

  echo "의존성 설치 중..."
  npm install
  echo ""
fi

# 환경 설정 확인
if [[ ! -f .env.local ]]; then
  echo "GOOGLE_SERVICE_ACCOUNT_KEY_FILE=service-account-key.json" > .env.local
fi

if [[ ! -f service-account-key.json ]]; then
  echo ""
  echo "========================================="
  echo "  service-account-key.json 파일 필요!"
  echo "========================================="
  echo ""
  echo "  관리자에게 받은 파일을 이 폴더에 넣어주세요:"
  echo "  $(pwd)"
  echo ""
  echo "  파일을 넣은 후 이 파일을 다시 더블클릭하세요."
  echo ""
  read -p "  Enter를 누르면 폴더가 열립니다..."
  open .
  exit 0
fi

echo "========================================="
echo "  PDF2Sheet 시작!"
echo "========================================="
echo ""
echo "  잠시 후 브라우저가 자동으로 열립니다."
echo "  종료하려면 이 창을 닫으세요."
echo ""

# 브라우저 자동 열기 (2초 후)
(sleep 2 && open http://localhost:3000) &

npm run dev
