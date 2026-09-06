// app-backend/shared/entitlements.ts
/**
 * Tek merkezî yetkilendirme (entitlement) kaynağı.
 *
 * NEDEN VAR:
 * `plan === "pro"` tek başına HİÇBİR yerde yeterli değil. 14 günlük deneme
 * `plan = "pro"` + `planSource = "trial"` olarak tutuluyor ve kullanıcıyı Free'ye
 * düşüren şey günde bir çalışan daily-trigger cron'u. Yani deneme 14:00'te bitse
 * bile kullanıcı ertesi sabahki cron'a kadar veritabanında "pro" görünüyordu ve
 * bütün Pro uçları ona Pro davranıyordu (~24 saate kadar bedava uzatma).
 *
 * Cron bir TEMİZLİK işidir, yetkilendirme mekanizması DEĞİLDİR. Bu modül
 * "efektif plan"ı hesaplar: cron hiç çalışmasa bile `trialEndsAt <= now` olan
 * kullanıcı Free kabul edilir.
 *
 * KULLANIM: Pro'ya özel her backend noktası bu helper'ı kullanır —
 * get-articles, update-interests, get-trend-report, weekly-trigger, daily-trigger.
 *
 * VERİ MODELİ (USER#<sub> / PROFILE):
 *   plan             : "free" | "pro"        — kayıtlı (nominal) plan
 *   planSource       : "trial" | "paid"      — canlı planın kaynağı, bitince silinir
 *   trialStartedAt   : ISO                   — deneme başlangıcı, ASLA silinmez
 *   trialEndsAt      : ISO                   — canlı deneme bitişi, bitince silinir
 *   trialConsumedAt  : ISO                   — deneme tüketildi, ASLA silinmez
 *   lsSubscriptionId : string                — varsa gerçek ödeme var
 *
 * `trialStartedAt` / `trialConsumedAt` bilinçli olarak KALICI: eskiden deneme
 * bitince bütün deneme alanları siliniyordu ve backend "denemesini kullanmış
 * Free kullanıcı" ile "hiç deneme görmemiş Free kullanıcı"yı ayırt edemiyordu.
 */

export type Plan        = "free" | "pro";
export type PlanSource  = "trial" | "paid";
export type TrialStatus = "none" | "active" | "expired";

/** DynamoDB'den okunan ham profil alanları (hepsi opsiyonel/unknown). */
export interface EntitlementProfile {
  plan?:             unknown;
  planSource?:       unknown;
  trialEndsAt?:      unknown;
  trialStartedAt?:   unknown;
  trialConsumedAt?:  unknown;
  lsSubscriptionId?: unknown;
}

export interface Entitlement {
  /** EFEKTİF plan — erişim kararlarında kullanılacak tek değer. */
  plan:       Plan;
  /** plan === "pro" kısayolu. */
  isPro:      boolean;
  /** Veritabanındaki nominal plan (cron gecikmesini görmek için). */
  storedPlan: Plan;
  /** Efektif Pro erişiminin kaynağı. */
  source:     PlanSource | null;
  /** Gerçek ödeme var mı (planSource=paid ya da lsSubscriptionId). */
  paid:       boolean;
  trial: {
    status:      TrialStatus;
    /**
     * Bu profil için yeni bir deneme başlatılabilir mi? Yalnızca arayüz içindir:
     * asıl deneme hakkı e-posta seviyesinde TRIAL# defterinde tutulur
     * (bkz. post-confirmation). Mevcut bir hesap için pratikte her zaman false.
     */
    eligible:    boolean;
    startedAt:   string | null;
    endsAt:      string | null;
    consumedAt:  string | null;
    /** Yalnızca status === "active" iken dolu. */
    daysLeft:    number | null;
  };
  /**
   * Kayıtlı plan "pro" ama efektif olarak Free — yani cron henüz düşürmemiş.
   * Bu true iken `expireTrialIfDue` ile tembel (lazy) düşürme yapılabilir.
   */
  needsExpiry: boolean;
}

/**
 * Profil okurken kullanılacak ProjectionExpression parçası.
 * `plan` DynamoDB rezerve kelimesi → ENTITLEMENT_NAMES ile birlikte kullanılmalı.
 */
export const ENTITLEMENT_PROJECTION =
  "#plan, planSource, trialEndsAt, trialStartedAt, trialConsumedAt, lsSubscriptionId";

export const ENTITLEMENT_NAMES: Record<string, string> = { "#plan": "plan" };

/** Scan/Query yapan cron'lar için alan listesi (alias'sız, kendi projeksiyonlarına eklenir). */
export const ENTITLEMENT_FIELDS = [
  "planSource",
  "trialEndsAt",
  "trialStartedAt",
  "trialConsumedAt",
  "lsSubscriptionId",
] as const;

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asEpoch(value: unknown): number | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

// ─── Ana hesaplama ────────────────────────────────────────────────────────────

/**
 * Ham profil kaydından efektif yetkilendirmeyi hesaplar.
 * Saf fonksiyon: I/O yok, test edilebilir, her yerde aynı sonucu verir.
 */
export function resolveEntitlement(
  profile: EntitlementProfile | null | undefined,
  now: number = Date.now(),
): Entitlement {
  const storedPlan: Plan =
    asString(profile?.plan)?.toLowerCase() === "pro" ? "pro" : "free";

  const rawSource = asString(profile?.planSource)?.toLowerCase() ?? null;
  const source: PlanSource | null =
    rawSource === "paid" || rawSource === "trial" ? rawSource : null;

  const hasSubscription = Boolean(asString(profile?.lsSubscriptionId));
  // Ödeme yapmış kullanıcıya ASLA deneme mantığı uygulanmaz. Webhook sırası ters
  // giderse (planSource yazılamadan lsSubscriptionId düşerse) bu ikinci güvence.
  const paid = source === "paid" || hasSubscription;

  const trialStartedAt  = asString(profile?.trialStartedAt);
  const trialEndsAt     = asString(profile?.trialEndsAt);
  const trialConsumedAt = asString(profile?.trialConsumedAt);
  const endsAtEpoch     = asEpoch(trialEndsAt);

  const trialActive =
    !paid && source === "trial" && endsAtEpoch !== null && endsAtEpoch > now;

  // Efektif Pro:
  //  - Ödeme varsa kayıtlı plana güven (webhook yönetir).
  //  - Ödeme yoksa: kayıtlı plan "pro" OLMALI ve süresi geçmiş bir deneme
  //    OLMAMALI. Süresi geçmiş `trialEndsAt` planSource silinmiş olsa bile
  //    erişimi kapatır — savunmacı davranış bilinçli.
  const isPro = paid
    ? storedPlan === "pro"
    : storedPlan === "pro" &&
      (source !== "trial" || trialActive) &&
      !(endsAtEpoch !== null && endsAtEpoch <= now);

  let status: TrialStatus;
  if (trialActive) {
    status = "active";
  } else if (trialConsumedAt || trialStartedAt || trialEndsAt) {
    status = "expired";
  } else {
    status = "none";
  }

  const daysLeft =
    trialActive && endsAtEpoch !== null
      ? Math.max(1, Math.ceil((endsAtEpoch - now) / 86_400_000))
      : null;

  return {
    plan:       isPro ? "pro" : "free",
    isPro,
    storedPlan,
    source:     isPro ? source : null,
    paid,
    trial: {
      status,
      eligible:   status === "none" && !paid,
      startedAt:  trialStartedAt,
      endsAt:     trialEndsAt,
      consumedAt: trialConsumedAt,
      daysLeft,
    },
    needsExpiry: storedPlan === "pro" && !isPro,
  };
}

/** API yanıtlarında dönen sadeleştirilmiş deneme bloğu. */
export function trialResponse(entitlement: Entitlement) {
  return {
    status:     entitlement.trial.status,
    eligible:   entitlement.trial.eligible,
    endsAt:     entitlement.trial.endsAt,
    startedAt:  entitlement.trial.startedAt,
    consumedAt: entitlement.trial.consumedAt,
    daysLeft:   entitlement.trial.daysLeft,
  };
}

// ─── Tembel (lazy) deneme sonlandırma ─────────────────────────────────────────

/**
 * İhtiyaç duyulan minimal DynamoDB doküman istemcisi arayüzü.
 * `any` bilinçli: bu modül @aws-sdk'ye bağımlı olmasın (saf ve test edilebilir kalsın),
 * çağıran taraf kendi istemcisini geçsin.
 */
interface DocClientLike {
  send(command: any): Promise<any>;
}

/** UpdateCommand sınıfı çağıran taraftan geçirilir (bundle'ı şişirmemek için). */
interface UpdateCommandCtor {
  new (input: any): any;
}

export interface ExpireTrialInput {
  dynamo:         DocClientLike;
  UpdateCommand:  UpdateCommandCtor;
  tableName:      string;
  userId:         string;
  entitlement:    Entitlement;
  /** true ise trial-ended e-postası için bayrak bırakılır (daily-trigger gönderir). */
  flagEmail?:     boolean;
}

/**
 * Süresi dolmuş denemeyi ANINDA veritabanına yansıtır (self-healing).
 *
 * Yetkilendirme zaten `resolveEntitlement` ile yapılıyor; bu yazma yalnızca
 * kaydı gerçeğe hizalar. Bu yüzden BEST-EFFORT: hata durumunda istek akışı
 * bozulmaz, en kötü ihtimalle cron ertesi sabah aynı işi yapar.
 *
 * `trialEndedEmailPending` bayrağı: tembel düşürme cron'un koşullu yazmasını
 * başarısız kılar, dolayısıyla "deneme bitti" e-postası kaybolurdu. Bayrağı
 * daily-trigger görüp e-postayı gönderiyor ve bayrağı temizliyor.
 *
 * @returns Kayıt gerçekten düşürüldüyse true.
 */
export async function expireTrialIfDue(input: ExpireTrialInput): Promise<boolean> {
  const { dynamo, UpdateCommand, tableName, userId, entitlement, flagEmail = true } = input;

  if (!entitlement.needsExpiry) return false;

  const nowIso = new Date().toISOString();

  const sets = [
    "#plan = :free",
    "updatedAt = :now",
    // Deneme geçmişi KALICI: bir daha deneme verilmeyecek kullanıcıyı ayırt eder.
    "trialConsumedAt = if_not_exists(trialConsumedAt, :now)",
  ];
  if (flagEmail) sets.push("trialEndedEmailPending = :true");

  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
        // interests/subTopics temizleniyor: Free planda konu seçimi yok, kayıtta
        // kalan seçimler Interests sayfasında "seçili ama işlevsiz" görünüyordu.
        UpdateExpression: `SET ${sets.join(", ")} REMOVE planSource, trialEndsAt, interests, subTopics`,
        // Ödeme yapmış kullanıcıya ASLA dokunma; ayrıca yalnızca gerçekten
        // süresi geçmiş denemeler düşürülür (ISO string karşılaştırması UTC'de doğru).
        ConditionExpression:
          "#planSource = :trial AND attribute_not_exists(lsSubscriptionId) AND trialEndsAt <= :nowIso",
        ExpressionAttributeNames: { "#plan": "plan", "#planSource": "planSource" },
        ExpressionAttributeValues: {
          ":free":   "free",
          ":trial":  "trial",
          ":now":    nowIso,
          ":nowIso": nowIso,
          ...(flagEmail ? { ":true": true } : {}),
        },
      }),
    );
    console.log(`Trial lazily expired for user=${userId}`);
    return true;
  } catch (err: any) {
    // Başka bir istek/cron zaten düşürmüş ya da koşul tutmuyor — normal.
    if (err?.name === "ConditionalCheckFailedException") return false;
    // IAM henüz güncellenmemişse akışı durdurma: okuma tarafındaki kontrol
    // (resolveEntitlement) erişimi zaten kapatmış durumda.
    console.warn(`Lazy trial expiry failed for user=${userId} (non-fatal):`, err?.name ?? err);
    return false;
  }
}
