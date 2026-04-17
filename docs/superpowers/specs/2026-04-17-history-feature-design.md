# History Feature Design

**Date:** 2026-04-17  
**Status:** Approved

## Overview

Add a history feature to pdf2sheet so that each parse session's results are automatically saved and can be reviewed later. Users access history via a dedicated `/history` page linked from the main page.

## Data Structure

Single `history.json` file in the project root. No size limit.

```json
[
  {
    "id": "1745123456789",
    "savedAt": "2026-04-17T14:32:00.000Z",
    "results": [
      {
        "id": 1,
        "originalName": "2026-257_초과근무 신청서.pdf",
        "applicantName": "전보배",
        "applicationDate": "2026. 4. 2",
        "entries": [...],
        "entryCount": 1,
        "error": null,
        "warnings": []
      }
    ]
  }
]
```

- `id`: `String(Date.now())` at save time
- `results`: full `ParsedResult[]` including files with errors/warnings
- No maximum entry limit

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/history` | List all sessions (id, savedAt, file count, hasError) |
| `POST` | `/api/history` | Save new session with full results |
| `GET` | `/api/history/[id]` | Get full results for one session |

## Storage Layer (`src/lib/db.ts`)

Add functions alongside existing preset functions:

- `loadHistory()` — read and parse `history.json`, return `HistorySession[]`
- `saveHistory(sessions)` — write full array back to file
- `appendHistorySession(results: ParsedResult[])` — load, push new session, save
- `getHistorySession(id: string)` — find session by id

## Save Trigger

In `src/app/page.tsx`, after parse completes and `parsedResults` state is set, call `POST /api/history` with the full `results` array. Fire-and-forget (no blocking UI).

## Pages

### `/history` — Session List

- "← 메인으로" back button
- List of session cards in reverse-chronological order
- Each card shows: 저장시각 (Korean locale), 파일 수, 에러 파일 수 (if any, in red)
- Click card → navigate to `/history/[id]`

### `/history/[id]` — Session Detail

- "← 히스토리 목록" back button  
- Shows the full preview identical to the main page's "추출된 데이터 미리보기" section
- Renders each `ParsedResult` with the same card layout: file name, applicant info, data table, error/warning messages in red
- Read-only (no export button)

## Main Page Change

Add a "히스토리" button in the top-right area of the main page header that navigates to `/history`.

## Component Reuse

Extract the `ParsedResult` rendering logic from `page.tsx` into a shared component `src/components/ParsedResultList.tsx`. Use it in both:
- `page.tsx` (main preview)
- `app/history/[id]/page.tsx` (history detail)

## Error Handling

- If `history.json` does not exist, treat as empty array (create on first save)
- If a session id is not found, return 404
- Parse failures in individual files are included in results as-is (error field populated)
