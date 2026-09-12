import { describe, expect, it } from "vitest";
import { escapeHtml, escapeHtmlAttributeUrl } from "./html";

describe("escapeHtml (SA-7)", () => {
  it("neutralises a script tag", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;&#47;script&gt;",
    );
  });

  it("escapes attribute-breaking characters", () => {
    expect(escapeHtml(`" onmouseover='evil()'`)).toBe(
      "&quot; onmouseover&#61;&#39;evil()&#39;",
    );
  });

  it("escapes ampersands first so entities are not double-decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("renders null and undefined as empty", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("passes ordinary text through unchanged", () => {
    expect(escapeHtml("Rebalance failed on rock 12")).toBe("Rebalance failed on rock 12");
  });
});

describe("escapeHtmlAttributeUrl", () => {
  it("allows http, https and mailto", () => {
    expect(escapeHtmlAttributeUrl("https://bank-rock.com/rock/1")).toBe(
      "https:&#47;&#47;bank-rock.com&#47;rock&#47;1",
    );
    expect(escapeHtmlAttributeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
  });

  it("collapses javascript: and data: URLs to #", () => {
    expect(escapeHtmlAttributeUrl("javascript:alert(1)")).toBe("#");
    expect(escapeHtmlAttributeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe("#");
    expect(escapeHtmlAttributeUrl("")).toBe("#");
  });
});
