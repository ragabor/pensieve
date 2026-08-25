import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
} from "@earendil-works/pi-coding-agent";

import pensieve from "../index.ts";
import { draftCount, getPensieveState, peekDraft, pushDraft } from "../src/state.ts";

type PensieveEventType =
  | "session_start"
  | "input"
  | "before_agent_start"
  | "session_before_compact"
  | "model_select"
  | "session_shutdown"
  | "session_before_switch"
  | "session_before_fork";
type PensieveEvent = Extract<ExtensionEvent, { type: PensieveEventType }>;
type EventFor<T extends PensieveEventType> = Extract<PensieveEvent, { type: T }>;
type EventHandler<T extends PensieveEventType> = (
  event: EventFor<T>,
  ctx: ExtensionContext,
) => unknown;
type ShortcutHandler = (ctx: ExtensionContext) => Promise<void> | void;

class FakePi {
  readonly eventHandlers = new Map<PensieveEventType, unknown[]>();
  readonly shortcuts = new Map<string, ShortcutHandler>();
  commandRegistrations = 0;

  on<T extends PensieveEventType>(event: T, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  registerShortcut(shortcut: string, options: { handler: ShortcutHandler }): void {
    this.shortcuts.set(shortcut, options.handler);
  }

  registerCommand(): void {
    this.commandRegistrations += 1;
  }

  async emit<T extends PensieveEventType>(
    event: EventFor<T>,
    ctx: ExtensionContext,
  ): Promise<void> {
    for (const registered of this.eventHandlers.get(event.type) ?? []) {
      const handler = registered as EventHandler<T>;
      await handler(event, ctx);
    }
  }

  async press(shortcut: string, ctx: ExtensionContext): Promise<void> {
    const handler = this.shortcuts.get(shortcut);
    if (handler === undefined) {
      throw new Error(`Shortcut not registered: ${shortcut}`);
    }
    await handler(ctx);
  }
}

interface TestContext {
  readonly ctx: ExtensionContext;
  editorText: string;
  failNextEditorSet: boolean;
  readonly statuses: Array<{ key: string; text: string | undefined }>;
  notificationCount: number;
}

function createContext(initialText = "", mode: ExtensionContext["mode"] = "tui"): TestContext {
  let editorText = initialText;
  let failNextEditorSet = false;
  let notificationCount = 0;
  const statuses: Array<{ key: string; text: string | undefined }> = [];

  const result: TestContext = {
    ctx: {
      mode,
      ui: {
        getEditorText: () => editorText,
        setEditorText: (text: string) => {
          if (failNextEditorSet) {
            failNextEditorSet = false;
            throw new Error("editor unavailable");
          }
          editorText = text;
        },
        setStatus: (key: string, text: string | undefined) => {
          statuses.push({ key, text });
        },
        notify: () => {
          notificationCount += 1;
        },
      },
    } as unknown as ExtensionContext,
    get editorText() {
      return editorText;
    },
    set editorText(text: string) {
      editorText = text;
    },
    get failNextEditorSet() {
      return failNextEditorSet;
    },
    set failNextEditorSet(value: boolean) {
      failNextEditorSet = value;
    },
    statuses,
    get notificationCount() {
      return notificationCount;
    },
    set notificationCount(value: number) {
      notificationCount = value;
    },
  };

  return result;
}

function install(pi: FakePi): void {
  pensieve(pi as unknown as ExtensionAPI);
}

function latestStatus(context: TestContext): string | undefined {
  return context.statuses.at(-1)?.text;
}

function inputEvent(
  source: EventFor<"input">["source"] = "interactive",
  streamingBehavior?: EventFor<"input">["streamingBehavior"],
): EventFor<"input"> {
  const base = { type: "input" as const, text: "submitted", source };
  return streamingBehavior === undefined ? base : { ...base, streamingBehavior };
}

function beforeAgentStartEvent(): EventFor<"before_agent_start"> {
  return {
    type: "before_agent_start",
    prompt: "submitted",
    systemPrompt: "system",
    systemPromptOptions: {} as EventFor<"before_agent_start">["systemPromptOptions"],
  };
}

function compactEvent(
  reason: EventFor<"session_before_compact">["reason"],
): EventFor<"session_before_compact"> {
  return {
    type: "session_before_compact",
    preparation: {} as EventFor<"session_before_compact">["preparation"],
    branchEntries: [],
    reason,
    willRetry: false,
    signal: new AbortController().signal,
  };
}

function modelSelectEvent(source: EventFor<"model_select">["source"]): EventFor<"model_select"> {
  return {
    type: "model_select",
    model: {} as EventFor<"model_select">["model"],
    previousModel: undefined,
    source,
  };
}

async function expectFailure(action: Promise<void>, message: string): Promise<void> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toBe(message);
    }
    return;
  }

  throw new Error("Expected action to fail");
}

let agentDir: string;

beforeEach(() => {
  getPensieveState().drafts.length = 0;
  agentDir = mkdtempSync(join(tmpdir(), "pensieve-test-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
});

afterEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  rmSync(agentDir, { recursive: true, force: true });
});

describe("registration", () => {
  test("registers the default shortcut and lifecycle handlers", () => {
    const pi = new FakePi();
    install(pi);

    expect([...pi.shortcuts.keys()]).toEqual(["ctrl+s"]);
    expect([...pi.eventHandlers.keys()]).toEqual([
      "session_start",
      "input",
      "before_agent_start",
      "session_before_compact",
      "model_select",
      "session_shutdown",
    ]);
  });

  test("registers configured shortcuts", () => {
    writeFileSync(
      join(agentDir, "keybindings.json"),
      JSON.stringify({ "pensieve.shortcut": ["alt+s", "ctrl+shift+s"] }),
    );
    const pi = new FakePi();

    install(pi);

    expect([...pi.shortcuts.keys()]).toEqual(["alt+s", "ctrl+shift+s"]);
  });

  test("does not register twice on the same Pi runtime", () => {
    const pi = new FakePi();

    install(pi);
    install(pi);

    expect(pi.shortcuts.size).toBe(1);
    expect(pi.eventHandlers.get("input")).toHaveLength(1);
  });

  test("registers on a replacement runtime while retaining process state", async () => {
    const firstPi = new FakePi();
    const firstContext = createContext("draft");
    install(firstPi);
    await firstPi.press("ctrl+s", firstContext.ctx);

    const reloadedPi = new FakePi();
    const reloadedContext = createContext();
    install(reloadedPi);
    await reloadedPi.emit({ type: "session_start", reason: "reload" }, reloadedContext.ctx);

    expect(reloadedPi.shortcuts.size).toBe(1);
    expect(latestStatus(reloadedContext)).toBe("stashed: draft");
    await reloadedPi.press("ctrl+s", reloadedContext.ctx);
    expect(reloadedContext.editorText).toBe("draft");
  });
});

describe("shortcut behavior", () => {
  test("clears the editor, preserves exact text, and updates status", async () => {
    const pi = new FakePi();
    const context = createContext("  exact\ntext  ");
    install(pi);

    await pi.press("ctrl+s", context.ctx);

    expect(context.editorText).toBe("");
    expect(peekDraft(getPensieveState())).toBe("  exact\ntext  ");
    expect(latestStatus(context)).toBe("stashed: exact");
  });

  test("restores the newest draft when the editor is whitespace-only", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "first");
    pushDraft(getPensieveState(), "newest");
    context.editorText = " \n\t";

    await pi.press("ctrl+s", context.ctx);

    expect(context.editorText).toBe("newest");
    expect(peekDraft(getPensieveState())).toBe("first");
    expect(latestStatus(context)).toBe("stashed: first");
  });

  test("keeps the draft when restoration fails", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "draft");
    context.failNextEditorSet = true;

    await expectFailure(pi.press("ctrl+s", context.ctx), "editor unavailable");

    expect(peekDraft(getPensieveState())).toBe("draft");
  });

  test("does not push when clearing the editor fails", async () => {
    const pi = new FakePi();
    const context = createContext("draft");
    install(pi);
    context.failNextEditorSet = true;

    await expectFailure(pi.press("ctrl+s", context.ctx), "editor unavailable");

    expect(context.editorText).toBe("draft");
    expect(draftCount(getPensieveState())).toBe(0);
  });

  test("does nothing outside TUI mode", async () => {
    const pi = new FakePi();
    const context = createContext("draft", "rpc");
    install(pi);

    await pi.press("ctrl+s", context.ctx);

    expect(context.editorText).toBe("draft");
    expect(draftCount(getPensieveState())).toBe(0);
    expect(context.statuses).toBeEmpty();
  });
});

describe("automatic restoration", () => {
  test.each([undefined, "steer", "followUp"] as const)(
    "restores after interactive input with behavior %s",
    async (streamingBehavior) => {
      const pi = new FakePi();
      const context = createContext();
      install(pi);
      pushDraft(getPensieveState(), "draft");
      await pi.emit(inputEvent("interactive", streamingBehavior), context.ctx);

      expect(context.editorText).toBe("draft");
      expect(draftCount(getPensieveState())).toBe(0);
    },
  );

  test("ignores RPC and extension-originated input", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "draft");

    await pi.emit(inputEvent("rpc"), context.ctx);
    await pi.emit(inputEvent("extension"), context.ctx);

    expect(context.editorText).toBe("");
    expect(peekDraft(getPensieveState())).toBe("draft");
  });

  test("unwinds nested drafts in LIFO order", async () => {
    const pi = new FakePi();
    const context = createContext("outer");
    install(pi);
    await pi.press("ctrl+s", context.ctx);
    context.editorText = "inner";
    await pi.press("ctrl+s", context.ctx);

    await pi.emit(inputEvent(), context.ctx);
    expect(context.editorText).toBe("inner");
    expect(peekDraft(getPensieveState())).toBe("outer");

    context.editorText = "";
    await pi.emit(inputEvent(), context.ctx);
    expect(context.editorText).toBe("outer");
    expect(draftCount(getPensieveState())).toBe(0);
  });

  test("does not double-pop in the before-agent fallback", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "outer");
    pushDraft(getPensieveState(), "inner");

    await pi.emit(inputEvent(), context.ctx);
    await pi.emit(beforeAgentStartEvent(), context.ctx);

    expect(context.editorText).toBe("inner");
    expect(peekDraft(getPensieveState())).toBe("outer");
  });

  test("never overwrites a nonempty editor", async () => {
    const pi = new FakePi();
    const context = createContext("current work");
    install(pi);
    pushDraft(getPensieveState(), "draft");

    await pi.emit(inputEvent(), context.ctx);

    expect(context.editorText).toBe("current work");
    expect(peekDraft(getPensieveState())).toBe("draft");
  });
});

describe("command and session lifecycle", () => {
  test("restores for manual compaction but not automatic compaction", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "draft");

    await pi.emit(compactEvent("threshold"), context.ctx);
    expect(context.editorText).toBe("");
    await pi.emit(compactEvent("manual"), context.ctx);

    expect(context.editorText).toBe("draft");
  });

  test("restores for a first user model selection but not startup restoration", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "draft");

    await pi.emit(modelSelectEvent("restore"), context.ctx);
    expect(context.editorText).toBe("");
    await pi.emit(modelSelectEvent("set"), context.ctx);

    expect(context.editorText).toBe("draft");
  });

  test("restores before reload but not session replacement or exit", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "draft");

    for (const reason of ["new", "resume", "fork", "quit"] as const) {
      await pi.emit({ type: "session_shutdown", reason }, context.ctx);
    }
    expect(context.editorText).toBe("");
    await pi.emit({ type: "session_shutdown", reason: "reload" }, context.ctx);

    expect(context.editorText).toBe("draft");
  });

  test("session navigation leaves the stack pending", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "draft");

    await pi.emit({ type: "session_before_switch", reason: "new" }, context.ctx);
    await pi.emit({ type: "session_before_fork", entryId: "entry", position: "at" }, context.ctx);

    expect(context.editorText).toBe("");
    expect(peekDraft(getPensieveState())).toBe("draft");
  });

  test("session start refreshes status without popping", async () => {
    const pi = new FakePi();
    const context = createContext();
    install(pi);
    pushDraft(getPensieveState(), "draft");

    await pi.emit({ type: "session_start", reason: "resume" }, context.ctx);

    expect(latestStatus(context)).toBe("stashed: draft");
    expect(peekDraft(getPensieveState())).toBe("draft");
  });

  test("does not register commands or emit notifications", async () => {
    const pi = new FakePi();
    const context = createContext("draft");
    install(pi);

    await pi.press("ctrl+s", context.ctx);

    expect(pi.commandRegistrations).toBe(0);
    expect(context.notificationCount).toBe(0);
  });
});
