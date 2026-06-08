/**
 * Tests for the shared country-code helpers used by VerifiedBadge.
 */

import { describe, expect, it } from "vitest";

import { countryToFlag, parseCountryCode } from "../../lib/country";

describe("parseCountryCode", () => {
  it("parses valid hex country code", () => {
    // "US" = 0x5553 (U=0x55, S=0x53)
    expect(parseCountryCode("0x5553")).toBe("US");

    // "GB" = 0x4742 (G=0x47, B=0x42)
    expect(parseCountryCode("0x4742")).toBe("GB");

    // "JP" = 0x4A50 (J=0x4A, P=0x50)
    expect(parseCountryCode("0x4A50")).toBe("JP");
  });

  it("returns undefined for no country disclosed", () => {
    expect(parseCountryCode("0x0000")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(parseCountryCode(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseCountryCode("")).toBeUndefined();
  });

  it("returns undefined for too short codes", () => {
    expect(parseCountryCode("0x55")).toBeUndefined();
    expect(parseCountryCode("0x")).toBeUndefined();
  });

  it("normalizes codes without 0x prefix", () => {
    expect(parseCountryCode("5553")).toBe("US");
  });

  it("returns undefined for hex bytes outside A-Z ASCII range", () => {
    // 0x1234 → bytes 0x12, 0x34 → control char + '4' → not letters
    expect(parseCountryCode("0x1234")).toBeUndefined();
    // 0x6161 → "aa" → lowercase, also outside A-Z (65..90)
    expect(parseCountryCode("0x6161")).toBeUndefined();
  });
});

describe("countryToFlag", () => {
  it("converts country code to flag emoji", () => {
    expect(countryToFlag("US")).toBe("🇺🇸");
    expect(countryToFlag("GB")).toBe("🇬🇧");
    expect(countryToFlag("JP")).toBe("🇯🇵");
    expect(countryToFlag("DE")).toBe("🇩🇪");
    expect(countryToFlag("FR")).toBe("🇫🇷");
  });

  it("handles lowercase input", () => {
    expect(countryToFlag("us")).toBe("🇺🇸");
    expect(countryToFlag("gb")).toBe("🇬🇧");
  });
});
