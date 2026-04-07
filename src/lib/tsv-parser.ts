export interface TsvWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  flow: number;
}

export interface DetectedTable {
  headers: string[];
  rows: Record<string, string>[];
  headerY: number;
}

export interface DetectedField {
  label: string;
  value: string;
  y: number;
}

export interface TsvParseResult {
  table: DetectedTable | null;
  fields: DetectedField[];
  allRows: { y: number; words: TsvWord[] }[];
}

export function parseTsv(tsvOutput: string): TsvParseResult {
  const words = parseWords(tsvOutput);
  const allRows = clusterByY(words);

  const tableHeaderIndex = detectTableHeaderIndex(allRows);

  let table: DetectedTable | null = null;
  let fields: DetectedField[] = [];

  if (tableHeaderIndex !== -1) {
    const headerRow = allRows[tableHeaderIndex];
    const columns = computeColumns(headerRow.words);
    const dataRows = allRows.slice(tableHeaderIndex + 1);
    const rows = extractDataRows(dataRows, columns);

    table = {
      headers: columns.map((c) => c.name),
      rows,
      headerY: headerRow.y,
    };

    const fieldRows = allRows.slice(0, tableHeaderIndex);
    fields = detectFields(fieldRows);
  } else {
    fields = detectFields(allRows);
  }

  return { table, fields, allRows };
}

function parseWords(tsvOutput: string): TsvWord[] {
  const lines = tsvOutput.split("\n");
  const words: TsvWord[] = [];

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 12) continue;

    const level = parseInt(parts[0], 10);
    if (level !== 5) continue;

    const text = parts[11]?.trim();
    if (!text) continue;

    words.push({
      text,
      x: parseFloat(parts[6]),
      y: parseFloat(parts[7]),
      width: parseFloat(parts[8]),
      height: parseFloat(parts[9]),
      page: parseInt(parts[1], 10),
      flow: parseInt(parts[3], 10),
    });
  }

  return words;
}

function clusterByY(words: TsvWord[]): { y: number; words: TsvWord[] }[] {
  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const clusters: { y: number; words: TsvWord[] }[] = [];

  for (const word of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(word.y - last.y) <= 5) {
      last.words.push(word);
    } else {
      clusters.push({ y: word.y, words: [word] });
    }
  }

  // Sort words within each row by x
  for (const cluster of clusters) {
    cluster.words.sort((a, b) => a.x - b.x);
  }

  return clusters;
}

interface Column {
  name: string;
  centerX: number;
  boundary: number; // left boundary for this column (midpoint with previous)
}

function computeColumns(headerWords: TsvWord[]): Column[] {
  // Group adjacent words in the header row into column name groups
  const groups: TsvWord[][] = [];
  let current: TsvWord[] = [];

  for (let i = 0; i < headerWords.length; i++) {
    if (current.length === 0) {
      current.push(headerWords[i]);
    } else {
      const prev = current[current.length - 1];
      const gap = headerWords[i].x - (prev.x + prev.width);
      if (gap < 30) {
        current.push(headerWords[i]);
      } else {
        groups.push(current);
        current = [headerWords[i]];
      }
    }
  }
  if (current.length > 0) groups.push(current);

  const columns: Column[] = groups.map((group) => {
    const name = group.map((w) => w.text).join(" ");
    const leftX = group[0].x;
    const rightX = group[group.length - 1].x + group[group.length - 1].width;
    const centerX = (leftX + rightX) / 2;
    return { name, centerX, boundary: 0 };
  });

  // Compute left boundaries as midpoints between consecutive column centers
  for (let i = 0; i < columns.length; i++) {
    if (i === 0) {
      columns[i].boundary = 0;
    } else {
      columns[i].boundary = (columns[i - 1].centerX + columns[i].centerX) / 2;
    }
  }

  return columns;
}

function assignWordToColumn(word: TsvWord, columns: Column[]): string {
  const cx = word.x + word.width / 2;
  let assigned = columns[0];
  for (let i = 1; i < columns.length; i++) {
    if (cx >= columns[i].boundary) {
      assigned = columns[i];
    }
  }
  return assigned.name;
}

function extractDataRows(
  rows: { y: number; words: TsvWord[] }[],
  columns: Column[]
): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    for (const col of columns) {
      record[col.name] = "";
    }
    for (const word of row.words) {
      const colName = assignWordToColumn(word, columns);
      record[colName] = record[colName]
        ? record[colName] + " " + word.text
        : word.text;
    }
    return record;
  });
}

function hasColumnDistribution(words: TsvWord[]): boolean {
  if (words.length < 3) return false;

  // Check if words form 3+ distinct x-position clusters (gap > 40pt)
  const sorted = [...words].sort((a, b) => a.x - b.x);
  let clusterCount = 1;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
    if (gap > 40) clusterCount++;
  }
  return clusterCount >= 3;
}

function detectTableHeaderIndex(
  rows: { y: number; words: TsvWord[] }[]
): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Table appears in the lower half — skip rows too high up
    if (row.y < 300) continue;
    if (hasColumnDistribution(row.words)) {
      return i;
    }
  }
  return -1;
}

function detectFields(
  rows: { y: number; words: TsvWord[] }[]
): DetectedField[] {
  const fields: DetectedField[] = [];

  for (const row of rows) {
    const words = row.words;
    for (let i = 0; i < words.length - 1; i++) {
      const label = words[i];
      const value = words[i + 1];
      // Label: short word (<= 4 chars), value: within 100pt to the right
      if (
        label.text.length <= 4 &&
        value.x - (label.x + label.width) <= 100
      ) {
        fields.push({
          label: label.text,
          value: value.text,
          y: row.y,
        });
        i++; // skip the value word
      }
    }
  }

  return fields;
}
