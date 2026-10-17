// app-backend/lambdas/essays/get-body/core.ts
//
// GET /essays/{slug}/body — kilitli deneme bölümünün erişim kararı.
//
// Kurallar (ürün kararı, değişmez):
//   access "free"                      → herkese tam metin
//   access "pro" + yayından ≤ 7 gün     → herkese tam metin (pencere SUNUCUDA hesaplanır)
//   access "pro" + 7 gün dolmuş         → geçerli JWT + resolveEntitlement().isPro (deneme dahil)
//                                         değilse 403 { locked: true }
//
// Bu dosya AWS'ye bağımlı değildir: tüm G/Ç `Deps` ile içeri verilir, böylece
// birim testleri gerçek kararı mock'larla sınar (tests/unit/essay-body.test.ts).

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { resolveEntitlement, type Entitlement, type EntitlementProfile } from "../../../shared/entitlements";

export const FREE_WINDOW_DAYS = 7;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Private bucket'taki kayıt (app-frontend/scripts/essays/build.mjs üretir). */
export interface EssayBodyRecord {
  slug: string;
  access: "free" | "pro";
  /** "YYYY-MM-DD" */
  date: string;
  blocks: unknown[];
}

export interface Deps {
  /** Kayıt yoksa null. */
  loadBody(slug: string): Promise<EssayBodyRecord | null>;
  /** Geçerli Cognito access token → sub. Geçersizse hata fırlatır. */
  verifyToken(token: string): Promise<string>;
  /** DynamoDB profili (ENTITLEMENT alanları); yoksa null. */
  loadProfile(userId: string): Promise<EntitlementProfile | null>;
  /** Süresi geçmiş denemeyi kayda yansıtma (best-effort, opsiyonel). */
  expireTrial?(userId: string, entitlement: Entitlement): Promise<void>;
  now(): number;
}

export function freeWindowEndsAt(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) + FREE_WINDOW_DAYS * 86_400_000;
}

export function isOpenToEveryone(record: Pick<EssayBodyRecord, "access" | "date">, now: number): boolean {
  if (record.access === "free") return true;
  const ends = freeWindowEndsAt(record.date);
  // Tarih okunamıyorsa kapalı say: hata durumunda içerik açılmasın.
  return Number.isFinite(ends) && now < ends;
}

const HEADERS = {
  "Content-Type": "application/json",
  // Yetkili yanıtlar kişiye özel: CDN ya da paylaşılan önbellekte tutulmamalı.
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Origin",
};

function json(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResultV2 {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

function bearer(event: APIGatewayProxyEventV2): string | null {
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (k.toLowerCase() === "authorization" && v) {
      const m = v.match(/^Bearer\s+(.+)$/i);
      return m ? m[1].trim() : null;
    }
  }
  return null;
}

export function createHandler(deps: Deps) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const method = event.requestContext?.http?.method?.toUpperCase() ?? "GET";
    if (method !== "GET") return json(405, { message: "Method not allowed" });

    const slug = event.pathParameters?.slug ?? "";
    if (!SLUG_RE.test(slug)) return json(404, { message: "Essay not found" });

    let record: EssayBodyRecord | null;
    try {
      record = await deps.loadBody(slug);
    } catch (err) {
      console.error(`essay-body: load failed for ${slug}`, err);
      return json(500, { message: "Could not load essay" });
    }
    if (!record) return json(404, { message: "Essay not found" });

    const now = deps.now();
    const result = { slug, blocks: record.blocks };

    if (isOpenToEveryone(record, now)) {
      return json(200, { ...result, access: record.access, reason: record.access === "free" ? "free" : "free_window" });
    }

    const token = bearer(event);
    if (!token) return json(403, { locked: true, reason: "auth_required" });

    let userId: string;
    try {
      userId = await deps.verifyToken(token);
    } catch {
      return json(401, { locked: true, reason: "invalid_token" });
    }

    let profile: EntitlementProfile | null;
    try {
      profile = await deps.loadProfile(userId);
    } catch (err) {
      console.error(`essay-body: profile load failed for ${userId}`, err);
      return json(500, { message: "Could not verify your plan" });
    }

    // Pro kararı HER ZAMAN resolveEntitlement ile: plan alanına doğrudan bakılmaz.
    // Deneme süresindeki kullanıcı (planSource "trial") da efektif Pro'dur.
    const entitlement = resolveEntitlement(profile, now);
    if (entitlement.needsExpiry && deps.expireTrial) {
      await deps.expireTrial(userId, entitlement).catch(() => undefined);
    }

    if (entitlement.isPro) {
      return json(200, { ...result, access: record.access, reason: entitlement.source === "trial" ? "trial" : "pro" });
    }
    return json(403, { locked: true, reason: "pro_required" });
  };
}
