import { describe, it, expect } from "vitest";
import { createSofascoreBrowser, type ChromiumLauncher } from "./playwrightBrowser";

function fakeLauncher(html: string, calls: { launches: number }): ChromiumLauncher {
  return () => {
    calls.launches += 1;
    return Promise.resolve({
      newPage: () =>
        Promise.resolve({
          goto: () => Promise.resolve(undefined),
          content: () => Promise.resolve(html),
          close: () => Promise.resolve(),
        }),
      close: () => Promise.resolve(),
    });
  };
}

describe("createSofascoreBrowser", () => {
  it("launches the browser ONCE (reused), fetches page HTML by sofascore match id", async () => {
    const calls = { launches: 0 };
    const t = createSofascoreBrowser(fakeLauncher("<html>ok 7.4</html>", calls), {
      headless: true,
    });
    expect(await t.fetchMatchHtml(50)).toBe("<html>ok 7.4</html>");
    expect(await t.fetchMatchHtml(51)).toBe("<html>ok 7.4</html>");
    expect(calls.launches).toBe(1); // one browser, reused across fetches
    await t.close();
  });
});
