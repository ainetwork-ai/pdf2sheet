# Rule Builder: 커스터마이즈 가능한 PDF 파싱 시스템

**Date:** 2026-04-06
**Status:** Approved
**Scope:** 1단계 — 룰 빌더 + 프리셋 저장 (2단계 피드백 루프는 별도)

## 목표

- PDF에서 "무엇을 추출할지"를 비개발자(amy)가 UI에서 직접 설정할 수 있게 한다
- 기존 초과근무 신청서 파싱은 100% 동일하게 동작해야 한다
- 나중에 다른 문서 유형을 추가할 때 프리셋만 새로 만들면 되는 구조

## 제약 조건

- 비개발자 친화적 UI 필수 (amy가 단독 사용)
- 기존 사용자 경험 변화 없음
- AI 파싱은 후순위 — 인터페이스만 교체 가능하게 추상화
- 계산 필드(인정시간 = 초과시간 x 1.5, 인정일수 = 인정시간 / 8)는 코드에 고정

## 데이터 구조

### 확장된 PresetConfig

```typescript
interface PresetConfig {
  // 추출 룰 (신규)
  extraction: ExtractionConfig;

  // 출력 매핑 (기존 유지)
  columns: Record<string, string>;  // 필드명 → 시트 컬럼
  startRow: number;
  emptyCheckColumn: string;
}

interface ExtractionConfig {
  fields: FieldRule[];    // 단일 필드 (성명, 신청일 등)
  table: TableRule;       // 테이블 추출 룰
}

interface FieldRule {
  name: string;           // "성명", "신청일" 등
  keyword: string;        // PDF에서 찾을 라벨
  direction: "right" | "below";  // 값의 위치
  pattern?: string;       // 선택적 정규식 (날짜 포맷 등)
}

interface TableRule {
  headerKeywords: string[];       // 테이블 헤더 감지용 키워드 목록
  columns: TableColumnRule[];     // 각 컬럼 추출 룰
  rowPattern?: string;            // 새 행 시작 패턴 (정규식)
                                  // 예: "^\\d+\\s+" (번호로 시작)
                                  // 없으면: 공백 기반 자동 감지
}

interface TableColumnRule {
  name: string;           // "근무기간", "근무내용", "초과시간"
  keyword: string;        // 헤더에서 매칭할 키워드
  type: "text" | "number" | "date" | "hours";  // 파싱 타입
}
```

### 기본 프리셋 (초과근무 신청서)

```json
{
  "extraction": {
    "fields": [
      { "name": "성명", "keyword": "성명", "direction": "right" },
      { "name": "신청일", "keyword": "신청일", "direction": "right", "pattern": "\\d{4}\\.\\s*\\d{1,2}\\.\\s*\\d{1,2}" }
    ],
    "table": {
      "headerKeywords": ["근무기간", "근무내용", "초과근무시간"],
      "columns": [
        { "name": "근무기간", "keyword": "근무기간", "type": "date" },
        { "name": "근무내용", "keyword": "근무내용", "type": "text" },
        { "name": "초과시간", "keyword": "초과근무시간", "type": "hours" }
      ]
    }
  },
  "columns": {
    "문서번호": "A",
    "성명": "B",
    "근무기간": "C",
    "초과시간": "D",
    "인정시간": "E",
    "인정일수": "F",
    "신청일": "J",
    "근무내용": "L"
  },
  "startRow": 5,
  "emptyCheckColumn": "B"
}
```

## 파서 아키텍처

```
PDF → pdftotext -layout → 텍스트
                              ↓
                    텍스트 → 2D 그리드 변환 (text-grid.ts)
                              ↓
                  프리셋의 extraction 룰 적용 (rule-parser.ts)
                    ├─ FieldRule → 단일 값 추출
                    └─ TableRule → 테이블 행 추출
                              ↓
                    추출된 데이터 + 계산 (×1.5, /8)
                              ↓
                    프리셋의 columns 매핑 → 시트 내보내기
```

### 새 파일

- **`src/lib/text-grid.ts`** — pdftotext 출력을 2D 좌표 그리드로 변환. 각 텍스트 청크의 행/열 위치를 파악. 룰 빌더 UI의 클릭 좌표 매칭에도 사용.
- **`src/lib/rule-parser.ts`** — FieldRule/TableRule을 받아서 그리드에서 값을 추출하는 범용 파싱 엔진. 나중에 AI 파서로 교체 가능한 인터페이스.

### 변경 파일

- **`src/lib/pdf-parser.ts`** — `parsePdfTable`이 프리셋의 extraction 룰을 받아서 분기: extraction 없으면 기존 하드코딩 경로 (변경 없음), 있으면 `rule-parser`에 위임. 기존 파서와 rule-parser가 병렬 공존.
- **`src/lib/db.ts`** — PresetConfig 타입 확장. 기존 프리셋 마이그레이션 (extraction 필드 없으면 기본값 자동 추가). extraction.fields[].name 변경 시 columns 키도 자동 동기화.

## 룰 빌더 UI

`/settings` 페이지에 통합. 메인 페이지는 프리셋 선택만.

### 레이아웃 구조

프리셋 편집 시 2개 탭으로 분리:

```
┌─ 프리셋: [이름 입력] ──────────────────────────────────────┐
│ [추출 룰]  [시트 매핑]                    [테스트] [저장]    │
├────────────────────────────┬───────────────────────────────┤
│ PDF 텍스트 미리보기 (60%)   │ 추출 룰 패널 (40%)            │
│ ┌────────────────────────┐ │ ── 단일 필드 ───────────────  │
│ │ (font-mono, 고정높이     │ │  성명: "성명" → 오른쪽  ✕    │
│ │  스크롤, 클릭 가능 토큰) │ │  신청일: "신청일" → 오른쪽 ✕  │
│ └────────────────────────┘ │  [+ 필드 추가]               │
│ 📄 샘플 PDF 올리기 (드롭존) │                              │
│                            │ ── 테이블 ──────────────────  │
│                            │  헤더: 근무기간, 근무내용, 시간  │
│                            │  행 패턴: ^\d+\s+             │
│                            │  [+ 컬럼]                     │
├────────────────────────────┴───────────────────────────────┤
│ ▸ 테스트 결과 (접혀있다가 테스트 실행 시 펼침)                │
└────────────────────────────────────────────────────────────┘
```

- 왼쪽 60%: PDF 텍스트 그리드 (font-mono, 고정 높이 + 스크롤)
- 오른쪽 40%: 추출 룰 패널 (단일 필드 + 테이블 섹션)
- [시트 매핑] 탭 전환 시: 기존 컬럼 매핑 편집기 표시
- 하단: 접히는 테스트 결과 패널

### 토큰 상태 색상

| 상태 | 배경 | 추가 표시 |
|------|------|----------|
| 기본 | 투명 | text-slate-700 |
| Hover | blue-100 | cursor-pointer |
| 라벨 선택됨 | amber-200 | 상단에 필드명 뱃지 |
| 값 후보 | emerald-100 점선 테두리 | |
| 값 선택됨 | emerald-200 | |
| 이미 지정됨 (다른 필드) | amber-100 | 필드명 뱃지 |

### 인터랙션 상태

| 기능 | 로딩 | 빈 상태 | 에러 | 성공 |
|------|------|--------|------|------|
| 샘플 PDF 업로드 | 스피너+진행률 | 드롭존 "샘플 PDF를 올려주세요" | "PDF 텍스트 추출 실패" 빨간 토스트 | 텍스트 그리드 표시 |
| 토큰 클릭 | — | — | — | 필드 카드 추가 + 토큰 하이라이트 |
| 후보 값 표시 | — | "값을 찾을 수 없습니다" 주황 경고 | — | 후보 emerald 하이라이트 |
| 테스트 파싱 | 스피너 "파싱 중..." | — | 경고 목록 (주황 배경) | 결과 테이블 |
| 프리셋 저장 | 스피너 | — | 빨간 토스트 | 초록 토스트 "저장 완료" |

### 온보딩 가이드

PDF 미업로드 시 왼쪽 패널에 안내:
```
1. 샘플 PDF를 올려주세요
2. 텍스트에서 라벨(키워드)을 클릭하세요
3. 하이라이트된 값을 선택하세요
```

첫 토큰 클릭 시 툴팁: "이 키워드의 오른쪽이나 아래에서 값을 클릭하세요"

### 플로우

1. **샘플 PDF 업로드** — 프리셋 편집 화면에서 PDF 드래그 앤 드롭
2. **텍스트 레이아웃 표시** — pdftotext 결과를 모노스페이스 폰트로 렌더링 (클릭 가능 토큰)
3. **필드 지정** — 라벨 클릭 → 후보 값 하이라이트 → amy가 맞는 값 클릭 → FieldRule 자동 생성
4. **테이블 지정** — 헤더 행 클릭 → 컬럼 자동 감지 → 각 컬럼 타입 선택
5. **시트 매핑** — [시트 매핑] 탭에서 추출 필드 → 시트 컬럼 매핑 (기존 UI와 동일)
6. **테스트 & 저장** — 샘플 PDF로 파싱 실행, 결과 미리보기, 확인 후 저장

### 반응형 & 접근성

- **1024px+:** 좌우 분할 60/40
- **768~1024px:** 좌우 50/50, 오른쪽 스크롤
- **768px 미만:** 탭 전환 (PDF 미리보기 | 룰 설정) — 우선순위 낮음 (amy는 데스크톱)
- **키보드:** 토큰에 tabIndex + role="button", Enter로 선택
- **색상 + 형태:** 하이라이트에 색상만 사용하지 않고 뱃지/점선 테두리 병용

나중에 원본 PDF 렌더링 (나란히 비교)으로 확장 예정.

## API

### 신규 엔드포인트

**`POST /api/parse/preview`**
샘플 PDF → 텍스트 그리드 반환 (룰 빌더 UI용)

```typescript
// Request: FormData (PDF file)
// Response:
{
  grid: { text: string, row: number, col: number, id: string }[],
  rawText: string
}
```

각 토큰에 `id` (예: `"t-3-12"`)를 부여. 클라이언트는 `<span data-id="t-3-12" onClick={...}>` 으로 렌더링하여 좌표 계산 없이 토큰 클릭으로 선택.

**`POST /api/parse/test`**
프리셋 extraction 룰 + 샘플 PDF → 파싱 테스트 결과

```typescript
// Request: FormData (PDF file) + extraction JSON
// Response:
{
  entries: ParsedEntry[],
  fields: { name: string, value: string }[],
  warnings: string[]
}
```

### 기존 엔드포인트 (인터페이스 변경 없음)

- `POST /api/upload` — 그대로
- `POST /api/parse` — 내부에서 프리셋의 extraction 룰 사용하도록 변경
- `POST /api/export` — 그대로
- `/api/presets` — 확장된 프리셋 구조 저장/로드 (하위 호환)

## 마이그레이션

기존 프리셋에 `extraction` 필드가 없으면 기본 초과근무 신청서 extraction 룰을 자동 주입. `db.ts`의 `loadPresets()`에서 처리 (기존 auto-migrate 패턴과 동일).

## 테스트 전략

- **유닛 테스트 (vitest):** text-grid.ts, rule-parser.ts, db.ts 마이그레이션 — 순수 함수 위주
- **E2E (Playwright MCP):** 룰 빌더 UI 플로우, 기존 파싱 회귀 확인
- **회귀 테스트:** 기존 초과근무 신청서 파싱 결과가 변경 전후 동일한지 검증

## 엔지니어링 리뷰 결정사항

| 결정 | 내용 |
|------|------|
| 행 감지 | TableRule에 `rowPattern` 필드 추가 (선택적, 없으면 공백 기반 자동 감지) |
| UI 클릭 모델 | 서버가 토큰 단위로 분리, 클라이언트는 `<span>` 클릭 (좌표 계산 불필요) |
| 기존 파서 | 하드코딩 파서 유지 + rule-parser 병렬 공존 (기존 동작 100% 보장) |
| parse/test API | fileId 대신 FormData로 PDF 직접 전송 |
| 필드-컬럼 동기화 | extraction 필드 이름 변경 시 columns 매핑 키도 자동 동기화 |

## 향후 확장 (이번 범위 아님)

- **2단계: 피드백 루프** — 파싱 실패 케이스 자동 저장, amy가 수정 → 룰 자동 보정
- **PDF 원본 렌더링** — 텍스트 레이아웃 옆에 원본 PDF 나란히 표시
- **AI 파싱** — rule-parser 인터페이스를 AI 파서로 교체
- **PDF 종류 자동 감지** — 업로드된 PDF에 맞는 프리셋 자동 선택
