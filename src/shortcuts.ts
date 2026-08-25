import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_SHORTCUT = "ctrl+s";
const MODIFIERS = new Set(["alt", "ctrl", "shift", "super"]);
const SPECIAL_KEYS: Readonly<Record<string, string>> = {
  backspace: "backspace",
  clear: "clear",
  delete: "delete",
  down: "down",
  end: "end",
  enter: "enter",
  esc: "esc",
  escape: "escape",
  home: "home",
  insert: "insert",
  left: "left",
  pagedown: "pageDown",
  pageup: "pageUp",
  return: "return",
  right: "right",
  space: "space",
  tab: "tab",
  up: "up",
};
const SYMBOL_KEYS = "`-=[]\\;',./!@#$%^&*()_|~{}:<>?";

interface ShortcutConfigOptions {
  readonly agentDir?: string;
  readonly readText?: (path: string) => string;
}

function normalizeKey(value: string): string | undefined {
  if (/^[a-z0-9]$/u.test(value) || /^f(?:[1-9]|1[0-2])$/u.test(value)) {
    return value;
  }

  const specialKey = SPECIAL_KEYS[value];
  if (specialKey !== undefined) {
    return specialKey;
  }

  return Array.from(value).length === 1 && SYMBOL_KEYS.includes(value) ? value : undefined;
}

function normalizeShortcut(value: string): string | undefined {
  const parts = value.trim().split("+");
  const rawKey = parts.pop();
  const modifiers = parts.map((part) => part.toLowerCase());
  const key = rawKey === undefined ? undefined : normalizeKey(rawKey.toLowerCase());

  if (
    key === undefined ||
    new Set(modifiers).size !== modifiers.length ||
    !modifiers.every((modifier) => MODIFIERS.has(modifier))
  ) {
    return undefined;
  }

  return [...modifiers, key].join("+");
}

function isShortcut(value: string): boolean {
  return normalizeShortcut(value) !== undefined;
}

function configuredAgentDir(): string {
  const override = process.env.PI_CODING_AGENT_DIR?.trim();
  return override || join(homedir(), ".pi", "agent");
}

function normalizeShortcuts(value: unknown): string[] {
  const candidates = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const shortcuts = candidates
    .filter((candidate): candidate is string => typeof candidate === "string")
    .map(normalizeShortcut)
    .filter((shortcut): shortcut is string => shortcut !== undefined);

  return [...new Set(shortcuts)];
}

function loadShortcuts(options: ShortcutConfigOptions = {}): string[] {
  const agentDir = options.agentDir ?? configuredAgentDir();
  const readText = options.readText ?? ((path: string) => readFileSync(path, "utf8"));

  try {
    const config: unknown = JSON.parse(readText(join(agentDir, "keybindings.json")));
    if (typeof config !== "object" || config === null) {
      return [DEFAULT_SHORTCUT];
    }

    const shortcuts = normalizeShortcuts((config as Record<string, unknown>)["pensieve.shortcut"]);
    return shortcuts.length > 0 ? shortcuts : [DEFAULT_SHORTCUT];
  } catch {
    return [DEFAULT_SHORTCUT];
  }
}

export { isShortcut, loadShortcuts };
export type { ShortcutConfigOptions };
