import { describe, expect, test } from "bun:test";

import {
  PROCESS_STATE_KEY,
  draftCount,
  getPensieveState,
  peekDraft,
  popDraft,
  pushDraft,
  type StateHost,
} from "../src/state.ts";

describe("process state", () => {
  test("starts empty and reuses state from the same host", () => {
    const host: StateHost = {};
    const first = getPensieveState(host);
    pushDraft(first, "draft");

    const afterReload = getPensieveState(host);

    expect(afterReload).toBe(first);
    expect(peekDraft(afterReload)).toBe("draft");
  });

  test("replaces incompatible state", () => {
    const host: StateHost = {
      [PROCESS_STATE_KEY]: { version: 0, drafts: ["obsolete"] },
    };

    expect(getPensieveState(host)).toEqual({ version: 1, drafts: [] });
  });

  test("replaces state containing non-text entries", () => {
    const host: StateHost = {
      [PROCESS_STATE_KEY]: { version: 1, drafts: ["valid", 42] },
    };

    expect(getPensieveState(host)).toEqual({ version: 1, drafts: [] });
  });
});

describe("draft stack", () => {
  test("preserves exact text and pops in LIFO order", () => {
    const state = getPensieveState({});
    pushDraft(state, "  first\nline  ");
    pushDraft(state, "second");

    expect(draftCount(state)).toBe(2);
    expect(peekDraft(state)).toBe("second");
    expect(popDraft(state)).toBe("second");
    expect(popDraft(state)).toBe("  first\nline  ");
    expect(popDraft(state)).toBeUndefined();
  });

  test("does not evict older entries", () => {
    const state = getPensieveState({});

    for (let index = 0; index < 10_000; index += 1) {
      pushDraft(state, String(index));
    }

    expect(draftCount(state)).toBe(10_000);
    expect(popDraft(state)).toBe("9999");
    expect(state.drafts[0]).toBe("0");
  });
});
