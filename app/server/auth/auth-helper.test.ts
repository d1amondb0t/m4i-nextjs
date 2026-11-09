import { describe, expect, it } from "vitest";

import {
  collectionForUser,
  generateAccessCode,
  hashAccessCode,
} from "./access-code-helper";
import { signSession, verifySession } from "./session-helper";

describe("access codes", () => {
  it("are three groups of four unambiguous characters", () => {
    const code = generateAccessCode();

    expect(code).toMatch(
      /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/,
    );
  });

  it("hash the same regardless of case, spaces and dashes", () => {
    expect(hashAccessCode("abcd efgh-jkmn")).toBe(
      hashAccessCode("ABCD-EFGH-JKMN"),
    );
  });

  it("derive a Qdrant-safe collection from the user name", () => {
    expect(collectionForUser("  Zoë O'Neil ")).toBe("m4i_zoe_o_neil");
    expect(() => collectionForUser("!!")).toThrow(/letter or digit/);
  });
});

describe("sessions", () => {
  it("verify only cookies signed with the same secret", () => {
    const cookie = signSession(7, "secret");

    expect(verifySession(cookie, "secret")).toBe(7);
    expect(verifySession(cookie, "other")).toBeNull();
    expect(verifySession(cookie.replace(/^7/, "8"), "secret")).toBeNull();
    expect(verifySession(undefined, "secret")).toBeNull();
    expect(verifySession("garbage", "secret")).toBeNull();
  });
});
