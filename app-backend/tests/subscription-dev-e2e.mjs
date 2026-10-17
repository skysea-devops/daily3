// app-backend/tests/subscription-dev-e2e.mjs
/**
 * DEV subscription state-machine regression.
 *
 * NE TEST EDIYOR:
 *   signup → trial → (cron'suz) expiry → free → paid upgrade → expire →
 *   hesap silme → ayni e-posta ile yeniden kayit (deneme YOK)
 *
 * NEDEN VAR:
 * Abonelik mantigi uc ayri yerde yasiyor — PostConfirmation, Polar
 * webhook'u ve gunluk cron. Bunlarin arasindaki gecisler unit test ile
 * yakalanmiyor; en pahali hatalar (deneme bitmis kullanicinin Pro kalmasi,
 * hesap silip yeniden kayitla sinirsiz deneme) tam olarak bu gecislerde cikti.
 *
 * TASARIM NOTLARI:
 *
 * 1) EXPIRY CRON UZERINDEN TEST EDILMIYOR.
 *    daily-trigger'i invoke etmek DEV'deki BUTUN kullanicilarin denemesini
 *    dusurur ve hepsine e-posta gonderir. Bunun yerine `trialEndsAt` dogrudan
 *    gecmise cekiliyor ve API cagriliyor: ayni `expireTrialIfDue` helper'i
 *    calisiyor, deterministik ve yan etkisiz.
 *
 * 2) TEARDOWN'DA DENEME DEFTERI SILINMEK ZORUNDA.
 *    TRIAL#<hmac(email)> kaydi hesap silinse bile kalir — urunun amaci bu. Ama
 *    test sabit bir e-posta kullandigi icin temizlenmezse IKINCI kosuda deneme
 *    verilmez ve testler kalici olarak kirmiziya duser. Bu yuzden cleanup hem
 *    basta hem `finally` icinde calisiyor.
 *
 * 3) SADECE DEV. Tablo adinda "-dev-" gecmiyorsa test bilerek reddediyor.
 *
 * Gerekli env: SUBSCRIPTION_E2E_USER_POOL_ID, SUBSCRIPTION_E2E_CLIENT_ID,
 * SUBSCRIPTION_E2E_API_BASE_URL, SUBSCRIPTION_E2E_USERS_TABLE_NAME,
 * SUBSCRIPTION_E2E_EMAIL, POLAR_WEBHOOK_SECRET, TRIAL_LEDGER_SECRET.
 *
 * POLAR_WEBHOOK_SECRET workflow'da SSM'den (/cogletta/dev/polar/webhook-secret)
 * okunur — Lambda'nin dogruladigi degerin ta kendisi.
 *
 * Hesap silme senaryosu Polar API'sine gercekten gider (aktif abonelik listesi):
 * dev'de SSM'deki Polar SANDBOX access token'i gecerli olmali.
 */

import { createHmac, randomUUID } from "crypto";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  InitiateAuthCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

// ─── Yapilandirma ─────────────────────────────────────────────────────────────

const REGION       = process.env.AWS_REGION ?? "eu-central-1";
const USER_POOL_ID = required("SUBSCRIPTION_E2E_USER_POOL_ID");
const CLIENT_ID    = required("SUBSCRIPTION_E2E_CLIENT_ID");
const API_BASE_URL = required("SUBSCRIPTION_E2E_API_BASE_URL").replace(/\/$/, "");
const USERS_TABLE  = required("SUBSCRIPTION_E2E_USERS_TABLE_NAME");
const EMAIL        = required("SUBSCRIPTION_E2E_EMAIL");

const ARTICLES_TABLE =
  process.env.SUBSCRIPTION_E2E_ARTICLES_TABLE_NAME ?? USERS_TABLE.replace(/-users$/, "-articles");

const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET ?? "";
// Lambda bu degeri TRIAL_LEDGER_SECRET adiyla goruyor; workflow ikisini de veriyor.
const TRIAL_SECRET      = process.env.TRIAL_LEDGER_SECRET ?? process.env.TRIAL_IDENTITY_HMAC_SECRET ?? "";
const STRICT_ALIAS      = (process.env.TRIAL_LEDGER_STRICT_ALIAS ?? "true") !== "false";

// Sifre politikasi: min 8, buyuk+kucuk+rakam (cognito.tf).
const PASSWORD = `E2e-${randomUUID().replace(/-/g, "").slice(0, 16)}A1`;

// ─── Kosuya ozel e-posta etiketleri ───────────────────────────────────────────
//
// NEDEN SABIT E-POSTA KULLANMIYORUZ:
// Cognito ListUsers EVENTUALLY CONSISTENT — yeni olusturulmus bir kullanici
// dakikalarca aramada gorunmeyebilir. SignUp ise anlik ve tutarli. Sabit bir
// e-postada onceki kosudan kalan bir kullaniciyi cleanup bulamayip geciyor,
// hemen ardindan SignUp UsernameExistsException atiyordu. Arama sonucuna
// guvenilemez.
//
// Cozum: her kosu kendi `+etiket` adresini kullanir → Cognito'da asla cakisma
// olmaz. Deneme defteri ise etiketleri soyuyor (normalizeEmail), dolayisiyla
// her iki adres de AYNI TRIAL# anahtarina dusuyor. Bu, 8. senaryoyu
// zayiflatmak yerine GUCLENDIRIYOR: artik "ayni string" degil, "ayni kisi,
// farkli alias" senaryosunu test ediyoruz.
const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

function emailWithTag(email, tag) {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}+${tag}@${email.slice(at + 1)}`;
}

/** Cognito'da bu on eki tasiyan her sey test artigidir. */
const E2E_TAG_PREFIX = "e2e-";
const SIGNUP_EMAIL_A = emailWithTag(EMAIL, `${E2E_TAG_PREFIX}${RUN_ID}a`);
const SIGNUP_EMAIL_B = emailWithTag(EMAIL, `${E2E_TAG_PREFIX}${RUN_ID}b`);

/** Olusturdugumuz kullanicilar — teardown aramaya GUVENMEDEN bunlari siler. */
const createdUsers = [];

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const dynamo  = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

// PROD'a yanlislikla dogrultulmaya karsi sert kapi.
if (!USERS_TABLE.includes("-dev-")) {
  console.error(`Refusing to run: ${USERS_TABLE} does not look like a DEV table`);
  process.exit(1);
}
if (!POLAR_WEBHOOK_SECRET) {
  console.error("Missing POLAR_WEBHOOK_SECRET — webhook scenarios cannot be signed. Refusing to start.");
  process.exit(1);
}
if (!TRIAL_SECRET) {
  console.error("Missing TRIAL_LEDGER_SECRET — teardown could not clear the trial ledger,");
  console.error("which would make every subsequent run fail. Refusing to start.");
  process.exit(1);
}
// Kosuya ozel `+etiket` adresleri yalnizca etiket soyuluyorsa ayni deneme
// hakkina dusuyor. STRICT_ALIAS kapaliysa 8. senaryo anlamsizlasir.
if (!STRICT_ALIAS) {
  console.error("TRIAL_LEDGER_STRICT_ALIAS=false — this test relies on +tag stripping.");
  console.error("Set it to true, or the re-signup scenario cannot be verified.");
  process.exit(1);
}

// ─── Kucuk test kosumu ────────────────────────────────────────────────────────

let passed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n─── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Deneme defteri anahtari ──────────────────────────────────────────────────
//
// DIKKAT: app-backend/shared/trial-ledger.ts icindeki normalizeEmail() ile AYNI
// olmak zorunda. Orasi degisirse burasi da degismeli, yoksa teardown yanlis
// anahtari siler ve testler ikinci kosuda kirmiziya duser.

function normalizeEmail(email, strictAlias = true) {
  const trimmed = String(email ?? "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  const host = trimmed.slice(at + 1);

  if (strictAlias) {
    const plus = local.indexOf("+");
    if (plus > 0) local = local.slice(0, plus);
    if (host === "gmail.com" || host === "googlemail.com") local = local.replace(/\./g, "");
  }
  return `${local}@${host}`;
}

function trialLedgerPK(email) {
  const digest = createHmac("sha256", TRIAL_SECRET)
    .update(normalizeEmail(email, STRICT_ALIAS))
    .digest("hex");
  return `TRIAL#${digest}`;
}

// ─── AWS yardimcilari ─────────────────────────────────────────────────────────

async function getProfile(userId) {
  const res = await dynamo.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    ConsistentRead: true,
  }));
  return res.Item ?? null;
}

async function patchProfile(userId, updateExpression, values = {}, names) {
  // DynamoDB BOS ExpressionAttributeValues kabul etmiyor (ValidationException).
  // Saf REMOVE ifadelerinde deger olmadigi icin alan tamamen atlanmali.
  const hasValues = values && Object.keys(values).length > 0;
  await dynamo.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    UpdateExpression: updateExpression,
    ...(hasValues ? { ExpressionAttributeValues: values } : {}),
    ...(names ? { ExpressionAttributeNames: names } : {}),
  }));
}

/**
 * E-postaya karsilik gelen TUM Cognito kullanicilarini dondurur.
 *
 * NEDEN AdminGetUser DEGIL:
 * Pool'da `username_attributes = ["email"]` — yani gercek Username otomatik
 * uretilen bir UUID, e-posta ise alias. Alias YALNIZCA kullanici confirm
 * edildikten sonra cozulur. UNCONFIRMED bir kullanicida AdminGetUser(email)
 * UserNotFoundException verir; cleanup "yok" sanip gecer, SignUp ise
 * UsernameExistsException atar ve test kalici olarak kirilir.
 * ListUsers + email filtresi UNCONFIRMED kullanicilari da bulur ve admin
 * cagrilari icin gereken gercek Username'i verir.
 */
async function findCognitoUsers(email) {
  const res = await cognito.send(new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Filter: `email = "${email}"`,
    Limit: 60,
  }));
  return (res.Users ?? []).map((u) => ({
    username: u.Username,
    sub: u.Attributes?.find((a) => a.Name === "sub")?.Value ?? u.Username,
    status: u.UserStatus,
  }));
}

/** Tek bir kullaniciya ait tum kayitlari siler. */
async function purgeUser({ username, sub }) {
  let lastKey;
  do {
    const page = await dynamo.send(new QueryCommand({
      TableName: ARTICLES_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `USER#${sub}` },
      ProjectionExpression: "PK, SK",
      ExclusiveStartKey: lastKey,
    }));
    for (const item of page.Items ?? []) {
      await dynamo.send(new DeleteCommand({
        TableName: ARTICLES_TABLE,
        Key: { PK: item.PK, SK: item.SK },
      }));
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  await dynamo.send(new DeleteCommand({
    TableName: USERS_TABLE,
    Key: { PK: `USER#${sub}`, SK: "PROFILE" },
  }));

  try {
    // Admin cagrisinda ALIAS degil gercek Username kullanilmali.
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    }));
  } catch (err) {
    if (err?.name !== "UserNotFoundException") throw err;
  }
}

/**
 * Onceki kosulardan kalmis test kullanicilarini sureklemek icin BEST-EFFORT
 * tarama. ListUsers gecikmeli oldugu icin buna GUVENMIYORUZ — bu kosunun
 * dogrulugu `createdUsers` listesine dayaniyor. Burasi yalnizca cop toplama.
 */
async function sweepLeftovers() {
  const at = EMAIL.lastIndexOf("@");
  const prefix = `${EMAIL.slice(0, at)}+${E2E_TAG_PREFIX}`;
  try {
    const res = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email ^= "${prefix}"`,
      Limit: 60,
    }));
    for (const u of res.Users ?? []) {
      const sub = u.Attributes?.find((a) => a.Name === "sub")?.Value ?? u.Username;
      // Bu kosunun kullanicilari zaten ayrica siliniyor.
      if (createdUsers.some((c) => c.username === u.Username)) continue;
      console.log(`  sweep: removing leftover ${u.Username} (${u.UserStatus})`);
      await purgeUser({ username: u.Username, sub });
    }
  } catch (err) {
    console.warn("  sweep skipped (non-fatal):", err?.name ?? err);
  }
}

/** BILLSUB#e2e- abonelik esleme artiklari (tombstone'lar dahil). */
async function purgeSubscriptionMaps() {
  let lastKey;
  do {
    const maps = await dynamo.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: "SK = :map AND begins_with(PK, :prefix)",
      ExpressionAttributeValues: { ":map": "MAP", ":prefix": "BILLSUB#e2e-" },
      ProjectionExpression: "PK",
      ExclusiveStartKey: lastKey,
    }));
    for (const item of maps.Items ?? []) {
      await dynamo.send(new DeleteCommand({
        TableName: USERS_TABLE,
        Key: { PK: item.PK, SK: "MAP" },
      }));
    }
    lastKey = maps.LastEvaluatedKey;
  } while (lastKey);
}

/**
 * Teardown. `finally` icinde HER ZAMAN calisir.
 *
 * Deneme defteri kaydi TEMEL e-posta uzerinden siliniyor: kosuya ozel
 * `+etiket` adresleri normalize edilince ayni anahtara dusuyor. Silinmezse
 * sonraki kosu deneme alamaz ve testler kalici olarak kirmiziya duser.
 * DynamoDB DeleteItem tutarli — burada Cognito aramasinin gecikmesi gibi bir
 * belirsizlik yok.
 */
async function teardown() {
  for (const user of createdUsers) {
    console.log(`  teardown: removing ${user.username}`);
    await purgeUser(user);
  }
  await purgeSubscriptionMaps();
  await dynamo.send(new DeleteCommand({
    TableName: USERS_TABLE,
    Key: { PK: trialLedgerPK(EMAIL), SK: "LEDGER" },
  }));
}

/**
 * SignUp + AdminConfirmSignUp → PostConfirmation tetiklenir.
 * @returns {{ sub: string, username: string }}
 */
async function signUpAndConfirm(email) {
  // SignUp yanitindaki UserSub, profil anahtarinin (USER#<sub>) ta kendisi.
  const signUpResult = await cognito.send(new SignUpCommand({
    ClientId: CLIENT_ID,
    Username: email,
    Password: PASSWORD,
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "given_name", Value: "E2E" },
      { Name: "family_name", Value: "Test" },
    ],
  }));
  const sub = signUpResult.UserSub;
  if (!sub) throw new Error("SignUp did not return UserSub");

  // Confirm ONCESI e-posta alias'i cozulmez → gercek Username'i ListUsers ile bul.
  // ListUsers gecikmeli olabilir; bulunana kadar makul sure dene.
  let username = null;
  for (let i = 0; i < 20 && !username; i++) {
    const users = await findCognitoUsers(email);
    username = users.find((u) => u.sub === sub)?.username ?? null;
    if (!username) await sleep(1000);
  }
  if (!username) throw new Error(`Could not resolve Cognito username for sub=${sub}`);
  // Teardown aramaya guvenmesin: olusturulan kullaniciyi HEMEN kaydet.
  createdUsers.push({ username, sub });

  // AdminConfirmSignUp PostConfirmation_ConfirmSignUp tetikler — profil ve
  // deneme defteri kaydi bu sirada olusur.
  await cognito.send(new AdminConfirmSignUpCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  }));

  // Profilin yazilmasini bekle (PostConfirmation hatayi yutuyor, sonsuza kadar bekleme).
  for (let i = 0; i < 20; i++) {
    if (await getProfile(sub)) return { sub, username };
    await sleep(500);
  }
  throw new Error(`Profile was never created for user=${sub}`);
}

async function signIn(username) {
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
    Password: PASSWORD,
    Permanent: true,
  }));

  const res = await cognito.send(new InitiateAuthCommand({
    ClientId: CLIENT_ID,
    AuthFlow: "USER_PASSWORD_AUTH",
    // Giris gercek Username ile; e-posta alias'i da calisir ama Username kesin.
    AuthParameters: { USERNAME: username, PASSWORD },
  }));
  const token = res.AuthenticationResult?.AccessToken;
  if (!token) throw new Error("No access token returned");
  return token;
}

async function api(method, path, token, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* metin birakilir */ }
  return { status: res.status, body: json, raw: text };
}

/**
 * Imzali Polar webhook'u gonderir (Standard Webhooks).
 * HMAC anahtari secret'in UTF-8 baytlari — shared/webhook-signature.ts ve Polar SDK ile ayni.
 * `timestampSec` verilirse o zaman damgasiyla imzalanir (replay testi icin).
 */
async function sendWebhook(type, {
  subscriptionId, status, userId, modifiedAt, createdAt,
  cancelAtPeriodEnd = false, timestampSec,
}) {
  const payload = {
    type,
    timestamp: new Date().toISOString(),
    data: {
      id: subscriptionId,
      status,
      created_at: createdAt,
      modified_at: modifiedAt,
      cancel_at_period_end: cancelAtPeriodEnd,
      current_period_end: iso(30 * DAY),
      ends_at: status === "canceled" ? modifiedAt : null,
      recurring_interval: "month",
      customer_id: "e2e-customer",
      product_id: "e2e-product",
      metadata: { user_id: userId },
      customer: { id: "e2e-customer", external_id: userId, email: "e2e@example.test" },
    },
  };
  const raw = JSON.stringify(payload);
  const id = `msg_e2e_${randomUUID()}`;
  const ts = timestampSec ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(POLAR_WEBHOOK_SECRET, "utf8"))
    .update(`${id}.${ts}.${raw}`)
    .digest("base64");

  const res = await fetch(`${API_BASE_URL}/billing/polar/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": `v1,${signature}`,
    },
    body: raw,
  });
  return { status: res.status, text: await res.text() };
}

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

// ─── Senaryolar ───────────────────────────────────────────────────────────────

async function run() {
  console.log(`Subscription regression against ${API_BASE_URL}`);
  console.log(`Users table: ${USERS_TABLE}`);
  console.log(`Signup A: ${SIGNUP_EMAIL_A}`);
  console.log(`Signup B: ${SIGNUP_EMAIL_B}`);
  console.log(`Trial ledger key derives from: ${normalizeEmail(EMAIL, STRICT_ALIAS)}\n`);

  // Onceki kosulardan kalan artiklari sureklemeyi dene (best-effort) ve deneme
  // defterini KESIN olarak temizle — 1. senaryo temiz bir defter bekliyor.
  await sweepLeftovers();
  await dynamo.send(new DeleteCommand({
    TableName: USERS_TABLE,
    Key: { PK: trialLedgerPK(EMAIL), SK: "LEDGER" },
  }));
  await purgeSubscriptionMaps();

  // ── 1. Signup → 14 gunluk deneme ───────────────────────────────────────────
  section("1. signup → trial");
  const { sub, username } = await signUpAndConfirm(SIGNUP_EMAIL_A);
  let token = await signIn(username);

  let profile = await getProfile(sub);
  check("profil olustu", Boolean(profile));
  check("plan=pro", profile?.plan === "pro", `plan=${profile?.plan}`);
  check("planSource=trial", profile?.planSource === "trial", `planSource=${profile?.planSource}`);
  check("trialStartedAt yazildi", Boolean(profile?.trialStartedAt));
  check("trialEndsAt ~14 gun sonra",
    Math.abs(Date.parse(profile?.trialEndsAt ?? 0) - (Date.now() + 14 * DAY)) < 5 * 60_000,
    `trialEndsAt=${profile?.trialEndsAt}`);

  const ledger = await dynamo.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { PK: trialLedgerPK(SIGNUP_EMAIL_A), SK: "LEDGER" },
    ConsistentRead: true,
  }));
  check("deneme defteri kaydi olustu", Boolean(ledger.Item));
  check("defter bu kullaniciya ait", ledger.Item?.lastUserId === sub);

  let profileApi = await api("GET", "/me/profile", token);
  check("GET /me/profile → pro", profileApi.body?.plan === "pro", JSON.stringify(profileApi.body));
  check("trial.status=active", profileApi.body?.trial?.status === "active");
  check("trial.daysLeft=14", profileApi.body?.trial?.daysLeft === 14, `daysLeft=${profileApi.body?.trial?.daysLeft}`);

  // ── 2. Deneme sirasinda Pro yetkileri ──────────────────────────────────────
  section("2. deneme sirasinda Pro erisimi");
  const threeInterests = ["technology", "geopolitics", "business_economics"];
  let res = await api("PUT", "/me/interests", token, { interests: threeInterests, email: SIGNUP_EMAIL_A, region: "EU" });
  check("3 konu secilebiliyor", res.status === 200, `status=${res.status} ${res.raw}`);

  // Yarim kalmis checkout: Polar "incomplete" bir abonelik bildirir. Deneme
  // suren kullanici Free'ye DUSMEMELI (erisim vermeyen abonelik mevcut durumu ezmez).
  let hook = await sendWebhook("subscription.created", {
    subscriptionId: `e2e-incomplete-${Date.now()}`, status: "incomplete", userId: sub,
    modifiedAt: iso(0), createdAt: iso(0),
  });
  check("incomplete webhook 200", hook.status === 200, `status=${hook.status} ${hook.text}`);
  profile = await getProfile(sub);
  check("incomplete abonelik denemeyi bozmadi",
    profile?.plan === "pro" && profile?.planSource === "trial",
    `plan=${profile?.plan} planSource=${profile?.planSource}`);

  // ── 3. Cron CALISMADAN expiry (P0 #1) ──────────────────────────────────────
  section("3. cron calismadan deneme bitisi");
  await patchProfile(sub, "SET trialEndsAt = :past", { ":past": iso(-2 * 60 * 60_000) });

  profileApi = await api("GET", "/me/profile", token);
  check("GET /me/profile → free (cron calismadi)", profileApi.body?.plan === "free",
    `plan=${profileApi.body?.plan}`);
  check("trial.status=expired", profileApi.body?.trial?.status === "expired");

  profile = await getProfile(sub);
  check("kayit da free'ye dustu (self-healing)", profile?.plan === "free", `plan=${profile?.plan}`);
  check("planSource silindi", profile?.planSource === undefined);
  check("trialEndsAt silindi", profile?.trialEndsAt === undefined);
  check("trialConsumedAt yazildi", Boolean(profile?.trialConsumedAt));
  check("trialStartedAt KORUNDU", Boolean(profile?.trialStartedAt));
  check("trial-ended e-posta bayragi birakildi", profile?.trialEndedEmailPending === true);

  res = await api("PUT", "/me/interests", token, { interests: threeInterests, email: SIGNUP_EMAIL_A, region: "EU" });
  check("free planda 3 konu reddediliyor", res.status === 400, `status=${res.status}`);

  res = await api("PUT", "/me/interests", token, { interests: ["technology"], email: SIGNUP_EMAIL_A, region: "EU" });
  check("free planda 1 konu kabul ediliyor", res.status === 200, `status=${res.status} ${res.raw}`);

  res = await api("GET", "/me/trend-report", token);
  check("Pazar Eki free'ye kapali", res.body?.report === null, JSON.stringify(res.body));

  // ── 4. Odemeli yukseltme (webhook) ─────────────────────────────────────────
  section("4. webhook → paid Pro");
  const subscriptionId = `e2e-${Date.now()}`;
  hook = await sendWebhook("subscription.active", {
    subscriptionId, status: "active", userId: sub,
    modifiedAt: iso(0), createdAt: iso(0),
  });
  check("webhook 200 dondu", hook.status === 200, `status=${hook.status} ${hook.text}`);

  profile = await getProfile(sub);
  check("plan=pro", profile?.plan === "pro", `plan=${profile?.plan}`);
  check("planSource=paid", profile?.planSource === "paid", `planSource=${profile?.planSource}`);
  check("trialStartedAt hala duruyor", Boolean(profile?.trialStartedAt));
  check("trial-ended bayragi temizlendi", profile?.trialEndedEmailPending === undefined);
  check("subscriptionId yazildi", profile?.subscriptionId === subscriptionId, `subscriptionId=${profile?.subscriptionId}`);
  check("billingProvider=polar", profile?.billingProvider === "polar");

  // Replay korumasi: 10 dk once imzalanmis (gecerli imzali) istek reddedilmeli.
  hook = await sendWebhook("subscription.revoked", {
    subscriptionId, status: "canceled", userId: sub,
    modifiedAt: iso(30_000), createdAt: iso(0),
    timestampSec: Math.floor(Date.now() / 1000) - 10 * 60,
  });
  check("eski zaman damgali webhook 401", hook.status === 401, `status=${hook.status}`);
  profile = await getProfile(sub);
  check("replay plani degistirmedi", profile?.plan === "pro", `plan=${profile?.plan}`);

  profileApi = await api("GET", "/me/profile", token);
  check("GET /me/profile → paid pro", profileApi.body?.plan === "pro" && profileApi.body?.planSource === "paid",
    JSON.stringify(profileApi.body));

  // ── 5. Odeme varken bayat trialEndsAt Pro'yu dusurmemeli ───────────────────
  section("5. odeme + bayat trialEndsAt");
  await patchProfile(sub, "SET trialEndsAt = :past", { ":past": iso(-3 * DAY) });
  profileApi = await api("GET", "/me/profile", token);
  check("odeme yapan kullanici Pro kaliyor", profileApi.body?.plan === "pro", `plan=${profileApi.body?.plan}`);
  profile = await getProfile(sub);
  check("odeme yapanin plani degistirilmedi", profile?.plan === "pro");

  // ── 6. Abonelik sona eriyor ────────────────────────────────────────────────
  section("6. webhook → revoked → free");
  // Donem sonu iptali: once cancel_at_period_end=true (erisim SURER)...
  hook = await sendWebhook("subscription.canceled", {
    subscriptionId, status: "active", userId: sub, cancelAtPeriodEnd: true,
    modifiedAt: iso(30_000), createdAt: iso(0),
  });
  check("canceled webhook 200", hook.status === 200, `status=${hook.status} ${hook.text}`);
  profile = await getProfile(sub);
  check("donem sonuna kadar Pro kaliyor", profile?.plan === "pro" && profile?.cancelAtPeriodEnd === true,
    `plan=${profile?.plan} cancelAtPeriodEnd=${profile?.cancelAtPeriodEnd}`);

  // ...sonra donem bitince revoked (status=canceled) → Free.
  hook = await sendWebhook("subscription.revoked", {
    subscriptionId, status: "canceled", userId: sub,
    modifiedAt: iso(60_000), createdAt: iso(0),
  });
  check("webhook 200 dondu", hook.status === 200, `status=${hook.status} ${hook.text}`);

  profile = await getProfile(sub);
  check("plan=free", profile?.plan === "free", `plan=${profile?.plan}`);
  check("interests temizlendi", profile?.interests === undefined);

  // ── 7. Bayat/mukerrer webhook yoksayiliyor ─────────────────────────────────
  section("7. mukerrer webhook (idempotency)");
  hook = await sendWebhook("subscription.updated", {
    subscriptionId, status: "active", userId: sub,
    modifiedAt: iso(-10 * 60_000), createdAt: iso(0),
  });
  check("eski event 200 ile yutuldu", hook.status === 200, `status=${hook.status}`);
  profile = await getProfile(sub);
  check("bayat event plani degistirmedi", profile?.plan === "free", `plan=${profile?.plan}`);

  // ── 8. Hesap silme → ayni e-posta ile yeniden kayit (P0 #2) ────────────────
  section("8. hesap silme → ayni e-posta ile yeniden kayit");
  // Sahte subscriptionId Polar'a revoke icin gonderilirse 4xx/502 alir: profil
  // alanini temizle. Polar'a yine de "aktif abonelik var mi?" diye sorulur
  // (sandbox'ta bu kullaniciya ait abonelik yok → bos liste). BILLSUB# eslemesi
  // tabloda duruyor; silme akisi onu tarayip tombstone'a cevirmeli.
  await patchProfile(sub, "REMOVE subscriptionId, subscriptionStatus");

  token = await signIn(username);
  res = await api("DELETE", "/me", token);
  check("hesap silindi", res.status === 200, `status=${res.status} ${res.raw}`);
  check("profil gitti", (await getProfile(sub)) === null);

  const ledgerAfterDelete = await dynamo.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { PK: trialLedgerPK(EMAIL), SK: "LEDGER" },
    ConsistentRead: true,
  }));
  check("deneme defteri KORUNDU", Boolean(ledgerAfterDelete.Item));

  const mapAfterDelete = await dynamo.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { PK: `BILLSUB#${subscriptionId}`, SK: "MAP" },
    ConsistentRead: true,
  }));
  check("abonelik eslemesi tombstone'a cevrildi", mapAfterDelete.Item?.deleted === true,
    JSON.stringify(mapAfterDelete.Item ?? null));

  // Silinmis hesaba gecikmeli "active" webhook: 200 donmeli, profil DIRILMEMELI.
  hook = await sendWebhook("subscription.updated", {
    subscriptionId, status: "active", userId: sub,
    modifiedAt: iso(5 * 60_000), createdAt: iso(0),
  });
  check("silinmis hesaba webhook 200 (retry firtinasi yok)", hook.status === 200, `status=${hook.status} ${hook.text}`);
  check("hayalet profil dirilmedi", (await getProfile(sub)) === null);

  // FARKLI bir alias ile kayit: Cognito icin bambaska bir kullanici, deneme
  // defteri icin AYNI kisi. Etiket soyma calismazsa bu senaryo kirmizi olur.
  const { sub: sub2, username: username2 } = await signUpAndConfirm(SIGNUP_EMAIL_B);
  check("yeni Cognito kullanicisi", sub2 !== sub);
  check("iki alias ayni deneme anahtarina dusuyor",
    trialLedgerPK(SIGNUP_EMAIL_A) === trialLedgerPK(SIGNUP_EMAIL_B));

  const profile2 = await getProfile(sub2);
  check("yeniden kayitta plan=free", profile2?.plan === "free", `plan=${profile2?.plan}`);
  check("yeniden kayitta deneme YOK", profile2?.planSource === undefined, `planSource=${profile2?.planSource}`);
  check("trialEndsAt yok", profile2?.trialEndsAt === undefined);
  check("trialConsumedAt isaretli", Boolean(profile2?.trialConsumedAt));

  const token2 = await signIn(username2);
  profileApi = await api("GET", "/me/profile", token2);
  check("GET /me/profile → free", profileApi.body?.plan === "free");
  check("trial.eligible=false", profileApi.body?.trial?.eligible === false);
}

// ─── Giris noktasi ────────────────────────────────────────────────────────────

let exitCode = 0;
try {
  await run();
} catch (err) {
  console.error("\nUnexpected error:", err);
  failures.push(`unexpected: ${err?.message ?? err}`);
} finally {
  // Teardown HER ZAMAN calisir. Defter temizlenmezse sonraki kosu deneme
  // alamaz ve testler kalici olarak kirmizi kalir.
  try {
    await teardown();
    console.log("\nTeardown complete.");
  } catch (err) {
    console.error("\nCRITICAL: teardown failed — the next run will likely fail:", err);
    exitCode = 1;
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFailed checks:");
  for (const f of failures) console.log(`  - ${f}`);
  exitCode = 1;
}
process.exit(exitCode);
