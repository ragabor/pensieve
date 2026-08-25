export interface PensieveState {
  readonly version: 1;
  readonly drafts: string[];
}

export type StateHost = Record<PropertyKey, unknown>;

export const PROCESS_STATE_KEY = Symbol.for("@ragabor/pensieve/state/v1");

function isPensieveState(value: unknown): value is PensieveState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PensieveState>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.drafts) &&
    candidate.drafts.every((draft) => typeof draft === "string")
  );
}

export function getPensieveState(host: StateHost = globalThis): PensieveState {
  const existing = host[PROCESS_STATE_KEY];
  if (isPensieveState(existing)) {
    return existing;
  }

  const state: PensieveState = { version: 1, drafts: [] };
  host[PROCESS_STATE_KEY] = state;
  return state;
}

export function pushDraft(state: PensieveState, text: string): void {
  state.drafts.push(text);
}

export function peekDraft(state: PensieveState): string | undefined {
  return state.drafts.at(-1);
}

export function popDraft(state: PensieveState): string | undefined {
  return state.drafts.pop();
}

export function draftCount(state: PensieveState): number {
  return state.drafts.length;
}
