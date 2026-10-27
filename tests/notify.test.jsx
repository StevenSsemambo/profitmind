// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { currentPermission, requestNotificationPermission, showAppNotification, notificationsSupported } from "../src/lib/notify.js";
import ErrorBoundary from "../src/components/ErrorBoundary.jsx";

globalThis.React = React;

// Android Chrome: the constructor is forbidden.
function androidNotification(permission = "granted") {
  const ctor = vi.fn(() => { throw new TypeError("Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead."); });
  ctor.permission = permission;
  ctor.requestPermission = vi.fn(async () => permission);
  window.Notification = ctor;
  return ctor;
}
function withServiceWorker(showNotification) {
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ showNotification }) } });
}
function withoutServiceWorker() {
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
  delete navigator.serviceWorker;
}

beforeEach(() => { delete window.Notification; withoutServiceWorker(); });

describe("showAppNotification", () => {
  it("on a phone, shows through the service worker and never touches the forbidden constructor", async () => {
    const ctor = androidNotification();
    const show = vi.fn(async () => {});
    withServiceWorker(show);
    const ok = await showAppNotification("Weekly report ready", { body: "b", tag: "t", tab: "reports" });
    expect(ok).toBe(true);
    expect(show).toHaveBeenCalledWith("Weekly report ready", expect.objectContaining({ body: "b", tag: "t", data: { tab: "reports" } }));
    expect(ctor).not.toHaveBeenCalled();
  });

  it("does not throw when a phone has no service worker and the constructor is forbidden", async () => {
    androidNotification();
    await expect(showAppNotification("x")).resolves.toBe(false);
  });

  it("does not throw when the service worker itself fails, and reports false", async () => {
    androidNotification();
    withServiceWorker(vi.fn(async () => { throw new Error("boom"); }));
    await expect(showAppNotification("x")).resolves.toBe(false);
  });

  it("on desktop without a service worker, uses the normal constructor", async () => {
    const instances = [];
    window.Notification = function (title, opts) { instances.push({ title, opts }); this.close = () => {}; };
    window.Notification.permission = "granted";
    expect(await showAppNotification("Hello", { body: "b" })).toBe(true);
    expect(instances[0].title).toBe("Hello");
  });

  it("shows nothing unless permission is granted", async () => {
    androidNotification("default");
    const show = vi.fn();
    withServiceWorker(show);
    expect(await showAppNotification("x")).toBe(false);
    expect(show).not.toHaveBeenCalled();
  });
});

describe("permission helpers", () => {
  it("reports unsupported browsers instead of throwing", async () => {
    expect(notificationsSupported()).toBe(false);
    expect(currentPermission()).toBe("unsupported");
    expect(await requestNotificationPermission()).toBe("unsupported");
  });

  it("handles the modern promise form", async () => {
    androidNotification("granted");
    expect(await requestNotificationPermission()).toBe("granted");
  });

  it("handles old callback-only browsers that return nothing", async () => {
    window.Notification = { permission: "default", requestPermission: (cb) => { cb("granted"); } };
    expect(await requestNotificationPermission()).toBe("granted");
  });

  it("returns 'error' instead of throwing when the browser fails", async () => {
    window.Notification = { permission: "default", requestPermission: () => { throw new Error("not allowed in this webview"); } };
    expect(await requestNotificationPermission()).toBe("error");
    window.Notification = { permission: "default", requestPermission: () => Promise.reject(new Error("nope")) };
    expect(await requestNotificationPermission()).toBe("error");
  });
});

describe("ErrorBoundary", () => {
  it("replaces a crashed screen with a recovery message instead of a blank page", () => {
    const Boom = () => { throw new Error("kaboom"); };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/records are safe/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy();
    spy.mockRestore();
  });

  it("renders children normally when nothing is wrong", () => {
    render(<ErrorBoundary><p>all good</p></ErrorBoundary>);
    expect(screen.getByText("all good")).toBeTruthy();
  });
});
