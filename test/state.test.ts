import { describe, expect, test } from "bun:test";

import { PROCESS_STATE_KEY, getPensieveState, pushDraft, type StateHost } from "../src/state.ts";

describe("process state", () => {
  test("starts empty and reuses state from the same host", () => {
    const host: StateHost = {};
    const first = getPensieveState(host);
    pushDraft(first, "draft");

    const afterReload = getPensieveState(host);

    expect(afterReload).toBe(first);
    expect(afterReload.drafts).toEqual(["draft"]);
  });

  test("replaces invalid state", () => {
    const invalidStates = [
      { version: 0, drafts: ["obsolete"] },
      { version: 1, drafts: ["valid", 42] },
    ];

    for (const invalidState of invalidStates) {
      const host: StateHost = { [PROCESS_STATE_KEY]: invalidState };
      expect(getPensieveState(host)).toEqual({ version: 1, drafts: [] });
    }
  });
});
