// app-backend/shared/polar-secrets.ts
/**
 * Polar sırlarını SSM Parameter Store'dan (SecureString) çalışma anında okur.
 *
 * NEDEN env yerine SSM:
 * Parametreler Terraform'da `lifecycle { ignore_changes = all }` ile tutuluyor.
 * Değer konsoldan/CLI'dan değiştirildiğinde (rotasyon, sandbox → prod) Terraform
 * onu ezmez ve Lambda'ların yeniden deploy edilmesi gerekmez. Değer env'e
 * gömülseydi, Terraform ilk değeri env'e yazmaya devam ederdi.
 *
 * Önbellek: Lambda konteyneri başına 5 dakika. Rotasyondan sonra en geç 5 dk
 * içinde yeni değer kullanılır.
 *
 * Yerel/test: POLAR_ACCESS_TOKEN / POLAR_WEBHOOK_SECRET env'de doğrudan
 * verilmişse SSM'e gidilmez.
 *
 * @aws-sdk/client-ssm Lambda nodejs20.x runtime'ında hazır gelir (bundle dışı).
 */
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const CACHE_TTL_MS = 5 * 60 * 1000;
const ssm = new SSMClient({});
const cache = new Map<string, { value: string; expiresAt: number }>();

async function readParam(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = String(res.Parameter?.Value ?? "").trim();
  // Terraform ilk oluşturmada değer verilmediyse yer tutucu yazar → yapılandırılmamış say.
  const effective = value === "CHANGE_ME" ? "" : value;
  cache.set(name, { value: effective, expiresAt: Date.now() + CACHE_TTL_MS });
  return effective;
}

async function resolve(envName: string, paramEnvName: string): Promise<string> {
  const direct = process.env[envName];
  if (direct) return direct;
  const paramName = process.env[paramEnvName];
  if (!paramName) return "";
  return readParam(paramName);
}

/** Polar Organization Access Token ("" → yapılandırılmamış). */
export function getPolarAccessToken(): Promise<string> {
  return resolve("POLAR_ACCESS_TOKEN", "POLAR_ACCESS_TOKEN_PARAM");
}

/** Polar webhook imza secret'ı ("" → yapılandırılmamış). */
export function getPolarWebhookSecret(): Promise<string> {
  return resolve("POLAR_WEBHOOK_SECRET", "POLAR_WEBHOOK_SECRET_PARAM");
}
