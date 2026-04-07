import { describe, it, expect } from "vitest";
import { parseTsv } from "@/lib/tsv-parser";

const HEADER = "level\tpage_num\tpar_num\tblock_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

const SAMPLE_TSV = [
  HEADER,
  "1\t1\t0\t0\t0\t0\t0.00\t0.00\t595.00\t842.00\t-1\t###PAGE###",
  // Field row: 성명 전보배 (y ~328)
  "5\t1\t0\t0\t0\t0\t77.67\t328.42\t15.67\t23.57\t100\t성명",
  "5\t1\t0\t0\t0\t1\t160.53\t328.96\t21.93\t22.00\t100\t전보배",
  // Header row (y ~397) — 4 words with large gaps → column-like
  "5\t1\t1\t0\t0\t0\t25.12\t397.91\t15.67\t23.57\t100\t번호",
  "5\t1\t1\t0\t0\t1\t152.77\t397.91\t31.33\t23.57\t100\t근무기간",
  "5\t1\t1\t0\t0\t2\t375.80\t397.91\t31.34\t23.57\t100\t근무내용",
  "5\t1\t1\t0\t0\t3\t519.75\t399.05\t40.16\t22.00\t100\t근무시간",
  // Data row 1 (y ~430)
  "5\t1\t2\t0\t0\t0\t31.05\t430.48\t3.80\t22.00\t100\t1",
  "5\t1\t2\t0\t0\t1\t152.77\t430.48\t90.52\t18.85\t100\t2026.01.20(19:54)~2026.01.20(20:56)",
  "5\t1\t2\t0\t0\t2\t375.80\t430.48\t55.00\t22.00\t100\tperf작업",
  "5\t1\t2\t0\t0\t3\t519.75\t430.48\t16.27\t22.00\t100\t2:10",
].join("\n");

describe("parseTsv", () => {
  it("detects table with headers and data rows", () => {
    const result = parseTsv(SAMPLE_TSV);

    expect(result.table).not.toBeNull();
    expect(result.table!.headers).toContain("번호");
    expect(result.table!.headers).toContain("근무기간");
    expect(result.table!.headers).toContain("근무내용");
    expect(result.table!.headers).toContain("근무시간");
    expect(result.table!.rows).toHaveLength(1);
    expect(result.table!.rows[0]["근무내용"]).toBe("perf작업");
    expect(result.table!.rows[0]["근무시간"]).toBe("2:10");
  });

  it("returns null table and empty fields for empty input", () => {
    const result = parseTsv("");
    expect(result.table).toBeNull();
    expect(result.fields).toEqual([]);
    expect(result.allRows).toEqual([]);
  });

  it("returns null table and empty fields for header-only input", () => {
    const result = parseTsv(HEADER);
    expect(result.table).toBeNull();
    expect(result.fields).toEqual([]);
  });

  it("clusters words by y-coordinate (within 5pt tolerance)", () => {
    const tsv = [
      HEADER,
      // Two words at y=100.0 and y=103.0 → same row (diff = 3 ≤ 5)
      "5\t1\t0\t0\t0\t0\t10.00\t100.00\t20.00\t15.00\t100\tword1",
      "5\t1\t0\t0\t0\t1\t80.00\t103.00\t20.00\t15.00\t100\tword2",
      // Word at y=200.0 → different row
      "5\t1\t0\t0\t0\t2\t10.00\t200.00\t20.00\t15.00\t100\tword3",
    ].join("\n");

    const result = parseTsv(tsv);
    expect(result.allRows).toHaveLength(2);
    expect(result.allRows[0].words).toHaveLength(2);
    expect(result.allRows[0].words[0].text).toBe("word1");
    expect(result.allRows[0].words[1].text).toBe("word2");
    expect(result.allRows[1].words[0].text).toBe("word3");
  });

  it("detects label-value fields above the table header", () => {
    const result = parseTsv(SAMPLE_TSV);
    expect(result.fields.length).toBeGreaterThan(0);
    const nameField = result.fields.find((f) => f.label === "성명");
    expect(nameField).toBeDefined();
    expect(nameField!.value).toBe("전보배");
  });

  it("computes correct column boundaries so data cells are assigned to the right column", () => {
    // 번호 center ~33, 근무기간 center ~168, 근무내용 center ~391, 근무시간 center ~540
    // Data: 1→33, date→198, perf작업→403, 2:10→528
    const result = parseTsv(SAMPLE_TSV);
    const row = result.table!.rows[0];
    expect(row["번호"]).toBe("1");
    expect(row["근무기간"]).toBe("2026.01.20(19:54)~2026.01.20(20:56)");
    expect(row["근무내용"]).toBe("perf작업");
    expect(row["근무시간"]).toBe("2:10");
  });

  it("ignores non-level-5 lines", () => {
    const tsv = [
      HEADER,
      // Level 1 (page)
      "1\t1\t0\t0\t0\t0\t0.00\t0.00\t595.00\t842.00\t-1\t###PAGE###",
      // Level 4 (line) — should be ignored
      "4\t1\t0\t0\t1\t0\t10.00\t100.00\t200.00\t15.00\t96\tshouldIgnore",
      // Level 5 — should be included
      "5\t1\t0\t0\t0\t0\t10.00\t100.00\t50.00\t15.00\t100\tincluded",
    ].join("\n");

    const result = parseTsv(tsv);
    const allWords = result.allRows.flatMap((r) => r.words);
    expect(allWords.some((w) => w.text === "shouldIgnore")).toBe(false);
    expect(allWords.some((w) => w.text === "included")).toBe(true);
  });

  it("returns allRows with all word rows for UI display", () => {
    const result = parseTsv(SAMPLE_TSV);
    // Should have: field row (y~328), header row (y~397), data row (y~430)
    expect(result.allRows.length).toBe(3);
  });
});
