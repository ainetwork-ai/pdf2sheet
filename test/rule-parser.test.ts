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
        pattern: "\\d{4}\\.",
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
