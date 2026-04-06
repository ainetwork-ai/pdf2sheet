import { describe, it, expect } from "vitest";
import { textToGrid, findNeighbors } from "@/lib/text-grid";

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
