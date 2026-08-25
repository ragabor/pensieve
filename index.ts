import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { formatFooter } from "./src/footer.ts";
import { loadShortcuts } from "./src/shortcuts.ts";
import {
  getPensieveState,
  peekDraft,
  popDraft,
  pushDraft,
  type PensieveState,
} from "./src/state.ts";

const STATUS_KEY = "pensieve";
const INSTALLED_KEY = Symbol.for("@ragabor/pensieve/installed/v1");

type Shortcut = Parameters<ExtensionAPI["registerShortcut"]>[0];
type InstallableExtensionAPI = ExtensionAPI & { [INSTALLED_KEY]?: true };

/** Updates the footer to show the newest stashed draft. */
function updateFooter(state: PensieveState, ctx: ExtensionContext): void {
  if (ctx.mode !== "tui") {
    return;
  }

  ctx.ui.setStatus(STATUS_KEY, formatFooter(state.drafts));
}

/** Restores the newest draft without overwriting a nonempty editor. */
function restore(state: PensieveState, ctx: ExtensionContext): boolean {
  if (ctx.mode !== "tui" || ctx.ui.getEditorText().trim().length > 0) {
    return false;
  }

  const draft = peekDraft(state);
  if (draft === undefined) {
    updateFooter(state, ctx);
    return false;
  }

  ctx.ui.setEditorText(draft);
  popDraft(state);
  updateFooter(state, ctx);
  return true;
}

/** Stashes the current prompt, or restores a draft when the editor is empty. */
function stashOrRestore(state: PensieveState, ctx: ExtensionContext): void {
  if (ctx.mode !== "tui") {
    return;
  }

  const editorText = ctx.ui.getEditorText();
  if (editorText.trim().length === 0) {
    restore(state, ctx);
    return;
  }

  ctx.ui.setEditorText("");
  pushDraft(state, editorText);
  updateFooter(state, ctx);
}

function registerHandlers(pi: ExtensionAPI, state: PensieveState): void {
  for (const shortcut of loadShortcuts()) {
    pi.registerShortcut(shortcut as Shortcut, {
      description: "Stash or restore a prompt draft",
      handler: (ctx) => stashOrRestore(state, ctx),
    });
  }

  pi.on("session_start", (_event, ctx) => {
    updateFooter(state, ctx);
  });

  pi.on("input", (event, ctx) => {
    if (event.source === "interactive") {
      restore(state, ctx);
    }
  });

  pi.on("before_agent_start", (_event, ctx) => {
    restore(state, ctx);
  });

  pi.on("session_before_compact", (event, ctx) => {
    if (event.reason === "manual") {
      restore(state, ctx);
    }
  });

  pi.on("model_select", (event, ctx) => {
    if (event.source !== "restore") {
      restore(state, ctx);
    }
  });

  pi.on("session_shutdown", (event, ctx) => {
    if (event.reason === "reload") {
      restore(state, ctx);
    }
  });
}

export default function pensieve(pi: ExtensionAPI): void {
  const installablePi = pi as InstallableExtensionAPI;
  if (installablePi[INSTALLED_KEY]) {
    return;
  }
  installablePi[INSTALLED_KEY] = true;

  registerHandlers(pi, getPensieveState());
}
