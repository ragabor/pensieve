import { describe, expect, test } from "bun:test";

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
  createDraftRestorationPolicy,
  type DraftRestorationPolicy,
  type RestorationTrigger,
} from "../src/restoration-policy.ts";
import { getPensieveState, type PensieveState } from "../src/state.ts";

interface TestContext {
  readonly ctx: ExtensionContext;
  editorText: string;
  failNextEditorSet: boolean;
  readonly statuses: Array<{ key: string; text: string | undefined }>;
  readonly uiCalls: string[];
}

function createContext(initialText = "", mode: ExtensionContext["mode"] = "tui"): TestContext {
  let editorText = initialText;
  let failNextEditorSet = false;
  const statuses: Array<{ key: string; text: string | undefined }> = [];
  const uiCalls: string[] = [];

  return {
    ctx: {
      mode,
      ui: {
        getEditorText: () => {
          uiCalls.push("getEditorText");
          return editorText;
        },
        setEditorText: (text: string) => {
          uiCalls.push("setEditorText");
          if (failNextEditorSet) {
            failNextEditorSet = false;
            throw new Error("editor unavailable");
          }
          editorText = text;
        },
        setStatus: (key: string, text: string | undefined) => {
          uiCalls.push("setStatus");
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
    get failNextEditorSet() {
      return failNextEditorSet;
    },
    set failNextEditorSet(value: boolean) {
      failNextEditorSet = value;
    },
    statuses,
    uiCalls,
  };
}

function createPolicy(state: PensieveState = getPensieveState({})): DraftRestorationPolicy {
  return createDraftRestorationPolicy(state);
}

function latestStatus(context: TestContext): string | undefined {
  return context.statuses.at(-1)?.text;
}

function expectFailure(action: () => void, message: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toBe(message);
    }
    return;
  }

  throw new Error("Expected action to fail");
}

describe("shortcut behavior", () => {
  test("preserves exact text and restores the Draft stack in LIFO order", () => {
    const policy = createPolicy();
    const context = createContext("  outer\ntext  ");

    policy.stashOrRestore(context.ctx);
    expect(context.editorText).toBe("");
    expect(latestStatus(context)).toBe("stashed: outer");

    context.editorText = "inner";
    policy.stashOrRestore(context.ctx);
    expect(latestStatus(context)).toBe("stashed: inner (+1)");

    context.editorText = " \n\t";
    policy.stashOrRestore(context.ctx);
    expect(context.editorText).toBe("inner");
    expect(latestStatus(context)).toBe("stashed: outer");

    context.editorText = "";
    policy.stashOrRestore(context.ctx);
    expect(context.editorText).toBe("  outer\ntext  ");
    expect(latestStatus(context)).toBeUndefined();
  });

  test("does not push when clearing the editor fails", () => {
    const policy = createPolicy();
    const context = createContext("draft");
    context.failNextEditorSet = true;

    expectFailure(() => policy.stashOrRestore(context.ctx), "editor unavailable");

    context.editorText = "";
    policy.stashOrRestore(context.ctx);
    expect(context.editorText).toBe("");
    expect(latestStatus(context)).toBeUndefined();
  });

  test("keeps the Prompt draft when restoration fails", () => {
    const policy = createPolicy();
    const context = createContext("draft");
    policy.stashOrRestore(context.ctx);
    context.failNextEditorSet = true;

    expectFailure(
      () => policy.considerRestoration({ kind: "agent-starting" }, context.ctx),
      "editor unavailable",
    );

    expect(context.editorText).toBe("");
    policy.considerRestoration({ kind: "agent-starting" }, context.ctx);
    expect(context.editorText).toBe("draft");
  });

  test("performs no UI or Draft stack work outside TUI mode", () => {
    const state = getPensieveState({});
    const policy = createPolicy(state);
    const context = createContext("draft", "rpc");

    policy.stashOrRestore(context.ctx);
    policy.considerRestoration({ kind: "agent-starting" }, context.ctx);
    policy.refreshFooter(context.ctx);

    expect(context.editorText).toBe("draft");
    expect(context.uiCalls).toEqual([]);
    expect(state.drafts).toEqual([]);
  });
});

describe("Restoration triggers", () => {
  const cases: ReadonlyArray<readonly [RestorationTrigger, boolean]> = [
    [{ kind: "prompt-submitted", origin: "person" }, true],
    [{ kind: "prompt-submitted", origin: "other" }, false],
    [{ kind: "agent-starting" }, true],
    [{ kind: "compaction", initiation: "manual" }, true],
    [{ kind: "compaction", initiation: "automatic" }, false],
    [{ kind: "model-selection", phase: "startup" }, false],
    [{ kind: "model-selection", phase: "change" }, true],
    [{ kind: "session-shutdown", intent: "reload" }, true],
    [{ kind: "session-shutdown", intent: "other" }, false],
  ];

  for (const [trigger, eligible] of cases) {
    test(`${JSON.stringify(trigger)} is ${eligible ? "eligible" : "ineligible"}`, () => {
      const policy = createPolicy();
      const context = createContext("draft");
      policy.stashOrRestore(context.ctx);
      const callsBeforeTrigger = context.uiCalls.length;

      policy.considerRestoration(trigger, context.ctx);

      expect(context.editorText).toBe(eligible ? "draft" : "");
      if (!eligible) {
        expect(context.uiCalls).toHaveLength(callsBeforeTrigger);
      }
    });
  }

  test("uses editor occupancy for natural duplicate-trigger idempotence", () => {
    const policy = createPolicy();
    const context = createContext("outer");
    policy.stashOrRestore(context.ctx);
    context.editorText = "inner";
    policy.stashOrRestore(context.ctx);

    policy.considerRestoration({ kind: "prompt-submitted", origin: "person" }, context.ctx);
    policy.considerRestoration({ kind: "agent-starting" }, context.ctx);

    expect(context.editorText).toBe("inner");
    context.editorText = "";
    policy.considerRestoration({ kind: "agent-starting" }, context.ctx);
    expect(context.editorText).toBe("outer");
  });

  test("never overwrites a nonempty editor", () => {
    const policy = createPolicy();
    const context = createContext("draft");
    policy.stashOrRestore(context.ctx);
    context.editorText = "current work";

    policy.considerRestoration({ kind: "agent-starting" }, context.ctx);

    expect(context.editorText).toBe("current work");
    context.editorText = "";
    policy.considerRestoration({ kind: "agent-starting" }, context.ctx);
    expect(context.editorText).toBe("draft");
  });
});

describe("footer and reload state", () => {
  test("refreshes status without changing the Draft stack", () => {
    const state = getPensieveState({});
    const firstPolicy = createPolicy(state);
    const firstContext = createContext("draft");
    firstPolicy.stashOrRestore(firstContext.ctx);

    const replacementPolicy = createPolicy(state);
    const replacementContext = createContext();
    replacementPolicy.refreshFooter(replacementContext.ctx);

    expect(latestStatus(replacementContext)).toBe("stashed: draft");
    replacementPolicy.considerRestoration({ kind: "agent-starting" }, replacementContext.ctx);
    expect(replacementContext.editorText).toBe("draft");
  });

  test("clears stale status when an eligible Restore finds an empty Draft stack", () => {
    const policy = createPolicy();
    const context = createContext();

    policy.considerRestoration({ kind: "agent-starting" }, context.ctx);

    expect(context.statuses).toEqual([{ key: "pensieve", text: undefined }]);
  });
});
