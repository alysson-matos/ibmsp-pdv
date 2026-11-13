import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("simultaneous expiry observers share one navigation rather than triggering the error fallback", async () => {
  let navigations = 0;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      location: { replace: (path: string) => {
        assert.equal(path, "/");
        navigations += 1;
      } },
    },
  });
  const { restartApp } = await import("./restart-app");
  assert.equal(restartApp(), true);
  assert.equal(restartApp(), true);
  assert.equal(navigations, 1);
});