import type { ExtensionAPI, ExtensionEvent } from "@earendil-works/pi-coding-agent";

import {
  createDraftRestorationPolicy,
  type DraftRestorationPolicy,
  type RestorationTrigger,
} from "./src/restoration-policy.ts";
import { loadShortcuts } from "./src/shortcuts.ts";
import { getPensieveState } from "./src/state.ts";

const INSTALLED_KEY = Symbol.for("@ragabor/pensieve/installed/v1");

type Shortcut = Parameters<ExtensionAPI["registerShortcut"]>[0];
type InstallableExtensionAPI = ExtensionAPI & { [INSTALLED_KEY]?: true };
type PensieveEventType = "input" | "session_before_compact" | "model_select" | "session_shutdown";
type PensieveEvent = Extract<ExtensionEvent, { type: PensieveEventType }>;
type EventFor<T extends PensieveEventType> = Extract<PensieveEvent, { type: T }>;
type TriggerFor<T extends RestorationTrigger["kind"]> = Extract<RestorationTrigger, { kind: T }>;

function assertNever(value: never): never {
  throw new Error(`Unknown Pi event value: ${String(value)}`);
}

function inputOrigin(
  source: EventFor<"input">["source"],
): TriggerFor<"prompt-submitted">["origin"] {
  switch (source) {
    case "interactive":
      return "person";
    case "rpc":
    case "extension":
      return "other";
    default:
      return assertNever(source);
  }
}

function compactionInitiation(
  reason: EventFor<"session_before_compact">["reason"],
): TriggerFor<"compaction">["initiation"] {
  switch (reason) {
    case "manual":
      return "manual";
    case "threshold":
    case "overflow":
      return "automatic";
    default:
      return assertNever(reason);
  }
}

function modelSelectionPhase(
  source: EventFor<"model_select">["source"],
): TriggerFor<"model-selection">["phase"] {
  switch (source) {
    case "restore":
      return "startup";
    case "set":
    case "cycle":
      return "change";
    default:
      return assertNever(source);
  }
}

function shutdownIntent(
  reason: EventFor<"session_shutdown">["reason"],
): TriggerFor<"session-shutdown">["intent"] {
  switch (reason) {
    case "reload":
      return "reload";
    case "quit":
    case "new":
    case "resume":
    case "fork":
      return "other";
    default:
      return assertNever(reason);
  }
}

function registerHandlers(pi: ExtensionAPI, policy: DraftRestorationPolicy): void {
  for (const shortcut of loadShortcuts()) {
    pi.registerShortcut(shortcut as Shortcut, {
      description: "Stash or restore a prompt draft",
      handler: policy.stashOrRestore,
    });
  }

  pi.on("session_start", (_event, ctx) => {
    policy.refreshFooter(ctx);
  });

  pi.on("input", (event, ctx) => {
    policy.considerRestoration(
      { kind: "prompt-submitted", origin: inputOrigin(event.source) },
      ctx,
    );
  });

  pi.on("before_agent_start", (_event, ctx) => {
    policy.considerRestoration({ kind: "agent-starting" }, ctx);
  });

  pi.on("session_before_compact", (event, ctx) => {
    policy.considerRestoration(
      { kind: "compaction", initiation: compactionInitiation(event.reason) },
      ctx,
    );
  });

  pi.on("model_select", (event, ctx) => {
    policy.considerRestoration(
      { kind: "model-selection", phase: modelSelectionPhase(event.source) },
      ctx,
    );
  });

  pi.on("session_shutdown", (event, ctx) => {
    policy.considerRestoration(
      { kind: "session-shutdown", intent: shutdownIntent(event.reason) },
      ctx,
    );
  });
}

export default function pensieve(pi: ExtensionAPI): void {
  const installablePi = pi as InstallableExtensionAPI;
  if (installablePi[INSTALLED_KEY]) {
    return;
  }
  installablePi[INSTALLED_KEY] = true;

  const policy = createDraftRestorationPolicy(getPensieveState());
  registerHandlers(pi, policy);
}
