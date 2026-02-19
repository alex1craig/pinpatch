import { describe, expect, it } from "vitest";
import { injectOverlayScript } from "../src/inject";

describe("injectOverlayScript", () => {
  it("escapes model values before writing inline script globals", () => {
    const html = "<html><head></head><body></body></html>";
    const model = 'sonnet</script><script>window.__XSS__=1</script>';

    const injected = injectOverlayScript(html, 7331, "claude", model);

    expect(injected).not.toContain("<script>window.__XSS__=1</script>");
    expect(injected).toContain(
      "window.__PINPATCH_MODEL = \"sonnet\\u003C/script\\u003E\\u003Cscript\\u003Ewindow.__XSS__=1\\u003C/script\\u003E\";"
    );
  });

  it("injects into head before body when available", () => {
    const html = "<html><head></head><body><main>app</main></body></html>";

    const injected = injectOverlayScript(html, 7331, "codex", "gpt-5.3-codex-spark");

    const scriptPos = injected.indexOf("window.__PINPATCH_BRIDGE_URL");
    const headClosePos = injected.indexOf("</head>");
    const bodyOpenPos = injected.indexOf("<body>");

    expect(scriptPos).toBeGreaterThan(-1);
    expect(scriptPos).toBeLessThan(headClosePos);
    expect(headClosePos).toBeLessThan(bodyOpenPos);
  });
});

