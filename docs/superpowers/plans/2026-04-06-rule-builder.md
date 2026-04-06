# Rule Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF에서 추출할 데이터를 비개발자가 UI에서 직접 설정할 수 있는 룰 빌더 시스템 구축

**Architecture:** pdftotext 출력을 토큰 그리드로 변환하고, 사용자가 클릭으로 추출 룰을 생성. 기존 하드코딩 파서는 유지하면서 새 프리셋은 범용 rule-parser를 사용하는 병렬 구조.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Vitest, pdftotext (poppler)

**Spec:** `docs/superpowers/specs/2026-04-06-rule-builder-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/text-grid.ts` | pdftotext 출력 → 토큰 그리드 변환 |
| `src/lib/rule-parser.ts` | FieldRule/TableRule → 그리드에서 값 추출 |
| `src/app/api/parse/preview/route.ts` | 샘플 PDF → 토큰 그리드 API |
| `src/app/api/parse/test/route.ts` | extraction 룰 + PDF → 파싱 테스트 API |
| `src/app/settings/rule-builder.tsx` | 룰 빌더 UI 컴포넌트 |
| `vitest.config.ts` | Vitest 설정 |
| `test/text-grid.test.ts` | text-grid 유닛 테스트 |
| `test/rule-parser.test.ts` | rule-parser 유닛 테스트 |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/db.ts` | PresetConfig에 extraction 타입 추가 + 마이그레이션 |
| `src/lib/pdf-parser.ts` | parsePdfTable에 프리셋 분기 추가 |
| `src/app/settings/page.tsx` | 탭 UI + 룰 빌더 통합 |
| `src/app/api/parse/route.ts` | 프리셋 extraction 룰 전달 |
| `package.json` | vitest devDependency 추가 |

---

### Task 1: Vitest 설정

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs**

```bash
npm test
```

Expected: "No test files found" (no tests yet, but vitest works)

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: text-grid.ts — 텍스트를 토큰 그리드로 변환

**Files:**
- Create: `src/lib/text-grid.ts`
- Create: `test/text-grid.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/text-grid.test.ts
import { describe, it, expect } from "vitest";
import { textToGrid, GridToken } from "@/lib/text-grid";

describe("textToGrid", () => {
  it("splits simple text into tokens with positions", () => {
    const text = "성명  홍길동";
    const grid = textToGrid(text);
    expect(grid).toEqual([
      { text: "성명", row: 0, col: 0, id: "t-0-0" },
      { text: "홍길동", row: 0, col: 4, id: "t-0-4" },
    ]);
  });

  it("handles multiple lines", () => {
    const text = "성명  홍길동\n부서  개발팀";
    const grid = textToGrid(text);
    expect(grid[0].row).toBe(0);
    expect(grid[2].row).toBe(1);
    expect(grid.length).toBe(4);
  });

  it("handles empty lines", () => {
    const text = "라인1\n\n라인3";
    const grid = textToGrid(text);
    const rows = new Set(grid.map((t) => t.row));
    expect(rows).toEqual(new Set([0, 2]));
  });

  it("handles page breaks (form feed)", () => {
    const text = "페이지1\f페이지2";
    const grid = textToGrid(text);
    expect(grid.length).toBe(2);
    expect(grid[0].text).toBe("페이지1");
    expect(grid[1].text).toBe("페이지2");
  });

  it("returns empty array for empty text", () => {
    expect(textToGrid("")).toEqual([]);
    expect(textToGrid("   ")).toEqual([]);
  });

  it("preserves col position based on character offset", () => {
    const text = "A      B";
    const grid = textToGrid(text);
    expect(grid[0].col).toBe(0);
    expect(grid[1].col).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- test/text-grid.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement text-grid.ts**

```typescript
// src/lib/text-grid.ts

export interface GridToken {
  text: string;
  row: number;
  col: number;
  id: string;
}

export function textToGrid(rawText: string): GridToken[] {
  if (!rawText.trim()) return [];

  const tokens: GridToken[] = [];
  const lines = rawText.replace(/\f/g, "\n").split("\n");

  for (let row = 0; row < lines.length; row++) {
    const line = lines[row];
    if (!line.trim()) continue;

    // Split line into tokens by whitespace, preserving column positions
    const tokenRegex = /\S+/g;
    let match;
    while ((match = tokenRegex.exec(line)) !== null) {
      tokens.push({
        text: match[0],
        row,
        col: match.index,
        id: `t-${row}-${match.index}`,
      });
    }
  }

  return tokens;
}

// Find token neighbors (right/below) for field rule builder
export function findNeighbors(
  grid: GridToken[],
  tokenId: string
): { right: GridToken[]; below: GridToken[] } {
  const token = grid.find((t) => t.id === tokenId);
  if (!token) return { right: [], below: [] };

  // Right: same row, col > token.col, sorted by col
  const right = grid
    .filter((t) => t.row === token.row && t.col > token.col)
    .sort((a, b) => a.col - b.col);

  // Below: next rows with similar or greater col, first token per row
  const below: GridToken[] = [];
  for (let r = token.row + 1; r <= token.row + 3; r++) {
    const rowTokens = grid
      .filter((t) => t.row === r)
      .sort((a, b) => a.col - b.col);
    if (rowTokens.length > 0) {
      // Find token closest to same column or first token
      const closest =
        rowTokens.find((t) => t.col >= token.col - 2) || rowTokens[0];
      below.push(closest);
    }
  }

  return { right: right.slice(0, 5), below: below.slice(0, 3) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- test/text-grid.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 5: Add findNeighbors tests**

Add to `test/text-grid.test.ts`:

```typescript
import { findNeighbors } from "@/lib/text-grid";

describe("findNeighbors", () => {
  it("finds right neighbors on same row", () => {
    const grid = textToGrid("성명  홍길동  부서");
    const { right } = findNeighbors(grid, grid[0].id);
    expect(right[0].text).toBe("홍길동");
    expect(right[1].text).toBe("부서");
  });

  it("finds below neighbors", () => {
    const grid = textToGrid("성명  홍길동\n부서  개발팀");
    const { below } = findNeighbors(grid, grid[0].id);
    expect(below[0].text).toBe("부서");
  });

  it("returns empty for unknown token", () => {
    const grid = textToGrid("test");
    const result = findNeighbors(grid, "nonexistent");
    expect(result).toEqual({ right: [], below: [] });
  });
});
```

- [ ] **Step 6: Run all tests**

```bash
npm test -- test/text-grid.test.ts
```

Expected: all 9 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/text-grid.ts test/text-grid.test.ts
git commit -m "feat: add text-grid module for PDF token grid conversion"
```

---

### Task 3: rule-parser.ts — 룰 기반 추출 엔진

**Files:**
- Create: `src/lib/rule-parser.ts`
- Create: `test/rule-parser.test.ts`

- [ ] **Step 1: Write FieldRule tests**

```typescript
// test/rule-parser.test.ts
import { describe, it, expect } from "vitest";
import { applyFieldRules, applyTableRule } from "@/lib/rule-parser";
import { textToGrid } from "@/lib/text-grid";
import type { FieldRule, TableRule } from "@/lib/rule-parser";

describe("applyFieldRules", () => {
  it("extracts field value to the right of keyword", () => {
    const grid = textToGrid("성명  홍길동  부서  개발팀");
    const rules: FieldRule[] = [
      { name: "성명", keyword: "성명", direction: "right" },
    ];
    const result = applyFieldRules(grid, rules);
    expect(result.fields).toEqual([{ name: "성명", value: "홍길동" }]);
    expect(result.warnings).toEqual([]);
  });

  it("extracts field value below keyword", () => {
    const grid = textToGrid("성명\n홍길동");
    const rules: FieldRule[] = [
      { name: "성명", keyword: "성명", direction: "below" },
    ];
    const result = applyFieldRules(grid, rules);
    expect(result.fields).toEqual([{ name: "성명", value: "홍길동" }]);
  });

  it("applies pattern filter when specified", () => {
    const grid = textToGrid("신청일  2024. 3. 15 (금)");
    const rules: FieldRule[] = [
      {
        name: "신청일",
        keyword: "신청일",
        direction: "right",
        pattern: "\\d{4}\\.\\s*\\d{1,2}\\.\\s*\\d{1,2}",
      },
    ];
    const result = applyFieldRules(grid, rules);
    expect(result.fields[0].value).toMatch(/2024/);
  });

  it("warns when keyword not found", () => {
    const grid = textToGrid("아무 텍스트");
    const rules: FieldRule[] = [
      { name: "성명", keyword: "성명", direction: "right" },
    ];
    const result = applyFieldRules(grid, rules);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("성명");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- test/rule-parser.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement rule-parser.ts (field rules)**

```typescript
// src/lib/rule-parser.ts
import { GridToken, findNeighbors } from "./text-grid";

export interface FieldRule {
  name: string;
  keyword: string;
  direction: "right" | "below";
  pattern?: string;
}

export interface TableRule {
  headerKeywords: string[];
  columns: TableColumnRule[];
  rowPattern?: string;
}

export interface TableColumnRule {
  name: string;
  keyword: string;
  type: "text" | "number" | "date" | "hours";
}

export interface ExtractionConfig {
  fields: FieldRule[];
  table: TableRule;
}

interface FieldResult {
  fields: { name: string; value: string }[];
  warnings: string[];
}

export function applyFieldRules(
  grid: GridToken[],
  rules: FieldRule[]
): FieldResult {
  const fields: { name: string; value: string }[] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    const keywordToken = grid.find(
      (t) => t.text === rule.keyword || t.text.includes(rule.keyword)
    );

    if (!keywordToken) {
      warnings.push(`키워드 "${rule.keyword}"을(를) 찾을 수 없습니다.`);
      continue;
    }

    const neighbors = findNeighbors(grid, keywordToken.id);
    const candidates =
      rule.direction === "right" ? neighbors.right : neighbors.below;

    if (candidates.length === 0) {
      warnings.push(
        `"${rule.keyword}" ${rule.direction === "right" ? "오른쪽" : "아래"}에서 값을 찾을 수 없습니다.`
      );
      continue;
    }

    let value: string;
    if (rule.pattern) {
      // Join candidate texts and search for pattern
      const combinedText = candidates.map((t) => t.text).join(" ");
      const match = combinedText.match(new RegExp(rule.pattern));
      value = match ? match[0] : candidates[0].text;
    } else {
      value = candidates[0].text;
    }

    fields.push({ name: rule.name, value });
  }

  return { fields, warnings };
}
```

- [ ] **Step 4: Run field rule tests**

```bash
npm test -- test/rule-parser.test.ts
```

Expected: all 4 field rule tests PASS

- [ ] **Step 5: Write TableRule tests**

Add to `test/rule-parser.test.ts`:

```typescript
describe("applyTableRule", () => {
  const tableText = [
    "번호  근무기간              근무내용      초과근무시간",
    "1     2024.4.1(월)~4.1(월)  서버점검      2h",
    "2     2024.4.2(화)~4.2(화)  코드리뷰      1.5",
  ].join("\n");

  it("detects table headers and extracts rows", () => {
    const grid = textToGrid(tableText);
    const rule: TableRule = {
      headerKeywords: ["근무기간", "근무내용", "초과근무시간"],
      columns: [
        { name: "근무기간", keyword: "근무기간", type: "date" },
        { name: "근무내용", keyword: "근무내용", type: "text" },
        { name: "초과시간", keyword: "초과근무시간", type: "hours" },
      ],
      rowPattern: "^\\d+\\s+",
    };
    const result = applyTableRule(grid, rule);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0]["근무내용"]).toBe("서버점검");
  });

  it("warns when header not found", () => {
    const grid = textToGrid("아무 텍스트");
    const rule: TableRule = {
      headerKeywords: ["근무기간"],
      columns: [{ name: "근무기간", keyword: "근무기간", type: "date" }],
    };
    const result = applyTableRule(grid, rule);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns empty rows for table with no data rows", () => {
    const grid = textToGrid("근무기간  근무내용  초과근무시간");
    const rule: TableRule = {
      headerKeywords: ["근무기간", "근무내용", "초과근무시간"],
      columns: [
        { name: "근무기간", keyword: "근무기간", type: "date" },
      ],
      rowPattern: "^\\d+\\s+",
    };
    const result = applyTableRule(grid, rule);
    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 6: Implement applyTableRule**

Add to `src/lib/rule-parser.ts`:

```typescript
interface TableResult {
  rows: Record<string, string>[];
  warnings: string[];
}

export function applyTableRule(
  grid: GridToken[],
  rule: TableRule
): TableResult {
  const warnings: string[] = [];

  // Find header row — the row that contains the most header keywords
  const rowGroups = new Map<number, GridToken[]>();
  for (const token of grid) {
    if (!rowGroups.has(token.row)) rowGroups.set(token.row, []);
    rowGroups.get(token.row)!.push(token);
  }

  let headerRow = -1;
  let maxMatches = 0;
  for (const [row, tokens] of rowGroups) {
    const text = tokens.map((t) => t.text).join(" ");
    const matches = rule.headerKeywords.filter((kw) =>
      text.includes(kw)
    ).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      headerRow = row;
    }
  }

  if (headerRow === -1 || maxMatches === 0) {
    warnings.push("테이블 헤더를 찾을 수 없습니다.");
    return { rows: [], warnings };
  }

  // Map each column keyword to its col position in the header row
  const headerTokens = rowGroups.get(headerRow)!;
  const colPositions: { name: string; col: number; type: TableColumnRule["type"] }[] = [];
  for (const colRule of rule.columns) {
    const headerToken = headerTokens.find(
      (t) => t.text === colRule.keyword || t.text.includes(colRule.keyword)
    );
    if (headerToken) {
      colPositions.push({ name: colRule.name, col: headerToken.col, type: colRule.type });
    } else {
      warnings.push(`테이블 컬럼 "${colRule.keyword}"을(를) 헤더에서 찾을 수 없습니다.`);
    }
  }

  if (colPositions.length === 0) {
    return { rows: [], warnings };
  }

  // Sort columns by position
  colPositions.sort((a, b) => a.col - b.col);

  // Extract data rows (rows after header that match rowPattern)
  const rows: Record<string, string>[] = [];
  const sortedRows = Array.from(rowGroups.keys()).sort((a, b) => a - b);

  for (const row of sortedRows) {
    if (row <= headerRow) continue;
    const tokens = rowGroups.get(row)!;
    const lineText = tokens.map((t) => t.text).join(" ");

    // Check rowPattern if provided
    if (rule.rowPattern) {
      // Reconstruct original line spacing for pattern matching
      const origLine = tokens
        .sort((a, b) => a.col - b.col)
        .map((t) => " ".repeat(Math.max(0, t.col)) + t.text)
        .join("");
      if (!new RegExp(rule.rowPattern).test(origLine.trimStart())) continue;
    }

    if (!lineText.trim()) continue;

    // Assign each token to the nearest column based on col position
    const rowData: Record<string, string> = {};
    const sortedTokens = tokens.sort((a, b) => a.col - b.col);

    for (const token of sortedTokens) {
      let bestCol = colPositions[0];
      let bestDist = Math.abs(token.col - bestCol.col);
      for (const cp of colPositions) {
        const dist = Math.abs(token.col - cp.col);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = cp;
        }
      }
      if (rowData[bestCol.name]) {
        rowData[bestCol.name] += " " + token.text;
      } else {
        rowData[bestCol.name] = token.text;
      }
    }

    rows.push(rowData);
  }

  return { rows, warnings };
}
```

- [ ] **Step 7: Run all rule-parser tests**

```bash
npm test -- test/rule-parser.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/rule-parser.ts test/rule-parser.test.ts
git commit -m "feat: add rule-parser module for configurable PDF extraction"
```

---

### Task 4: db.ts — PresetConfig 확장 + 마이그레이션

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add ExtractionConfig to PresetConfig type**

In `src/lib/db.ts`, replace the `PresetConfig` interface:

```typescript
export interface PresetConfig {
  extraction?: ExtractionConfig;
  columns: Record<string, string>;
  startRow: number;
  emptyCheckColumn: string;
}

export interface ExtractionConfig {
  fields: FieldRule[];
  table: TableRule;
}

export interface FieldRule {
  name: string;
  keyword: string;
  direction: "right" | "below";
  pattern?: string;
}

export interface TableRule {
  headerKeywords: string[];
  columns: TableColumnRule[];
  rowPattern?: string;
}

export interface TableColumnRule {
  name: string;
  keyword: string;
  type: "text" | "number" | "date" | "hours";
}
```

- [ ] **Step 2: Update DEFAULT_PRESET with extraction config**

Replace the `DEFAULT_PRESET` constant:

```typescript
const DEFAULT_PRESET: Omit<Preset, "id"> = {
  name: "초과근무 신청서",
  config: JSON.stringify({
    extraction: {
      fields: [
        { name: "성명", keyword: "성명", direction: "right" },
        {
          name: "신청일",
          keyword: "신청일",
          direction: "right",
          pattern: "\\d{4}\\.\\s*\\d{1,2}\\.\\s*\\d{1,2}",
        },
      ],
      table: {
        headerKeywords: ["근무기간", "근무내용", "초과근무시간"],
        columns: [
          { name: "근무기간", keyword: "근무기간", type: "date" },
          { name: "근무내용", keyword: "근무내용", type: "text" },
          { name: "초과시간", keyword: "초과근무시간", type: "hours" },
        ],
        rowPattern: "^\\d+\\s+",
      },
    },
    columns: {
      문서번호: "A",
      성명: "B",
      근무기간: "C",
      초과시간: "D",
      인정시간: "E",
      인정일수: "F",
      신청일: "J",
      근무내용: "L",
    },
    startRow: 5,
    emptyCheckColumn: "B",
  }),
  is_default: 1,
  created_at: new Date().toISOString(),
};
```

- [ ] **Step 3: Update auto-migrate in loadPresets()**

In the `loadPresets()` function, update the auto-migrate logic to also check for missing `extraction` field:

```typescript
// Auto-migrate: update default preset if schema changed
const defaultIdx = presets.findIndex((p) => p.is_default === 1);
if (defaultIdx >= 0) {
  const current = JSON.parse(presets[defaultIdx].config) as PresetConfig;
  const expected = JSON.parse(DEFAULT_PRESET.config) as PresetConfig;
  const currentKeys = Object.keys(current.columns).sort().join(",");
  const expectedKeys = Object.keys(expected.columns).sort().join(",");
  const hasExtraction = !!current.extraction;
  if (currentKeys !== expectedKeys || !hasExtraction) {
    presets[defaultIdx].config = DEFAULT_PRESET.config;
    savePresets(presets);
  }
}
```

- [ ] **Step 4: Build to verify no type errors**

```bash
npm run build
```

Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: extend PresetConfig with extraction rules and migration"
```

---

### Task 5: API — parse/preview 엔드포인트

**Files:**
- Create: `src/app/api/parse/preview/route.ts`

- [ ] **Step 1: Create the preview API route**

```typescript
// src/app/api/parse/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { textToGrid } from "@/lib/text-grid";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  let tempPath = "";
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "PDF 파일이 없습니다." },
        { status: 400 }
      );
    }

    // Save to temp file
    const bytes = await file.arrayBuffer();
    tempPath = join(tmpdir(), `preview-${Date.now()}.pdf`);
    await writeFile(tempPath, Buffer.from(bytes));

    // Extract text
    const { stdout } = await execFileAsync("pdftotext", [
      "-layout",
      tempPath,
      "-",
    ]);

    const grid = textToGrid(stdout);

    return NextResponse.json({ grid, rawText: stdout });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json(
      { error: "PDF 텍스트 추출에 실패했습니다." },
      { status: 500 }
    );
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/parse/preview/route.ts
git commit -m "feat: add parse/preview API for PDF text grid extraction"
```

---

### Task 6: API — parse/test 엔드포인트

**Files:**
- Create: `src/app/api/parse/test/route.ts`

- [ ] **Step 1: Create the test API route**

```typescript
// src/app/api/parse/test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { textToGrid } from "@/lib/text-grid";
import {
  applyFieldRules,
  applyTableRule,
  ExtractionConfig,
} from "@/lib/rule-parser";

const execFileAsync = promisify(execFile);

function parseWorkHours(raw: string): number {
  const s = raw.trim();
  const hm = s.match(/^(\d+)h(\d+)$/);
  if (hm) return (parseInt(hm[1], 10) || 0) + (parseInt(hm[2], 10) || 0) / 60;
  if (s.endsWith("h")) return parseFloat(s.slice(0, -1)) || 0;
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    return (parseInt(h, 10) || 0) + (parseInt(m, 10) || 0) / 60;
  }
  return parseFloat(s) || 0;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function POST(request: NextRequest) {
  let tempPath = "";
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const extractionJson = formData.get("extraction") as string | null;

    if (!file || !extractionJson) {
      return NextResponse.json(
        { error: "PDF 파일과 extraction 설정이 필요합니다." },
        { status: 400 }
      );
    }

    const extraction: ExtractionConfig = JSON.parse(extractionJson);

    // Save to temp file
    const bytes = await file.arrayBuffer();
    tempPath = join(tmpdir(), `test-${Date.now()}.pdf`);
    await writeFile(tempPath, Buffer.from(bytes));

    // Extract text
    const { stdout } = await execFileAsync("pdftotext", [
      "-layout",
      tempPath,
      "-",
    ]);

    const grid = textToGrid(stdout);
    const allWarnings: string[] = [];

    // Apply field rules
    const fieldResult = applyFieldRules(grid, extraction.fields);
    allWarnings.push(...fieldResult.warnings);

    // Apply table rule
    const tableResult = applyTableRule(grid, extraction.table);
    allWarnings.push(...tableResult.warnings);

    // Build entries with calculations
    const entries = tableResult.rows.map((row) => {
      const hoursCol = extraction.table.columns.find(
        (c) => c.type === "hours"
      );
      const rawHours = hoursCol ? row[hoursCol.name] || "" : "";
      const workHours = parseWorkHours(rawHours);
      const recognizedHours = workHours * 1.5;
      const recognizedDays = recognizedHours / 8;

      return {
        ...row,
        workHours: round3(workHours),
        recognizedHours: round3(recognizedHours),
        recognizedDays: round3(recognizedDays),
      };
    });

    return NextResponse.json({
      fields: fieldResult.fields,
      entries,
      warnings: allWarnings,
    });
  } catch (error) {
    console.error("Test parse error:", error);
    return NextResponse.json(
      { error: "테스트 파싱에 실패했습니다." },
      { status: 500 }
    );
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/parse/test/route.ts
git commit -m "feat: add parse/test API for extraction rule testing"
```

---

### Task 7: pdf-parser.ts — 프리셋 분기 추가

**Files:**
- Modify: `src/lib/pdf-parser.ts:25-29`

- [ ] **Step 1: Update parsePdfTable signature to accept optional preset**

In `src/lib/pdf-parser.ts`, change the `parsePdfTable` function and add the import:

```typescript
import { textToGrid } from "./text-grid";
import {
  applyFieldRules,
  applyTableRule,
  ExtractionConfig,
} from "./rule-parser";
import { PresetConfig } from "./db";
```

Replace the `parsePdfTable` function:

```typescript
export async function parsePdfTable(
  filePath: string,
  originalName: string,
  presetConfig?: PresetConfig
): Promise<ParsedResult> {
  const text = await extractText(filePath);
  const documentNumber = extractDocumentNumber(originalName);

  // If preset has extraction rules, use rule-parser
  if (presetConfig?.extraction) {
    return parseWithRules(text, documentNumber, presetConfig.extraction);
  }

  // Otherwise, use existing hardcoded parser (no changes)
  return parseOvertimeDocument(text, documentNumber);
}

function parseWithRules(
  text: string,
  documentNumber: string,
  extraction: ExtractionConfig
): ParsedResult {
  const grid = textToGrid(text);
  const warnings: string[] = [];

  // Extract single fields
  const fieldResult = applyFieldRules(grid, extraction.fields);
  warnings.push(...fieldResult.warnings);

  const fieldMap = new Map(fieldResult.fields.map((f) => [f.name, f.value]));
  const applicantName = fieldMap.get("성명") || "";
  const applicationDate = fieldMap.get("신청일") || "";

  // Extract table rows
  const tableResult = applyTableRule(grid, extraction.table);
  warnings.push(...tableResult.warnings);

  const hoursCol = extraction.table.columns.find((c) => c.type === "hours");
  const entries: OvertimeEntry[] = tableResult.rows.map((row) => {
    const rawHours = hoursCol ? row[hoursCol.name] || "" : "";
    const workHours = parseWorkHours(rawHours);
    const recognizedHours = workHours * 1.5;
    const recognizedDays = recognizedHours / 8;

    const entryWarnings: string[] = [];
    if (workHours <= 0) {
      entryWarnings.push(`근무시간 파싱 실패: "${rawHours || "(없음)"}"`);
    }

    const dateCol = extraction.table.columns.find((c) => c.type === "date");
    const contentCol = extraction.table.columns.find(
      (c) => c.type === "text"
    );

    return {
      documentNumber,
      name: applicantName,
      workPeriod: dateCol ? row[dateCol.name] || "" : "",
      workHours: round3(workHours),
      recognizedHours: round3(recognizedHours),
      recognizedDays: round3(recognizedDays),
      applicationDate,
      workContent: contentCol ? row[contentCol.name] || "" : "",
      warnings: entryWarnings,
    };
  });

  if (!documentNumber) warnings.push("문서번호를 파일명에서 찾을 수 없습니다.");
  if (!applicantName) warnings.push("신청자 성명을 찾을 수 없습니다.");
  if (!applicationDate) warnings.push("신청일을 찾을 수 없습니다.");

  return { entries, documentNumber, applicantName, applicationDate, warnings };
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: Build succeeds. Existing call sites pass no presetConfig, so they use the hardcoded path.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf-parser.ts
git commit -m "feat: add preset-based rule-parser branch to pdf-parser"
```

---

### Task 8: 룰 빌더 UI 컴포넌트

**Files:**
- Create: `src/app/settings/rule-builder.tsx`

- [ ] **Step 1: Create the rule builder component**

```typescript
// src/app/settings/rule-builder.tsx
"use client";

import { useState, useCallback } from "react";

interface GridToken {
  text: string;
  row: number;
  col: number;
  id: string;
}

interface FieldRule {
  name: string;
  keyword: string;
  direction: "right" | "below";
  pattern?: string;
}

interface TableColumnRule {
  name: string;
  keyword: string;
  type: "text" | "number" | "date" | "hours";
}

interface TableRule {
  headerKeywords: string[];
  columns: TableColumnRule[];
  rowPattern?: string;
}

interface ExtractionConfig {
  fields: FieldRule[];
  table: TableRule;
}

interface RuleBuilderProps {
  extraction: ExtractionConfig;
  onChange: (extraction: ExtractionConfig) => void;
}

type SelectionMode =
  | { type: "idle" }
  | { type: "selecting-label" }
  | { type: "selecting-value"; keyword: string; keywordId: string };

export default function RuleBuilder({ extraction, onChange }: RuleBuilderProps) {
  const [grid, setGrid] = useState<GridToken[]>([]);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SelectionMode>({ type: "idle" });
  const [testResult, setTestResult] = useState<{
    fields: { name: string; value: string }[];
    entries: Record<string, string>[];
    warnings: string[];
  } | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [tooltip, setTooltip] = useState("");

  const handlePdfUpload = useCallback(
    async (file: File) => {
      setLoading(true);
      setSampleFile(file);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse/preview", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setGrid(data.grid);
        setRawText(data.rawText);
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "PDF 텍스트 추출에 실패했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type === "application/pdf") handlePdfUpload(file);
    },
    [handlePdfUpload]
  );

  const handleTokenClick = useCallback(
    (token: GridToken) => {
      if (mode.type === "idle" || mode.type === "selecting-label") {
        // First click: select keyword/label
        setMode({
          type: "selecting-value",
          keyword: token.text,
          keywordId: token.id,
        });
        setTooltip("이 키워드의 오른쪽이나 아래에서 값을 클릭하세요");
      } else if (mode.type === "selecting-value") {
        // Second click: determine direction and create rule
        const kwToken = grid.find((t) => t.id === mode.keywordId);
        if (!kwToken) return;

        const direction: "right" | "below" =
          token.row === kwToken.row ? "right" : "below";

        const newField: FieldRule = {
          name: mode.keyword,
          keyword: mode.keyword,
          direction,
        };

        onChange({
          ...extraction,
          fields: [...extraction.fields, newField],
        });
        setMode({ type: "idle" });
        setTooltip("");
      }
    },
    [mode, grid, extraction, onChange]
  );

  const removeField = useCallback(
    (idx: number) => {
      onChange({
        ...extraction,
        fields: extraction.fields.filter((_, i) => i !== idx),
      });
    },
    [extraction, onChange]
  );

  const handleTest = useCallback(async () => {
    if (!sampleFile) return;
    setTestOpen(true);
    setTestResult(null);
    try {
      const formData = new FormData();
      formData.append("file", sampleFile);
      formData.append("extraction", JSON.stringify(extraction));
      const res = await fetch("/api/parse/test", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestResult(data);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "테스트 파싱에 실패했습니다."
      );
    }
  }, [sampleFile, extraction]);

  // Get tokens that are already assigned as keywords
  const assignedKeywords = new Set(extraction.fields.map((f) => f.keyword));

  // Group grid tokens by row for rendering
  const rowGroups = new Map<number, GridToken[]>();
  for (const token of grid) {
    if (!rowGroups.has(token.row)) rowGroups.set(token.row, []);
    rowGroups.get(token.row)!.push(token);
  }
  const sortedRows = Array.from(rowGroups.keys()).sort((a, b) => a - b);

  const getTokenStyle = (token: GridToken): string => {
    if (mode.type === "selecting-value" && token.id === mode.keywordId)
      return "bg-amber-200 rounded px-0.5";
    if (assignedKeywords.has(token.text))
      return "bg-amber-100 rounded px-0.5";
    if (
      mode.type === "selecting-value" &&
      token.id !== mode.keywordId
    ) {
      const kwToken = grid.find((t) => t.id === mode.keywordId);
      if (kwToken) {
        const isRight = token.row === kwToken.row && token.col > kwToken.col;
        const isBelow =
          token.row > kwToken.row && token.row <= kwToken.row + 3;
        if (isRight || isBelow)
          return "border border-dashed border-emerald-400 bg-emerald-50 rounded px-0.5";
      }
    }
    return "hover:bg-blue-100 rounded px-0.5";
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={!sampleFile}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          테스트
        </button>
      </div>

      {/* Split pane */}
      <div className="flex gap-4" style={{ minHeight: "400px" }}>
        {/* Left: PDF text grid */}
        <div className="flex-[3] flex flex-col">
          {grid.length === 0 ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex-1 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 gap-3 cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-colors"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pdf";
                input.onchange = (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) handlePdfUpload(f);
                };
                input.click();
              }}
            >
              <svg
                className="w-10 h-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium">샘플 PDF를 올려주세요</p>
                <p className="text-xs mt-1">
                  1. PDF를 올리면 텍스트가 표시됩니다
                </p>
                <p className="text-xs">
                  2. 텍스트에서 라벨(키워드)을 클릭하세요
                </p>
                <p className="text-xs">3. 하이라이트된 값을 선택하세요</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto bg-white border border-slate-200 rounded-xl p-4">
              {loading && (
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <div className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full" />
                  <span className="text-sm">텍스트 추출 중...</span>
                </div>
              )}
              {tooltip && (
                <div className="mb-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs rounded-lg">
                  {tooltip}
                </div>
              )}
              <pre className="font-mono text-xs leading-relaxed whitespace-pre">
                {sortedRows.map((row) => {
                  const tokens = rowGroups.get(row)!.sort(
                    (a, b) => a.col - b.col
                  );
                  return (
                    <div key={row}>
                      {tokens.map((token, i) => {
                        const prevEnd =
                          i > 0
                            ? tokens[i - 1].col + tokens[i - 1].text.length
                            : 0;
                        const gap = Math.max(0, token.col - prevEnd);
                        return (
                          <span key={token.id}>
                            {gap > 0 && " ".repeat(gap)}
                            <span
                              className={`cursor-pointer ${getTokenStyle(token)} relative`}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleTokenClick(token)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleTokenClick(token);
                              }}
                            >
                              {assignedKeywords.has(token.text) && (
                                <span className="absolute -top-3 left-0 text-[9px] bg-amber-500 text-white px-1 rounded">
                                  {token.text}
                                </span>
                              )}
                              {token.text}
                            </span>
                          </span>
                        );
                      })}
                      {"\n"}
                    </div>
                  );
                })}
              </pre>
              {/* Re-upload button */}
              <div className="mt-3 pt-3 border-t border-slate-100">
                <label className="text-xs text-slate-400 cursor-pointer hover:text-blue-500">
                  다른 PDF 올리기
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePdfUpload(f);
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Right: Extraction rules panel */}
        <div className="flex-[2] flex flex-col gap-4 overflow-auto">
          {/* Fields */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              단일 필드
            </h3>
            <div className="space-y-2">
              {extraction.fields.map((field, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="px-2 py-0.5 bg-amber-100 rounded text-amber-800 font-mono text-xs">
                    {field.keyword}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="text-xs text-slate-500">
                    {field.direction === "right" ? "오른쪽" : "아래"}
                  </span>
                  <span className="flex-1" />
                  <button
                    onClick={() => removeField(idx)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              {extraction.fields.length === 0 && (
                <p className="text-xs text-slate-400">
                  PDF에서 라벨을 클릭하여 필드를 추가하세요
                </p>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              테이블
            </h3>
            <div className="space-y-2">
              {extraction.table.columns.map((col, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="px-2 py-0.5 bg-blue-100 rounded text-blue-800 font-mono text-xs">
                    {col.keyword}
                  </span>
                  <span className="text-slate-400">→</span>
                  <select
                    value={col.type}
                    onChange={(e) => {
                      const newCols = [...extraction.table.columns];
                      newCols[idx] = {
                        ...newCols[idx],
                        type: e.target.value as TableColumnRule["type"],
                      };
                      onChange({
                        ...extraction,
                        table: { ...extraction.table, columns: newCols },
                      });
                    }}
                    className="text-xs border border-slate-300 rounded px-2 py-1"
                  >
                    <option value="text">텍스트</option>
                    <option value="number">숫자</option>
                    <option value="date">날짜</option>
                    <option value="hours">시간</option>
                  </select>
                  <span className="flex-1" />
                  <button
                    onClick={() => {
                      const newCols = extraction.table.columns.filter(
                        (_, i) => i !== idx
                      );
                      onChange({
                        ...extraction,
                        table: { ...extraction.table, columns: newCols },
                      });
                    }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            {extraction.table.rowPattern && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <label className="text-xs text-slate-500">행 패턴</label>
                <input
                  type="text"
                  value={extraction.table.rowPattern}
                  onChange={(e) =>
                    onChange({
                      ...extraction,
                      table: {
                        ...extraction.table,
                        rowPattern: e.target.value,
                      },
                    })
                  }
                  className="mt-1 w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test results (collapsible) */}
      {testOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">
              테스트 결과
            </h3>
            <button
              onClick={() => setTestOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              접기
            </button>
          </div>
          {testResult ? (
            <div className="space-y-3">
              {testResult.warnings.length > 0 && (
                <div className="space-y-1">
                  {testResult.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="px-3 py-1.5 bg-orange-50 text-orange-700 text-xs rounded"
                    >
                      {w}
                    </div>
                  ))}
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 mb-1">필드:</p>
                {testResult.fields.map((f, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium">{f.name}:</span> {f.value}
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">
                  테이블: {testResult.entries.length}행
                </p>
                {testResult.entries.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr>
                          {Object.keys(testResult.entries[0]).map((k) => (
                            <th
                              key={k}
                              className="border border-slate-200 px-2 py-1 bg-slate-50 text-left"
                            >
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {testResult.entries.map((entry, i) => (
                          <tr key={i}>
                            {Object.values(entry).map((v, j) => (
                              <td
                                key={j}
                                className="border border-slate-200 px-2 py-1"
                              >
                                {String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <div className="animate-spin w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full" />
              <span className="text-sm">파싱 중...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/rule-builder.tsx
git commit -m "feat: add rule builder UI component with token click interaction"
```

---

### Task 9: settings/page.tsx — 탭 UI 통합

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Add tab state and import RuleBuilder**

At the top of the file, add the import:

```typescript
import RuleBuilder from "./rule-builder";
```

In `SettingsPage`, add a tab state:

```typescript
const [activeTab, setActiveTab] = useState<"extraction" | "mapping">("extraction");
```

- [ ] **Step 2: Wrap the editor section with tabs**

Replace the existing editor section (`{showingEditor && (...)}`) to include tabs. The extraction tab shows the RuleBuilder component, the mapping tab shows the existing column mapping editor. The RuleBuilder receives `editConfig.extraction` and `onChange` updates `editConfig`.

Add extraction state handling to `startEdit` and `startNew`:

```typescript
const startEdit = (preset: Preset) => {
  setEditing(preset);
  setEditName(preset.name);
  setEditConfig({ ...preset.config });
  setIsNew(false);
  setActiveTab("extraction");
};

const startNew = () => {
  setEditing(null);
  setEditName("");
  setEditConfig({
    ...DEFAULT_CONFIG,
    extraction: {
      fields: [],
      table: { headerKeywords: [], columns: [], rowPattern: "" },
    },
  });
  setIsNew(true);
  setActiveTab("extraction");
};
```

In the editor section, add tab buttons before the content area:

```tsx
{/* Tabs */}
<div className="flex gap-1 mb-4 border-b border-slate-200">
  <button
    onClick={() => setActiveTab("extraction")}
    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      activeTab === "extraction"
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`}
  >
    추출 룰
  </button>
  <button
    onClick={() => setActiveTab("mapping")}
    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      activeTab === "mapping"
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`}
  >
    시트 매핑
  </button>
</div>
```

Show the extraction tab with RuleBuilder:

```tsx
{activeTab === "extraction" && (
  <RuleBuilder
    extraction={
      editConfig.extraction || {
        fields: [],
        table: { headerKeywords: [], columns: [] },
      }
    }
    onChange={(extraction) =>
      setEditConfig((prev) => ({ ...prev, extraction }))
    }
  />
)}
```

Show the mapping tab with the existing column mapping UI (the existing `{/* Column Mapping */}`, `{/* Start Row & Check Column */}`, and `{/* Preview */}` sections).

- [ ] **Step 3: Update DEFAULT_CONFIG to include extraction**

```typescript
const DEFAULT_CONFIG: PresetConfig = {
  extraction: {
    fields: [
      { name: "성명", keyword: "성명", direction: "right" as const },
      {
        name: "신청일",
        keyword: "신청일",
        direction: "right" as const,
        pattern: "\\d{4}\\.\\s*\\d{1,2}\\.\\s*\\d{1,2}",
      },
    ],
    table: {
      headerKeywords: ["근무기간", "근무내용", "초과근무시간"],
      columns: [
        { name: "근무기간", keyword: "근무기간", type: "date" as const },
        { name: "근무내용", keyword: "근무내용", type: "text" as const },
        { name: "초과시간", keyword: "초과근무시간", type: "hours" as const },
      ],
      rowPattern: "^\\d+\\s+",
    },
  },
  columns: {
    문서번호: "A",
    성명: "B",
    초과근무일시: "C",
    초과시간: "D",
    인정시간: "E",
    인정일수: "F",
    신청일: "J",
    근무내용: "L",
  },
  startRow: 5,
  emptyCheckColumn: "B",
};
```

- [ ] **Step 4: Update PresetConfig interface to include extraction**

```typescript
interface PresetConfig {
  extraction?: {
    fields: { name: string; keyword: string; direction: "right" | "below"; pattern?: string }[];
    table: {
      headerKeywords: string[];
      columns: { name: string; keyword: string; type: "text" | "number" | "date" | "hours" }[];
      rowPattern?: string;
    };
  };
  columns: Record<string, string>;
  startRow: number;
  emptyCheckColumn: string;
}
```

- [ ] **Step 5: Build to verify**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 6: Verify with Playwright MCP**

Start dev server and use Playwright to:
1. Navigate to `/settings`
2. Click "수정" on the default preset
3. Verify "추출 룰" and "시트 매핑" tabs appear
4. Click "시트 매핑" tab, verify existing column mapping is visible
5. Navigate to `/`, verify existing upload+parse+export flow still works

- [ ] **Step 7: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: integrate rule builder with tabbed settings UI"
```

---

### Task 10: 전체 통합 테스트 + 회귀 확인

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Verify existing flow with Playwright MCP**

Start the dev server and use Playwright to verify the complete existing workflow:
1. Navigate to `/`
2. Upload a PDF (초과근무 신청서)
3. Click "파싱" — verify results appear (성명, entries, etc.)
4. Verify the parsed data matches the expected format

This confirms the existing hardcoded parser still works with no regression.

- [ ] **Step 4: Verify rule builder flow with Playwright MCP**

1. Navigate to `/settings`
2. Click "새 프리셋"
3. Enter name "테스트 프리셋"
4. Switch to "추출 룰" tab
5. Upload a sample PDF via the dropzone
6. Verify text grid appears with clickable tokens
7. Click a keyword token, verify highlight state
8. Click "테스트" button, verify results panel opens
9. Switch to "시트 매핑" tab, verify column mapping editor
10. Click "저장"

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "test: verify rule builder integration and regression"
git push
```
