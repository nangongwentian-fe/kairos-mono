export function createUnifiedDiff(
  filePath: string,
  before: string,
  after: string,
): string {
  const beforeLines = splitDiffLines(before);
  const afterLines = splitDiffLines(after);
  let prefixLength = 0;
  while (
    prefixLength < beforeLines.length &&
    prefixLength < afterLines.length &&
    beforeLines[prefixLength] === afterLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < beforeLines.length - prefixLength &&
    suffixLength < afterLines.length - prefixLength &&
    beforeLines[beforeLines.length - suffixLength - 1] ===
      afterLines[afterLines.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const context = 3;
  const beforeChangeEnd = beforeLines.length - suffixLength;
  const afterChangeEnd = afterLines.length - suffixLength;
  const hunkStart = Math.max(0, prefixLength - context);
  const beforeHunkEnd = Math.min(beforeLines.length, beforeChangeEnd + context);
  const afterHunkEnd = Math.min(afterLines.length, afterChangeEnd + context);
  const oldStartLine = hunkStart + 1;
  const newStartLine = hunkStart + 1;
  const oldLineCount = beforeHunkEnd - hunkStart;
  const newLineCount = afterHunkEnd - hunkStart;
  const lines = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${oldStartLine},${oldLineCount} +${newStartLine},${newLineCount} @@`,
  ];

  for (const line of beforeLines.slice(hunkStart, prefixLength)) {
    lines.push(` ${line}`);
  }
  for (const line of beforeLines.slice(prefixLength, beforeChangeEnd)) {
    lines.push(`-${line}`);
  }
  for (const line of afterLines.slice(prefixLength, afterChangeEnd)) {
    lines.push(`+${line}`);
  }
  for (const line of beforeLines.slice(beforeChangeEnd, beforeHunkEnd)) {
    lines.push(` ${line}`);
  }

  return lines.join("\n");
}

function splitDiffLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}
