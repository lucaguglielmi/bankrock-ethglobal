import { describe, expect, it } from "vitest";
import { MissingEnvError, optionalEnv, real, demo, unavailable, isAvailable, requireEnv } from "./demo";

describe("capability states", () => {
  it("tags each state", () => {
    expect(real(1)).toEqual({ state: "REAL", value: 1 });
    expect(demo(1)).toEqual({ state: "DEMO", value: 1 });
    expect(unavailable("because")).toEqual({ state: "UNAVAILABLE", reason: "because" });
  });

  it("narrows available capabilities", () => {
    const capability = real("x");
    expect(isAvailable(capability)).toBe(true);
    expect(isAvailable(unavailable<string>("no"))).toBe(false);
  });
});

describe("requireEnv", () => {
  it("throws a named error when the variable is unset (D-017)", () => {
    delete process.env.TEST_SECRET_NOT_SET;
    expect(() => requireEnv("TEST_SECRET_NOT_SET")).toThrow(MissingEnvError);
    try {
      requireEnv("TEST_SECRET_NOT_SET");
    } catch (err) {
      expect((err as MissingEnvError).variable).toBe("TEST_SECRET_NOT_SET");
      // The error must not contain a value, only the variable name.
      expect((err as Error).message).toBe(
        "Required environment variable TEST_SECRET_NOT_SET is not set",
      );
    }
  });

  it("treats a blank value as unset", () => {
    process.env.TEST_SECRET_BLANK = "   ";
    expect(() => requireEnv("TEST_SECRET_BLANK")).toThrow(MissingEnvError);
    expect(optionalEnv("TEST_SECRET_BLANK")).toBeUndefined();
  });

  it("returns the trimmed value when set", () => {
    process.env.TEST_SECRET_SET = " value ";
    expect(requireEnv("TEST_SECRET_SET")).toBe("value");
  });
});
