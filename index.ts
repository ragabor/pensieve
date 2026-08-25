import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { loadShortcuts } from "./src/config.ts";
import { formatFooter } from "./src/footer.ts";
import { getPensieveState, peekDraft, popDraft, pushDraft } from "./src/state.ts";

const STATUS_KEY = "pensieve";
const INSTALLED_KEY = Symbol.for("@ragabor/pensieve/installed/v1");

type Shortcut = Parameters<ExtensionAPI["registerShortcut"]>[0];
type InstallableExtensionAPI = ExtensionAPI & { [INSTALLED_KEY]?: true };

function isEmpty(text: string): boolean {
  return text.trim().length === 0;
}

export default function pensieve(pi: ExtensionAPI): void {
  const installablePi = pi as InstallableExtensionAPI;
  if (installablePi[INSTALLED_KEY]) {
    return;
  }
  installablePi[INSTALLED_KEY] = true;

  const state = getPensieveState();

  function updateFooter(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") {
      return;
    }

    ctx.ui.setStatus(STATUS_KEY, formatFooter(state.drafts));
  }

  function restore(ctx: ExtensionContext): boolean {
    if (ctx.mode !== "tui" || !isEmpty(ctx.ui.getEditorText())) {
      return false;
    }

    const draft = peekDraft(state);
    if (draft === undefined) {
      updateFooter(ctx);
      return false;
    }

    ctx.ui.setEditorText(draft);
    popDraft(state);
    updateFooter(ctx);
    return true;
  }

  function stashOrRestore(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") {
      return;
    }

    const editorText = ctx.ui.getEditorText();
    if (isEmpty(editorText)) {
      restore(ctx);
      return;
    }

    ctx.ui.setEditorText("");
    pushDraft(state, editorText);
    updateFooter(ctx);
  }

  for (const shortcut of loadShortcuts()) {
    pi.registerShortcut(shortcut as Shortcut, {
      description: "Stash or restore a prompt draft",
      handler: stashOrRestore,
    });
  }

  pi.on("session_start", (_event, ctx) => {
    updateFooter(ctx);
  });

  pi.on("input", (event, ctx) => {
    if (event.source === "interactive") {
      restore(ctx);
    }
  });

  pi.on("before_agent_start", (_event, ctx) => {
    restore(ctx);
  });

  pi.on("session_before_compact", (event, ctx) => {
    if (event.reason === "manual") {
      restore(ctx);
    }
  });

  pi.on("model_select", (event, ctx) => {
    if (event.source !== "restore" && event.previousModel !== undefined) {
      restore(ctx);
    }
  });

  pi.on("session_shutdown", (event, ctx) => {
    if (event.reason === "reload") {
      restore(ctx);
    }
  });
}
