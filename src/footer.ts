const DEFAULT_PREVIEW_LENGTH = 48;

function previewLine(text: string): string {
  const line = text.split(/\r?\n/u).find((candidate) => candidate.trim().length > 0) ?? "";
  return line.trim().replace(/\s+/gu, " ");
}

function truncate(text: string, maxLength: number): string {
  const characters = Array.from(text);
  if (characters.length <= maxLength) {
    return text;
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

  const preview = truncate(previewLine(newest), maxPreviewLength);
  const olderCount = drafts.length - 1;
  return `stashed: ${preview}${olderCount > 0 ? ` (+${olderCount})` : ""}`;
}
