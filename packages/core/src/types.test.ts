import { describe, expect, it } from "vitest";
import {
  addServerSchema,
  createProjectSchema,
  updateProjectSchema,
} from "./types";

describe("addServerSchema", () => {
  const base = {
    name: "prod",
    host: "203.0.113.42",
    kind: "ssh",
    username: "root",
    port: 22,
  };

  it("accepts a server without a credential (optional)", () => {
    const parsed = addServerSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it("accepts a multiline private key", () => {
    const parsed = addServerSchema.safeParse({
      ...base,
      credential: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const parsed = addServerSchema.safeParse({ ...base, name: "" });
    expect(parsed.success).toBe(false);
  });
});

describe("createProjectSchema", () => {
  const base = {
    name: "Atlas",
    repository: "acme/atlas",
    branch: "main",
    provider: "github",
  };

  it("accepts a valid project", () => {
    expect(createProjectSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an overlong name", () => {
    const parsed = createProjectSchema.safeParse({
      ...base,
      name: "a".repeat(61),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("requires name and branch but not url", () => {
    expect(
      updateProjectSchema.safeParse({ projectId: "prj_1", name: "A", branch: "main" })
        .success,
    ).toBe(true);
    expect(
      updateProjectSchema.safeParse({ projectId: "prj_1", name: "", branch: "main" })
        .success,
    ).toBe(false);
  });
});
