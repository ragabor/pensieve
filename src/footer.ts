const DEFAULT_PREVIEW_LENGTH = 48;

function previewLine(text: string, maxLength: number): string {
  const line = text.split(/\r?\n/u).find((candidate) => candidate.trim().length > 0) ?? "";
  const characters = Array.from(line.trim().replace(/\s+/gu, " "));
  if (characters.length <= maxLength) {
    return characters.join("");
  }

  if (maxLength <= 1) {
    return "…";
  }

  return `${characters.slice(0, maxLength - 1).join("")}…`;
}

export function formatFooter(
  drafts: readonly string[],
  maxPreviewLength = DEFAULT_PREVIEW_LENGTH,
): string | undefined {
  const newest = drafts.at(-1);
  if (newest === undefined) {
    return undefined;
  }

  const preview = previewLine(newest, maxPreviewLength);
  const olderCount = drafts.length - 1;
  return `stashed: ${preview}${olderCount > 0 ? ` (+${olderCount})` : ""}`;
}
