import { describe, expect, it } from "vitest";
import { translate } from "@/lib/copy";

describe("bilingual copy lookup", () => {
  it("resolves literal dotted route keys in the existing copy schema", () => {
    expect(translate("routes.dashboard.title", "en")).toBe("Entity & Period Dashboard");
    expect(translate("routes.dashboard.title", "ar")).toBe("لوحة الكيان والفترة");
  });
});
