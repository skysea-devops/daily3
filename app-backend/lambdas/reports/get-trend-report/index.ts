import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { Keys } from "../../../shared/types";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ARTICLES_TABLE = process.env.ARTICLES_TABLE_NAME!;
const USERS_TABLE    = process.env.USERS_TABLE_NAME!;
const CORS_ORIGIN    = process.env.CORS_ORIGIN ?? "*";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
};

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims["sub"] as string | undefined;
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: "Unauthorized" }) };
    }

    // Pazar Eki TÜM Pro üyeler için ortaktır: kayıt kullanıcı altında değil,
    // sabit SUNDAY#issue partition'ında durur. Bu yüzden burada userId yalnızca
    // kimlik doğrulaması için kullanılır, sorguda değil.
    //
    // Not: bu uç nokta plan kontrolü YAPMAZ. İçerik hassas değil ve tüm Pro
    // üyelerde aynı; erişim sınırı arayüzde (Pro kartı yalnızca Pro'ya görünür).
    // Sıkı kapatmak gerekirse USERS_TABLE okuma izni eklenip plan bakılmalı.
    // Kullanicinin plani PROFILE'dan okunur: Pazar Eki bir Pro ozelligi.
    // Arayuzde karti gizlemek yetkilendirme degildir — gecerli JWT'si olan bir
    // Free kullanici bu ucu dogrudan cagirabilirdi.
    const profile = await dynamo.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { PK: Keys.userPK(userId), SK: "PROFILE" },
      ProjectionExpression: "#p",
      ExpressionAttributeNames: { "#p": "plan" },
    }));
    if (String(profile.Item?.plan ?? "free").toLowerCase() !== "pro") {
      return { statusCode: 200, headers, body: JSON.stringify({ report: null }) };
    }

    // BU HAFTANIN eki — en son kayit DEGIL.
    //
    // Onceki surum ScanIndexForward:false + Limit:1 ile en yeni kaydi
    // getiriyordu. TTL 30 gun oldugu icin gecen haftanin eki hala duruyor:
    // bu hafta uretim basarisiz olursa dashboard sessizce ESKI eki gosterirdi.
    // Dogrudan GetItem hem dogru hem daha ucuz.
    const res = await dynamo.send(new GetCommand({
      TableName: ARTICLES_TABLE,
      Key: { PK: Keys.sundayPK(), SK: Keys.weekSK(new Date()) },
    }));

    const issue = res.Item;
    // "generating" placeholder henüz içerik taşımaz — hazır değil say.
    if (!issue || issue.status === "generating") {
      return { statusCode: 200, headers, body: JSON.stringify({ report: null }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        report: {
          weekLabel:   issue.weekLabel ?? "",
          article:     issue.article ?? null,
          podcast:     issue.podcast ?? null,
          generatedAt: issue.generatedAt ?? null,
        },
      }),
    };
  } catch (error) {
    console.error("get-trend-report error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
