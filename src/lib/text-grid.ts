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

export function findNeighbors(
  grid: GridToken[],
  tokenId: string
): { right: GridToken[]; below: GridToken[] } {
  const token = grid.find((t) => t.id === tokenId);
  if (!token) return { right: [], below: [] };
  const right = grid
    .filter((t) => t.row === token.row && t.col > token.col)
    .sort((a, b) => a.col - b.col);
  const below: GridToken[] = [];
  for (let r = token.row + 1; r <= token.row + 3; r++) {
    const rowTokens = grid.filter((t) => t.row === r).sort((a, b) => a.col - b.col);
    if (rowTokens.length > 0) {
      const closest = rowTokens.find((t) => t.col >= token.col - 2) || rowTokens[0];
      below.push(closest);
    }
  }
  return { right: right.slice(0, 5), below: below.slice(0, 3) };
}
