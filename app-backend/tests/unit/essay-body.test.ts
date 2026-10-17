// app-backend/tests/unit/essay-body.test.ts
//
// GET /essays/{slug}/body erişim kararı — birim testleri (node:test).
// Çalıştırma: npm test  (scripts/test.mjs esbuild ile paketleyip node --test çalıştırır)

import { test } from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { createHandler, type Deps, type EssayBodyRecord } from "../../lambdas/essays/get-body/core";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-20T12:00:00Z");
const BLOCKS = [{ type: "p", text: "The locked remainder of the essay." }];

const ESSAYS: Record<string, EssayBodyRecord> = {
  "free-essay": { slug: "free-essay", access: "free", date: "2026-01-01", blocks: BLOCKS },
  // 2026-10-17 00:00Z + 7 gün = 2026-10-24 → NOW pencere içinde
  "fresh-pro": { slug: "fresh-pro", access: "pro", date: "2026-10-17", blocks: BLOCKS },
  // 2026-10-01 + 7 gün = 2026-10-08 → NOW pencere dışında
  "old-pro": { slug: "old-pro", access: "pro", date: "2026-10-01", blocks: BLOCKS },
};

const TOKENS: Record<string, string> = {
  "token-free": "user-free",
  "token-trial": "user-trial",
  "token-paid": "user-paid",
  "token-expired-trial": "user-expired-trial",
  "token-no-profile": "user-missing",
};

const PROFILES: Record<string, Record<string, unknown>> = {
  "user-free": { plan: "free", trialStartedAt: "2026-08-01T00:00:00Z", trialConsumedAt: "2026-08-15T00:00:00Z" },
  "user-trial": {
    plan: "pro",
    planSource: "trial",
    trialStartedAt: new Date(NOW - 3 * DAY).toISOString(),
    trialEndsAt: new Date(NOW + 11 * DAY).toISOString(),
  },
  "user-paid": { plan: "pro", planSource: "paid", subscriptionId: "sub_123" },
  "user-expired-trial": {
    plan: "pro",
    planSource: "trial",
    trialStartedAt: new Date(NOW - 15 * DAY).toISOString(),
    trialEndsAt: new Date(NOW - 1 * DAY).toISOString(),
  },
};

function makeDeps(overrides: Partial<Deps> = {}) {
  const calls = { verify: 0, profile: 0, expire: [] as string[] };
  const deps: Deps = {
    loadBody: async (slug) => ESSAYS[slug] ?? null,
    verifyToken: async (token) => {
      calls.verify++;
      const sub = TOKENS[token];
      if (!sub) throw new Error("invalid token");
      return sub;
    },
    loadProfile: async (userId) => {
      calls.profile++;
      return PROFILES[userId] ?? null;
    },
    expireTrial: async (userId) => {
      calls.expire.push(userId);
    },
    now: () => NOW,
    ...overrides,
  };
  return { deps, calls };
}

function event(slug: string, token?: string): APIGatewayProxyEventV2 {
  return {
    pathParameters: { slug },
    headers: token ? { authorization: `Bearer ${token}` } : {},
    requestContext: { http: { method: "GET" } },
  } as unknown as APIGatewayProxyEventV2;
}

async function call(slug: string, token?: string, overrides?: Partial<Deps>) {
  const { deps, calls } = makeDeps(overrides);
  const res = (await createHandler(deps)(event(slug, token))) as APIGatewayProxyStructuredResultV2;
  return { res, body: JSON.parse(String(res.body)), calls };
}

test("free essay → full text for a guest", async () => {
  const { res, body, calls } = await call("free-essay");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(body.blocks, BLOCKS);
  assert.equal(calls.verify, 0, "no token check needed");
});

test("pro essay within 7 days → full text for a guest", async () => {
  const { res, body } = await call("fresh-pro");
  assert.equal(res.statusCode, 200);
  assert.equal(body.reason, "free_window");
  assert.deepEqual(body.blocks, BLOCKS);
});

test("pro essay after 7 days → guest is locked out", async () => {
  const { res, body } = await call("old-pro");
  assert.equal(res.statusCode, 403);
  assert.deepEqual(body, { locked: true, reason: "auth_required" });
});

test("pro essay after 7 days → signed-in Free user is locked out", async () => {
  const { res, body } = await call("old-pro", "token-free");
  assert.equal(res.statusCode, 403);
  assert.deepEqual(body, { locked: true, reason: "pro_required" });
});

test("pro essay after 7 days → trial user gets full text", async () => {
  const { res, body } = await call("old-pro", "token-trial");
  assert.equal(res.statusCode, 200);
  assert.equal(body.reason, "trial");
  assert.deepEqual(body.blocks, BLOCKS);
});

test("pro essay after 7 days → paid Pro user gets full text", async () => {
  const { res, body } = await call("old-pro", "token-paid");
  assert.equal(res.statusCode, 200);
  assert.equal(body.reason, "pro");
  assert.deepEqual(body.blocks, BLOCKS);
});

test("pro essay after 7 days → expired trial is locked out and the trial is expired lazily", async () => {
  const { res, body, calls } = await call("old-pro", "token-expired-trial");
  assert.equal(res.statusCode, 403);
  assert.deepEqual(body, { locked: true, reason: "pro_required" });
  assert.deepEqual(calls.expire, ["user-expired-trial"]);
});

// ─── Ek güvenlik ve kenar durumları ──────────────────────────────────────────

test("the 7-day window is computed on the server from the stored date", async () => {
  // Tam 7. günün sonunda (pencere biter) → kilitli; bir milisaniye önce → açık.
  const end = Date.parse("2026-10-17T00:00:00Z") + 7 * DAY;
  const open = await call("fresh-pro", undefined, { now: () => end - 1 });
  const closed = await call("fresh-pro", undefined, { now: () => end });
  assert.equal(open.res.statusCode, 200);
  assert.equal(closed.res.statusCode, 403);
});

test("invalid or expired token → 401 locked (client retries as guest)", async () => {
  const { res, body } = await call("old-pro", "forged-token");
  assert.equal(res.statusCode, 401);
  assert.deepEqual(body, { locked: true, reason: "invalid_token" });
});

test("valid token without a profile → locked", async () => {
  const { res, body } = await call("old-pro", "token-no-profile");
  assert.equal(res.statusCode, 403);
  assert.equal(body.reason, "pro_required");
});

test("plan field alone does not unlock: stale 'pro' with an expired trial stays locked", async () => {
  const { res } = await call("old-pro", "token-expired-trial", { expireTrial: undefined });
  assert.equal(res.statusCode, 403);
});

test("unknown or malformed slug → 404, nothing loaded for bad slugs", async () => {
  let loaded = 0;
  const loadBody = async () => {
    loaded++;
    return null;
  };
  assert.equal((await call("missing-essay", undefined, { loadBody })).res.statusCode, 404);
  assert.equal((await call("../etc/passwd", undefined, { loadBody })).res.statusCode, 404);
  assert.equal(loaded, 1, "path-like slug never reaches S3");
});

test("every response is private and not cacheable by a CDN", async () => {
  for (const [slug, token] of [["free-essay", undefined], ["old-pro", "token-paid"], ["old-pro", undefined]] as const) {
    const { res } = await call(slug, token);
    assert.equal(res.headers?.["Cache-Control"], "private, no-store");
  }
});

test("unparseable date in a pro record fails closed", async () => {
  const loadBody = async () => ({ slug: "bad-date", access: "pro" as const, date: "not-a-date", blocks: BLOCKS });
  const { res } = await call("bad-date", undefined, { loadBody });
  assert.equal(res.statusCode, 403);
});
