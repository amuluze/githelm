import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  shortSha,
  truncate,
} from "./format";

describe("formatBytes", () => {
  it("formats each unit tier", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });

  it("keeps whole values decimal-free", () => {
    expect(formatBytes(40 * 1024)).toBe("40 KB");
  });

  it("returns a dash for invalid input", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("returns a dash for null", () => {
    expect(formatDuration(null)).toBe("—");
  });

  it("formats across unit boundaries", () => {
    expect(formatDuration(250)).toBe("250ms");
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(59_000)).toBe("59s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(61_000)).toBe("1m 1s");
    expect(formatDuration(3 * 60_000)).toBe("3m");
    expect(formatDuration(2 * 3_600_000)).toBe("2h");
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe("2h 5m");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-08-28T12:00:00Z");

  it("formats recent and far offsets", () => {
    expect(formatRelativeTime("2026-08-28T11:00:00Z", now, "en")).toBe(
      "1 hour ago",
    );
    expect(formatRelativeTime("2026-08-27T12:00:00Z", now, "en")).toBe(
      "yesterday",
    );
  });

  it("formats future offsets", () => {
    expect(formatRelativeTime("2026-08-28T12:00:30Z", now, "en")).toBe(
      "in 30 seconds",
    );
  });

  it("passes through unparseable input", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("not-a-date");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short", 60)).toBe("short");
    expect(truncate("exactly!".slice(0, 8), 8)).toBe("exactly!");
  });

  it("cuts long text and appends an ellipsis", () => {
    const out = truncate("abcdefgh", 5);
    expect(out).toBe("abcd…");
    expect(out.length).toBeLessThanOrEqual(5);
  });
});

describe("shortSha", () => {
  it("cuts to 7 characters", () => {
    expect(shortSha("a8f3d21b9c")).toBe("a8f3d21");
    expect(shortSha("abc")).toBe("abc");
  });
});
