import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Article, Podcast, CategoryDailyPicks, DailyArticles, Keys } from "../../../shared/types";
import { sendDailyEmail } from "../generate-articles";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE    = process.env.USERS_TABLE_NAME!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "";

// ─── deliver-daily ────────────────────────────────────────────────────────────
// Havuzlu free kullanıcılar için teslimat: kategori seçimini okur, kullanıcının
// USER# kaydına aynen kopyalar (dashboard/get-articles hiç değişmeden çalışır)
// ve kişisel e-postayı gönderir. Bedrock çağrısı YOK — üretim
// generate-category-picks'te, günde kategori başına bir kez yapılır.
//
// Erken ziyaretçi kuralı: kullanıcı cron'dan önce dashboard'a girip on-demand
// üretim tetiklemişse (get-articles → generate-articles) o günkü USER# kaydında
// gerçek içerik vardır. Bu durumda üzerine YAZMAYIZ ve e-postayı var olan
// içerikle göndeririz — dashboard ile e-posta asla ayrışmaz.

interface DeliverEvent {
  userId:    string;
  /** Kullanıcının tek interest'i — kategori havuzunun anahtarı */
  category:  string;
  email?:    string;
  userEmail?: string;
}

async function fetchUserEmail(userId: string): Promise<string | null> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName:            USERS_TABLE,
      Key:                  { PK: Keys.userPK(userId), SK: "PROFILE" },
      ProjectionExpression: "email",
    }));
    return (result.Item?.email as string) ?? null;
  } catch (err) {
    console.warn("Failed to fetch user email:", err);
    return null;
  }
}

export const handler = async (event: DeliverEvent): Promise<void> => {
  const { userId, category } = event;

  if (!userId || !category) {
    throw new Error("userId and category are required.");
  }

  const userPK  = Keys.userPK(userId);
  const dateSK  = Keys.dateSK(new Date());

  console.log(`Delivering for user=${userId} category=${category} date=${dateSK}`);

  // ── Kullanıcının bugünkü kaydı: gerçek içerik varsa koru ────────────────────
  const existingRes  = await dynamo.send(new GetCommand({
    TableName: ARTICLES_TABLE,
    Key:       { PK: userPK, SK: dateSK },
  }));
  const existing     = existingRes.Item as DailyArticles | undefined;
  const hasRealContent = Array.isArray(existing?.articles) && existing.articles.length > 0;

  let articles: Article[];
  let podcasts: Podcast[];

  if (hasRealContent) {
    // Erken on-demand üretim — dokunma, aynısını e-postala
    console.log(`User already has content today (early on-demand generate) — user=${userId}, emailing existing picks`);
    articles = existing!.articles;
    podcasts = existing!.podcasts ?? (existing!.podcast ? [existing!.podcast] : []);
  } else {
    // ── Kategori havuzundan oku ───────────────────────────────────────────────
    const pickRes = await dynamo.send(new GetCommand({
      TableName: ARTICLES_TABLE,
      Key:       { PK: Keys.categoryPK(category), SK: dateSK },
    }));
    const pick = pickRes.Item as CategoryDailyPicks | undefined;

    if (!pick?.articles?.length) {
      // Faz A senkron ensure sayesinde normalde imkânsız; olursa alarm yakalasın
      console.warn(`Category pick missing — category=${category} date=${dateSK}, user=${userId}. No real article to email, skipping.`);
      return;
    }

    articles = pick.articles;
    podcasts = pick.podcasts ?? (pick.podcast ? [pick.podcast] : []);

    // ── Kullanıcıya kopyala (dashboard uyumluluğu) ────────────────────────────
    const userItem: DailyArticles = {
      PK:          userPK,
      SK:          dateSK,
      articles,
      podcast:     podcasts[0] ?? null,   // geriye uyumluluk (eski dashboard tekil okur)
      podcasts,
      generatedAt: pick.generatedAt,
      ttl:         Keys.ttl30Days(),
    };

    // Koşulsuz Put: varsa "generating" placeholder'ının üstüne yazar
    await dynamo.send(new PutCommand({ TableName: ARTICLES_TABLE, Item: userItem }));
    console.log(`Copied category pick to user=${userId} (${articles.length} article(s), ${podcasts.length} podcast(s))`);
  }

  // ── Email ───────────────────────────────────────────────────────────────────
  if (SES_FROM_EMAIL) {
    const userEmail = event.email ?? event.userEmail ?? await fetchUserEmail(userId);
    if (userEmail) {
      try {
        await sendDailyEmail(userEmail, articles, podcasts);
      } catch (err) {
        console.error("Failed to send email notification:", err);
      }
    } else {
      console.warn(`No email found for user=${userId}, skipping notification`);
    }
  }
};
