// src/app/essays/rss.xml/route.ts
//
// Statik RSS 2.0 akışı: out/essays/rss.xml (static export'ta GET handler build'de dosyaya dönüşür).
//
// GÜVENLİK: access: "pro" denemelerde yalnızca AÇIK ÖNİZLEME + "Continue reading
// on Cogletta" linki yer alır. Veri kaynağı src/generated/essays.json olduğu için
// kilitli metin burada zaten yok; build sonrası sızıntı kontrolü rss.xml'i de tarar.

import { ESSAYS, SITE_URL, essayAuthor, tagLabel, type EssayBlock } from "@/lib/essays";

export const dynamic = "force-static";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function blockHtml(b: EssayBlock): string {
  switch (b.type) {
    case "h2":
      return `<h2>${esc(b.text)}</h2>`;
    case "quote":
      return `<blockquote><p>${esc(b.text)}</p>${b.cite ? `<p>— ${esc(b.cite)}</p>` : ""}</blockquote>`;
    case "ul":
      return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "img":
      return `<figure><img src="${esc(SITE_URL + b.src)}" alt="${esc(b.alt)}"/>${
        b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""
      }</figure>`;
    default:
      return `<p>${esc(b.text)}</p>`;
  }
}

/** CDATA içine güvenle gömmek için "]]>" bölünür. */
function cdata(html: string): string {
  return `<![CDATA[${html.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export async function GET() {
  const items = ESSAYS.map((e) => {
    const url = `${SITE_URL}/essays/${e.slug}/`;
    const body =
      e.blocks.map(blockHtml).join("\n") +
      (e.hasLockedPart ? `\n<p><a href="${url}">Continue reading on Cogletta →</a></p>` : "");
    return `    <item>
      <title>${esc(e.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(`${e.date}T08:00:00Z`).toUTCString()}</pubDate>
      <dc:creator>${esc(essayAuthor(e).name)}</dc:creator>
${e.tags.map((t) => `      <category>${esc(tagLabel(t))}</category>`).join("\n")}
      <description>${esc(e.description)}</description>
      <content:encoded>${cdata(body)}</content:encoded>
    </item>`;
  }).join("\n");

  const latest = ESSAYS[0]?.date ?? new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Cogletta Essays</title>
    <link>${SITE_URL}/essays/</link>
    <atom:link href="${SITE_URL}/essays/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Long-form writing on reading, attention, philosophy and the quiet habits of a curious life.</description>
    <language>en</language>
    <lastBuildDate>${new Date(`${latest}T08:00:00Z`).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
