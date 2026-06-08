/**
 * zkpassport Client Tests
 */

import { describe, expect, it } from "vitest";

import { countryToCode, getDeepLinkUrl, isMobileDevice } from "./client";

describe("countryToCode", () => {
  it("returns mapped code for known countries", () => {
    expect(countryToCode("United States")).toBe("US");
    expect(countryToCode("United Kingdom")).toBe("GB");
    expect(countryToCode("Japan")).toBe("JP");
    expect(countryToCode("Germany")).toBe("DE");
    expect(countryToCode("Côte d'Ivoire")).toBe("CI");
    expect(countryToCode("Ivory Coast")).toBe("CI");
  });

  it("throws for unknown countries to prevent invalid on-chain data", () => {
    expect(() => countryToCode("Wakanda")).toThrow("Unsupported country");
    expect(() => countryToCode("Atlantis")).toThrow("Unsupported country");
  });

  it("throws for non-ASCII or invalid country names", () => {
    expect(() => countryToCode("日本")).toThrow("Unsupported country");
    expect(() => countryToCode("")).toThrow("Unsupported country");
    expect(() => countryToCode("123")).toThrow("Unsupported country");
  });

  it("trims whitespace from country names", () => {
    expect(countryToCode("  United States  ")).toBe("US");
    expect(countryToCode("\tJapan\n")).toBe("JP");
  });
});

describe("getDeepLinkUrl", () => {
  it("creates zkpassport deep link with encoded URL", () => {
    const url = "https://verify.zkpassport.id/abc123";
    const deepLink = getDeepLinkUrl(url);

    expect(deepLink).toBe(`zkpassport://verify?url=${encodeURIComponent(url)}`);
  });

  it("handles URLs with special characters", () => {
    const url = "https://verify.zkpassport.id/req?scope=test&id=123";
    const deepLink = getDeepLinkUrl(url);

    expect(deepLink).toContain("zkpassport://verify?url=");
    expect(deepLink).toContain(encodeURIComponent(url));
  });
});

describe("isMobileDevice", () => {
  it("returns boolean", () => {
    // In test environment, navigator.userAgent is typically not mobile
    const result = isMobileDevice();
    expect(typeof result).toBe("boolean");
  });
});
