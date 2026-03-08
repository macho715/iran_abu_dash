import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestNotifPermission, sendCrisisNotif } from "./notifications.js";

describe("notifications", () => {
  beforeEach(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when Notification is unavailable", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "Notification");
    delete window.Notification;

    await expect(requestNotifPermission()).resolves.toBe("unsupported");

    if (original) {
      Object.defineProperty(window, "Notification", original);
    }
  });

  it("only sends crisis notifications when the page is hidden and permission is granted", () => {
    const NotificationMock = vi.fn();
    NotificationMock.permission = "granted";
    NotificationMock.requestPermission = vi.fn(async () => "granted");
    vi.stubGlobal("Notification", NotificationMock);
    Object.defineProperty(window, "Notification", {
      configurable: true,
      writable: true,
      value: NotificationMock
    });

    expect(sendCrisisNotif({ level: "ALERT", title: "Visible tab", detail: "ignored" })).toBe(false);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true
    });

    expect(sendCrisisNotif({ level: "ALERT", title: "Escalation", detail: "Details", noiseKey: "ALERT|1" })).toBe(true);
    expect(NotificationMock).toHaveBeenCalledWith("⚠ ALERT", expect.objectContaining({
      body: expect.stringContaining("Escalation"),
      tag: "ALERT|1",
      requireInteraction: true
    }));
  });
});
