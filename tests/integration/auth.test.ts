import { beforeEach, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { db } from "@/server/db";
import { auditEntries, seedFixture, TEST_PASSWORD, type Fixture } from "./fixtures";

let f: Fixture;

beforeEach(async () => {
  f = await seedFixture();
});

/** Call the real Better Auth HTTP handler (same code path as the browser). */
async function signIn(email: string, password: string): Promise<Response> {
  return getAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password }),
    }),
  );
}

describe("authentication", () => {
  it("signs in an active staff user, creates a DB session and audits the login", async () => {
    const response = await signIn("catalog@test.local", TEST_PASSWORD);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/perfume\.session_token=/);
    const user = await db.user.findUniqueOrThrow({ where: { email: "catalog@test.local" } });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(user.lastLoginAt).not.toBeNull();
    const [login] = await auditEntries("auth.login");
    expect(login?.actorUserId).toBe(user.id);
  });

  it("rejects a wrong password without revealing whether the account exists", async () => {
    const wrongPassword = await signIn("catalog@test.local", "Not-The-Password-1");
    const unknownUser = await signIn("nobody@test.local", "Not-The-Password-1");
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownUser.json());
  });

  it("refuses to create a session for a deactivated account even with the right password", async () => {
    await db.user.update({ where: { email: "catalog@test.local" }, data: { status: "DEACTIVATED" } });
    const response = await signIn("catalog@test.local", TEST_PASSWORD);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("set-cookie") ?? "").not.toMatch(/perfume\.session_token=[^;]+/);
    expect(await db.session.count()).toBe(0);
  });

  it("keeps public sign-up disabled", async () => {
    const response = await getAuth().handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "intruder@example.com", password: "Some-Long-Password-1", name: "Intruder" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await db.user.count({ where: { email: "intruder@example.com" } })).toBe(0);
  });

  it("rejects cross-site sign-in requests (origin check)", async () => {
    const response = await getAuth().handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example", cookie: "perfume.session_token=x" },
        body: JSON.stringify({ email: "catalog@test.local", password: TEST_PASSWORD }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a cookie-bearing request with no origin at all", async () => {
    const response = await getAuth().handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "perfume.session_token=x" },
        body: JSON.stringify({ email: "catalog@test.local", password: TEST_PASSWORD }),
      }),
    );
    expect(response.status).toBe(403);
    expect(f.catalogManager.actor.kind).toBe("user");
  });
});
