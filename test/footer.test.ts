import { describe, expect, test } from "bun:test";

import { formatFooter } from "../src/footer.js";

describe("footer status", () => {
  test("is absent when the stack is empty", () => {
    expect(formatFooter([])).toBeUndefined();
  });

  test("shows the newest draft and older-entry count", () => {
    expect(formatFooter(["first", "second", "newest"])).toBe("stashed: newest (+2)");
  });

  test("uses the first nonempty line and normalizes its whitespace", () => {
    expect(formatFooter([" \n\t  Refactor   the\tauth flow  \nkeep this private"])).toBe(
      "stashed: Refactor the auth flow",
    );
  });

  test("truncates the preview without splitting Unicode code points", () => {
    expect(formatFooter(["🧠abcde"], 5)).toBe("stashed: 🧠abc…");
  });

  test("does not append an ellipsis when the preview fits", () => {
    expect(formatFooter(["exact"], 5)).toBe("stashed: exact");
  });
});
