// app-backend/shared/trial-ledger.ts
/**
 * E-posta seviyesinde deneme hakkı defteri (entitlement ledger).
 *
 * NEDEN VAR:
 * Deneme geçmişi yalnızca USER#<sub>/PROFILE kaydında tutulduğunda hesap silinince
 * o kayıt da gidiyordu. Kullanıcı hesabını silip aynı e-posta ile yeniden kayıt
 * olunca PostConfirmation onu TAMAMEN yeni bir kullanıcı olarak görüyor ve
 * 14 günlük denemeyi baştan veriyordu. Sınırsız deneme.
 *
 * ÇÖZÜM:
 * Deneme hakkı kullanıcıdan BAĞIMSIZ ayrı bir kayıtta tutulur:
 *
 *   PK = TRIAL#<HMAC-SHA256(server-secret, normalized-email)>
 *   SK = LEDGER
 *
 * Kayıt koşullu yazma (`attribute_not_exists(PK)`) ile "claim" edilir: aynı
 * e-posta için ikinci kez yazma başarısız olur → deneme verilmez.
 *
 * GİZLİLİK:
 * Hesap silindikten sonra elde yalnızca bu parmak izi kalır, düz metin e-posta
 * DEĞİL. Anahtarsız SHA-256 yetersiz olurdu: bilinen bir e-postanın defterde
 * olup olmadığı denenerek bulunabilirdi. Sunucu tarafı gizli anahtarla HMAC bunu
 * engeller. Saklama süresi TRIAL_LEDGER_RETENTION_DAYS ile ayarlanır (0 =
 * süresiz; DynamoDB TTL `ttl` alanı üzerinden çalışır).
 *
 * SINIRLARI:
 * Farklı e-posta adresleriyle yapılan kötüye kullanım kredi kartı istemeyen bir
 * üründe %100 engellenemez. Bu defter "aynı kişi, aynı adres" senaryosunu kapatır;
 * gerisi soft-abuse prevention konusudur.
 */

import { createHmac } from "crypto";

export const TRIAL_LEDGER_SK = "LEDGER";

// ─── E-posta normalizasyonu ───────────────────────────────────────────────────

/**
 * Küçük harfe çevirir, boşluk kırpar; alias varyantlarını tek biçime indirger.
 *
 * `strictAlias = true` iken:
 *   - `+etiket` kısmı atılır (en ucuz kötüye kullanım yolu)
 *   - gmail/googlemail için local part'taki noktalar atılır (Google onları yok sayar)
 *
 * Yanlış pozitif riski bilinçli kabul ediliyor: gerçekten `+` adresi kullanan yeni
 * bir kullanıcı deneme alamayabilir — Free planla başlar, ürün çalışmaya devam eder.
 * Gerekirse TRIAL_LEDGER_STRICT_ALIAS=false ile kapatılabilir.
 */
export function normalizeEmail(email: string, strictAlias = true): string {
  const trimmed = String(email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  let local  = trimmed.slice(0, at);
  const host = trimmed.slice(at + 1);

  if (strictAlias) {
    const plus = local.indexOf("+");
    if (plus > 0) local = local.slice(0, plus);
    if (host === "gmail.com" || host === "googlemail.com") {
      local = local.replace(/\./g, "");
    }
  }

  return `${local}@${host}`;
}

/** TRIAL#<hmac> anahtarını üretir. Secret boşsa hata: sessizce zayıf anahtar kullanma. */
export function trialLedgerPK(email: string, secret: string, strictAlias = true): string {
  if (!secret) throw new Error("TRIAL_LEDGER_SECRET is not configured");
  const digest = createHmac("sha256", secret)
    .update(normalizeEmail(email, strictAlias))
    .digest("hex");
  return `TRIAL#${digest}`;
}

// ─── Claim ────────────────────────────────────────────────────────────────────

interface DocClientLike {
  send(command: any): Promise<any>;
}
interface CommandCtor {
  new (input: any): any;
}

export interface ClaimTrialInput {
  dynamo:        DocClientLike;
  PutCommand:    CommandCtor;
  GetCommand:    CommandCtor;
  tableName:     string;
  email:         string;
  userId:        string;
  secret:        string;
  /** 0 → süresiz sakla. >0 → DynamoDB TTL ile bu kadar gün sonra silinir. */
  retentionDays?: number;
  strictAlias?:   boolean;
}

export interface ClaimTrialResult {
  /** true → denemeyi bu kayıt için VER. false → bu e-posta hakkını daha önce kullanmış. */
  granted:            boolean;
  /** Defterdeki ilk deneme tarihi (granted=false iken bilgi amaçlı). */
  firstTrialStartedAt?: string;
  /** Defter devre dışı/erişilemez (secret yok, IAM yok vb.). */
  degraded?:          boolean;
}

/**
 * Deneme hakkını koşullu yazma ile talep eder.
 *
 * Yazma yarışında yalnızca BİR çağrı başarılı olur; ikinci çağrı
 * ConditionalCheckFailedException alır ve granted=false döner.
 *
 * DEGRADED MOD: secret yapılandırılmamışsa ya da DynamoDB yazımı beklenmedik bir
 * hatayla düşerse `granted: true, degraded: true` döner. Gerekçe: kayıt akışını
 * kırıp yeni kullanıcıyı kapıda bırakmak, nadir bir tekrar-deneme riskinden daha
 * kötü. Bu durum yüksek sesle loglanır.
 */
export async function claimTrial(input: ClaimTrialInput): Promise<ClaimTrialResult> {
  const {
    dynamo, PutCommand, GetCommand, tableName, email, userId, secret,
    retentionDays = 0, strictAlias = true,
  } = input;

  if (!secret) {
    console.error("CRITICAL: TRIAL_LEDGER_SECRET missing — trial abuse guard is DISABLED");
    return { granted: true, degraded: true };
  }

  let pk: string;
  try {
    pk = trialLedgerPK(email, secret, strictAlias);
  } catch (err) {
    console.error("CRITICAL: trial ledger key derivation failed:", err);
    return { granted: true, degraded: true };
  }

  const nowIso = new Date().toISOString();
  const item: Record<string, unknown> = {
    PK: pk,
    SK: TRIAL_LEDGER_SK,
    firstTrialStartedAt: nowIso,
    lastUserId:          userId,
    updatedAt:           nowIso,
  };
  if (retentionDays > 0) {
    item.ttl = Math.floor(Date.now() / 1000) + retentionDays * 24 * 60 * 60;
  }

  try {
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return { granted: true };
  } catch (err: any) {
    if (err?.name !== "ConditionalCheckFailedException") {
      console.error("CRITICAL: trial ledger claim failed unexpectedly:", err);
      return { granted: true, degraded: true };
    }
  }

  // Defterde kayıt var. İki ihtimal:
  //  (a) Kayıt BU kullanıcıya ait → PostConfirmation retry'ı. İlk denemede defter
  //      yazıldı ama profil yazımı düşmüş olabilir; burada granted=false dönmek
  //      kullanıcıyı hak ettiği denemeden ederdi. Aynı sub ise deneme verilir.
  //  (b) Kayıt BAŞKA bir kullanıcıya ait → hesap silinip aynı e-posta ile
  //      yeniden kayıt olunmuş. Deneme YOK.
  let firstTrialStartedAt: string | undefined;
  let lastUserId: string | undefined;
  try {
    const existing = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: pk, SK: TRIAL_LEDGER_SK },
        ProjectionExpression: "firstTrialStartedAt, lastUserId",
      }),
    );
    const startedAt = existing?.Item?.firstTrialStartedAt;
    const owner     = existing?.Item?.lastUserId;
    if (typeof startedAt === "string") firstTrialStartedAt = startedAt;
    if (typeof owner === "string")     lastUserId = owner;
  } catch (err) {
    console.warn("Trial ledger read-back failed (non-fatal):", err);
  }

  if (lastUserId && lastUserId === userId) {
    console.log(`Trial ledger already claimed by the same user=${userId} (retry) — granting`);
    return { granted: true, firstTrialStartedAt };
  }

  return { granted: false, firstTrialStartedAt };
}
