import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_SHORTCUT = "ctrl+s";
const MODIFIERS = new Set(["alt", "ctrl", "shift", "super"]);
const NAMED_KEYS = new Set([
  "backspace",
  "clear",
  "delete",
  "down",
  "end",
  "enter",
  "esc",
  "escape",
  "home",
  "insert",
  "left",
  "pagedown",
  "pageup",
  "return",
  "right",
  "space",
  "tab",
  "up",
]);
const SYMBOL_KEYS = new Set([
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "|",
  "~",
  "{",
  "}",
  ":",
  "<",
  ">",
  "?",
]);

export interface ShortcutConfigOptions {
  readonly agentDir?: string;
  readonly readText?: (path: string) => string;
}

function isKey(value: string): boolean {
  return (
    /^[a-z0-9]$/.test(value) ||
    /^f(?:[1-9]|1[0-2])$/.test(value) ||
    NAMED_KEYS.has(value) ||
    SYMBOL_KEYS.has(value)
  );
}

export function isShortcut(value: string): boolean {
  const parts = value.split("+");
  const key = parts.pop();
  if (key === undefined || !isKey(key)) {
    return false;
  }

  return new Set(parts).size === parts.length && parts.every((part) => MODIFIERS.has(part));
}

function configuredAgentDir(): string {
  const override = process.env.PI_CODING_AGENT_DIR?.trim();
  return override || join(homedir(), ".pi", "agent");
}

function normalizeShortcuts(value: unknown): string[] {
  const candidates = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const shortcuts = candidates
    .filter((candidate): candidate is string => typeof candidate === "string")
    .map((candidate) => candidate.trim().toLowerCase())
    .filter(isShortcut);

  return [...new Set(shortcuts)];
}

export function loadShortcuts(options: ShortcutConfigOptions = {}): string[] {
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
