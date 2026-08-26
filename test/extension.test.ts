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
import { getPensieveState } from "../src/state.ts";

type PensieveEventType =
  | "session_start"
  | "input"
  | "before_agent_start"
  | "session_before_compact"
  | "model_select"
  | "session_shutdown";
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

  on<T extends PensieveEventType>(event: T, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  registerShortcut(shortcut: string, options: { handler: ShortcutHandler }): void {
    this.shortcuts.set(shortcut, options.handler);
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
  readonly statuses: Array<{ key: string; text: string | undefined }>;
}

function createContext(initialText = ""): TestContext {
  let editorText = initialText;
  const statuses: Array<{ key: string; text: string | undefined }> = [];

  return {
    ctx: {
      mode: "tui",
      ui: {
        getEditorText: () => editorText,
        setEditorText: (text: string) => {
          editorText = text;
        },
        setStatus: (key: string, text: string | undefined) => {
          statuses.push({ key, text });
        },
        notify: () => {},
      },
    } as unknown as ExtensionContext,
    get editorText() {
      return editorText;
    },
    set editorText(text: string) {
      editorText = text;
    },
    statuses,
  };
}

function install(pi: FakePi): void {
  pensieve(pi as unknown as ExtensionAPI);
}

function latestStatus(context: TestContext): string | undefined {
  return context.statuses.at(-1)?.text;
}

function inputEvent(
  source: EventFor<"input">["source"],
  streamingBehavior?: EventFor<"input">["streamingBehavior"],
): EventFor<"input"> {
  const event = { type: "input" as const, text: "submitted", source };
  return streamingBehavior === undefined ? event : { ...event, streamingBehavior };
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

  test("creates a replacement policy while retaining process state", async () => {
    const firstPi = new FakePi();
    const firstContext = createContext("draft");
    install(firstPi);
    await firstPi.press("ctrl+s", firstContext.ctx);

    const replacementPi = new FakePi();
    const replacementContext = createContext();
    install(replacementPi);
    await replacementPi.emit({ type: "session_start", reason: "reload" }, replacementContext.ctx);

    expect(latestStatus(replacementContext)).toBe("stashed: draft");
    await replacementPi.press("ctrl+s", replacementContext.ctx);
    expect(replacementContext.editorText).toBe("draft");
  });
});

describe("Pi event translation", () => {
  test("translates every input source and streaming behavior", async () => {
    for (const source of ["interactive", "rpc", "extension"] as const) {
      for (const streamingBehavior of [undefined, "steer", "followUp"] as const) {
        getPensieveState().drafts.length = 0;
        const pi = new FakePi();
        const context = createContext("draft");
        install(pi);
        await pi.press("ctrl+s", context.ctx);

        await pi.emit(inputEvent(source, streamingBehavior), context.ctx);

        expect(context.editorText).toBe(source === "interactive" ? "draft" : "");
      }
    }
  });

  test("translates agent start into an eligible Restoration trigger", async () => {
    const pi = new FakePi();
    const context = createContext("draft");
    install(pi);
    await pi.press("ctrl+s", context.ctx);

    await pi.emit(beforeAgentStartEvent(), context.ctx);

    expect(context.editorText).toBe("draft");
  });

  test("translates every compaction reason", async () => {
    for (const reason of ["manual", "threshold", "overflow"] as const) {
      getPensieveState().drafts.length = 0;
      const pi = new FakePi();
      const context = createContext("draft");
      install(pi);
      await pi.press("ctrl+s", context.ctx);

      await pi.emit(compactEvent(reason), context.ctx);

      expect(context.editorText).toBe(reason === "manual" ? "draft" : "");
    }
  });

  test("translates every model-selection source", async () => {
    for (const source of ["set", "cycle", "restore"] as const) {
      getPensieveState().drafts.length = 0;
      const pi = new FakePi();
      const context = createContext("draft");
      install(pi);
      await pi.press("ctrl+s", context.ctx);

      await pi.emit(modelSelectEvent(source), context.ctx);

      expect(context.editorText).toBe(source === "restore" ? "" : "draft");
    }
  });

  test("translates every shutdown reason", async () => {
    for (const reason of ["quit", "reload", "new", "resume", "fork"] as const) {
      getPensieveState().drafts.length = 0;
      const pi = new FakePi();
      const context = createContext("draft");
      install(pi);
      await pi.press("ctrl+s", context.ctx);

      await pi.emit({ type: "session_shutdown", reason }, context.ctx);

      expect(context.editorText).toBe(reason === "reload" ? "draft" : "");
    }
  });
});
