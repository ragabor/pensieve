import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { formatFooter } from "./footer.ts";
import { peekDraft, popDraft, pushDraft, type PensieveState } from "./state.ts";

const STATUS_KEY = "pensieve";

/** Domain facts that ask Pensieve to consider restoring a Prompt draft. */
export type RestorationTrigger =
  | { readonly kind: "prompt-submitted"; readonly origin: "person" | "other" }
  | { readonly kind: "agent-starting" }
  | { readonly kind: "compaction"; readonly initiation: "manual" | "automatic" }
  | { readonly kind: "model-selection"; readonly phase: "startup" | "change" }
  | { readonly kind: "session-shutdown"; readonly intent: "reload" | "other" };

export interface DraftRestorationPolicy {
  /** Stashes a nonempty editor, or restores when the editor is empty. */
  readonly stashOrRestore: (ctx: ExtensionContext) => void;
  /** Applies restoration rules to a trigger translated by the Pi adapter. */
  readonly considerRestoration: (trigger: RestorationTrigger, ctx: ExtensionContext) => void;
  /** Synchronizes footer status without changing the editor or Draft stack. */
  readonly refreshFooter: (ctx: ExtensionContext) => void;
}

function assertNever(value: never): never {
  throw new Error(`Unknown restoration trigger: ${JSON.stringify(value)}`);
}

function isRestorationEligible(trigger: RestorationTrigger): boolean {
  switch (trigger.kind) {
    case "prompt-submitted":
      return trigger.origin === "person";
    case "agent-starting":
      return true;
    case "compaction":
      return trigger.initiation === "manual";
    case "model-selection":
      return trigger.phase === "change";
    case "session-shutdown":
      return trigger.intent === "reload";
    default:
      return assertNever(trigger);
  }
}

/** Creates a fresh policy implementation around versioned process state. */
export function createDraftRestorationPolicy(state: PensieveState): DraftRestorationPolicy {
  const refreshFooter = (ctx: ExtensionContext): void => {
    if (ctx.mode !== "tui") {
      return;
    }

    ctx.ui.setStatus(STATUS_KEY, formatFooter(state.drafts));
  };

  const restore = (ctx: ExtensionContext): void => {
    if (ctx.mode !== "tui" || ctx.ui.getEditorText().trim().length > 0) {
      return;
    }

    const draft = peekDraft(state);
    if (draft === undefined) {
      refreshFooter(ctx);
      return;
    }

    ctx.ui.setEditorText(draft);
    popDraft(state);
    refreshFooter(ctx);
  };

  const stashOrRestore = (ctx: ExtensionContext): void => {
    if (ctx.mode !== "tui") {
      return;
    }

    const editorText = ctx.ui.getEditorText();
    if (editorText.trim().length === 0) {
      restore(ctx);
      return;
    }

    ctx.ui.setEditorText("");
    pushDraft(state, editorText);
    refreshFooter(ctx);
  };

  const considerRestoration = (trigger: RestorationTrigger, ctx: ExtensionContext): void => {
    if (isRestorationEligible(trigger)) {
      restore(ctx);
    }
  };

  return { stashOrRestore, considerRestoration, refreshFooter };
}
