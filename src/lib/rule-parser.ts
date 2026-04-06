import { GridToken, findNeighbors } from "./text-grid";

export interface FieldRule {
  name: string;
  keyword: string;
  direction: "right" | "below";
  pattern?: string;
}

export interface TableColumnRule {
  name: string;
  keyword: string;
  type: "text" | "number" | "date" | "hours";
}

export interface TableRule {
  headerKeywords: string[];
  columns: TableColumnRule[];
  rowPattern?: string;
}

export interface ExtractionConfig {
  fields: FieldRule[];
  table: TableRule;
}

export function applyFieldRules(
  grid: GridToken[],
  rules: FieldRule[]
): { fields: { name: string; value: string }[]; warnings: string[] } {
  const fields: { name: string; value: string }[] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    // Find keyword token in grid (exact match or includes)
    const keywordToken = grid.find(
      (t) => t.text === rule.keyword || t.text.includes(rule.keyword)
    );

    if (!keywordToken) {
      warnings.push(`키워드 "${rule.keyword}"을(를) 찾을 수 없습니다 (필드: ${rule.name})`);
      continue;
    }

    const neighbors = findNeighbors(grid, keywordToken.id);
    const candidates =
      rule.direction === "right" ? neighbors.right : neighbors.below;

    if (candidates.length === 0) {
      warnings.push(
        `키워드 "${rule.keyword}" 근처에 값을 찾을 수 없습니다 (필드: ${rule.name})`
      );
      continue;
    }

    if (rule.pattern) {
      const regex = new RegExp(rule.pattern);
      // Combine candidate texts progressively and find matching combination
      let matched = false;
      for (let i = 0; i < candidates.length; i++) {
        const combinedText = candidates
          .slice(0, i + 1)
          .map((c) => c.text)
          .join(" ");
        if (regex.test(combinedText)) {
          fields.push({ name: rule.name, value: combinedText });
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Try individual candidates
        const singleMatch = candidates.find((c) => regex.test(c.text));
        if (singleMatch) {
          fields.push({ name: rule.name, value: singleMatch.text });
        } else {
          // Fall back to combined text of all candidates if pattern doesn't match
          const allText = candidates.map((c) => c.text).join(" ");
          if (regex.test(allText)) {
            fields.push({ name: rule.name, value: allText });
          } else {
            warnings.push(
              `키워드 "${rule.keyword}" 근처에서 패턴 "${rule.pattern}"에 맞는 값을 찾을 수 없습니다 (필드: ${rule.name})`
            );
          }
        }
      }
    } else {
      // No pattern: take the first candidate
      fields.push({ name: rule.name, value: candidates[0].text });
    }
  }

  return { fields, warnings };
}

export function applyTableRule(
  grid: GridToken[],
  rule: TableRule
): { rows: Record<string, string>[]; warnings: string[] } {
  const warnings: string[] = [];

  // 1. Group tokens by row
  const rowMap = new Map<number, GridToken[]>();
  for (const token of grid) {
    if (!rowMap.has(token.row)) {
      rowMap.set(token.row, []);
    }
    rowMap.get(token.row)!.push(token);
  }

  // Sort tokens within each row by col
  for (const tokens of rowMap.values()) {
    tokens.sort((a, b) => a.col - b.col);
  }

  // 2. Find header row (the row with most headerKeywords matches)
  let bestHeaderRow = -1;
  let bestMatchCount = 0;

  for (const [rowNum, tokens] of rowMap) {
    const rowText = tokens.map((t) => t.text).join(" ");
    let matchCount = 0;
    for (const keyword of rule.headerKeywords) {
      if (tokens.some((t) => t.text === keyword || t.text.includes(keyword)) || rowText.includes(keyword)) {
        matchCount++;
      }
    }
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestHeaderRow = rowNum;
    }
  }

  if (bestHeaderRow === -1 || bestMatchCount === 0) {
    warnings.push("테이블 헤더를 찾을 수 없습니다");
    return { rows: [], warnings };
  }

  // 3. Map each column keyword to its col position in header
  const headerTokens = rowMap.get(bestHeaderRow)!;
  const columnPositions: { name: string; col: number }[] = [];

  for (const colRule of rule.columns) {
    const headerToken = headerTokens.find(
      (t) => t.text === colRule.keyword || t.text.includes(colRule.keyword)
    );
    if (headerToken) {
      columnPositions.push({ name: colRule.name, col: headerToken.col });
    } else {
      // Try matching against joined text of adjacent tokens
      warnings.push(
        `헤더에서 컬럼 "${colRule.keyword}"을(를) 찾을 수 없습니다`
      );
    }
  }

  if (columnPositions.length === 0) {
    warnings.push("매칭되는 컬럼이 없습니다");
    return { rows: [], warnings };
  }

  // Sort column positions by col for assignment
  columnPositions.sort((a, b) => a.col - b.col);

  // 4. Extract data rows after header
  const sortedRows = [...rowMap.keys()].sort((a, b) => a - b);
  const dataRowNums = sortedRows.filter((r) => r > bestHeaderRow);

  const rows: Record<string, string>[] = [];

  for (const rowNum of dataRowNums) {
    const tokens = rowMap.get(rowNum)!;
    const rowText = tokens.map((t) => t.text).join(" ");

    // If rowPattern provided, filter rows matching it
    if (rule.rowPattern) {
      const rowRegex = new RegExp(rule.rowPattern);
      if (!rowRegex.test(rowText)) {
        continue;
      }
    }

    // 5. Assign each token to nearest column by col position
    const record: Record<string, string> = {};
    // Initialize all columns to empty
    for (const cp of columnPositions) {
      record[cp.name] = "";
    }

    for (const token of tokens) {
      // Find the nearest column by col position
      let nearestCol = columnPositions[0];
      let minDist = Math.abs(token.col - nearestCol.col);

      for (let i = 1; i < columnPositions.length; i++) {
        const dist = Math.abs(token.col - columnPositions[i].col);
        if (dist < minDist) {
          minDist = dist;
          nearestCol = columnPositions[i];
        }
      }

      if (record[nearestCol.name]) {
        record[nearestCol.name] += " " + token.text;
      } else {
        record[nearestCol.name] = token.text;
      }
    }

    rows.push(record);
  }

  return { rows, warnings };
}
