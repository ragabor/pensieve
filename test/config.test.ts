import { describe, expect, test } from "bun:test";

import { isShortcut, loadShortcuts } from "../src/config.js";

describe("shortcut validation", () => {
  test.each(["ctrl+s", "SHIFT+CTRL+P", "alt+enter", "f12", "ctrl++"])("accepts %s", (shortcut) => {
    expect(isShortcut(shortcut.toLowerCase())).toBeTrue();
  });

  test.each(["", "ctrl+", "ctrl+ctrl+s", "hyper+s", "f13", "ctrl+not-a-key"])(
    "rejects %s",
    (shortcut) => {
      expect(isShortcut(shortcut)).toBeFalse();
    },
  );
});

describe("shortcut configuration", () => {
  test("defaults when the file cannot be read", () => {
    expect(
      loadShortcuts({
        agentDir: "/agent",
        readText: () => {
          throw new Error("missing");
        },
      }),
    ).toEqual(["ctrl+s"]);
  });

  test("reads a configured shortcut from Pi's agent directory", () => {
    let requestedPath = "";

    const shortcuts = loadShortcuts({
      agentDir: "/custom/agent",
      readText: (path) => {
        requestedPath = path;
        return JSON.stringify({ "pensieve.shortcut": " Alt+S " });
      },
    });

    expect(requestedPath).toBe("/custom/agent/keybindings.json");
    expect(shortcuts).toEqual(["alt+s"]);
  });

  test("normalizes, filters, and deduplicates an array", () => {
    const shortcuts = loadShortcuts({
      readText: () =>
        JSON.stringify({
          "pensieve.shortcut": ["CTRL+S", " ctrl+s ", "alt+s", "hyper+s", 42],
        }),
    });

    expect(shortcuts).toEqual(["ctrl+s", "alt+s"]);
  });

  test.each([
    "not json",
    "null",
    JSON.stringify([]),
    JSON.stringify({ "pensieve.shortcut": [] }),
    JSON.stringify({ "pensieve.shortcut": 42 }),
    JSON.stringify({ "pensieve.shortcut": ["hyper+s"] }),
  ])("defaults for malformed configuration: %s", (contents) => {
    expect(loadShortcuts({ readText: () => contents })).toEqual(["ctrl+s"]);
  });
});
