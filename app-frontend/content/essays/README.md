# Cogletta Essays — yeni deneme nasıl yayınlanır

Her deneme bu klasörde **tek bir markdown dosyasıdır**. Dosya adı URL'dir:
`content/essays/the-art-of-slow-reading.md` → `cogletta.com/essays/the-art-of-slow-reading/`

Yayınlamak = dosyayı eklemek + `dev → main → prod` PR akışı. Build her şeyi
kendisi üretir: liste sayfası, konu ve seri sayfaları, RSS, sitemap, OG görseli.

## 1. Şablon

```markdown
---
title: "The Art of Slow Reading"
description: "Why reading less, more carefully, may teach us more. Keep it under ~160 characters."
date: "2026-11-02"
coverImage: "/essays/slow-reading/cover.jpg"
coverCredit: "Johannes Vermeer, Woman Reading a Letter (c. 1663). Rijksmuseum, public domain."
tags: [philosophy, life_work]
series: "Old Books, New Problems"   # opsiyonel
seriesPart: 3                       # series varsa zorunlu
access: pro                         # pro (varsayılan) ya da free
# readingMinutes: 7                 # opsiyonel; yazılmazsa kelime sayısından hesaplanır
# author:                           # opsiyonel; yalnızca MİSAFİR yazar için
#   name: "Jane Doe"
#   role: "Historian"
#   url: "https://example.com"
---
İlk paragraf. Paragraflar arasında bir boş satır bırak.

## Ara başlık

> Alıntı metni.
>
> — Kaynak, Eser

- Madde bir
- Madde iki

![Görselin ne gösterdiği (alt metin, zorunlu)](/essays/slow-reading/figure.jpg "Görselin altındaki açıklama")

<!-- paywall -->

Bu satırdan sonrası Pro okurlara açılır.
```

## 2. Alanlar

| Alan | Zorunlu | Not |
|---|---|---|
| `title` | ✔ | |
| `description` | ✔ | Liste sayfası, `<meta description>`, RSS. ~160 karakter. |
| `date` | ✔ | `YYYY-MM-DD`. 7 günlük açık pencere bu tarihten (00:00 UTC) sayılır. |
| `tags` | ✔ | Kategori id'leri, en az bir tane: `technology`, `geopolitics`, `business_economics`, `science_environment`, `life_work`, `culture_style`, `philosophy`, `history`, `health`. Başka bir değer build'i durdurur. |
| `coverImage` | | Liste sayfasında öne çıkan görsel, deneme başında kapak ve paylaşım görseli. Yoksa başlıktan otomatik OG görseli üretilir. |
| `coverCredit` | Başkasına ait görselde ✔ | Kapağın altında görünür. Kaynağı ve lisansı yaz. Kendi ürettiğin görselde (ör. Canva) boş bırakabilirsin; build yalnızca uyarı verir. |
| `series` / `seriesPart` | | Aynı seri adındaki denemeler `/essays/series/<seri-adı>/` sayfasında sırayla listelenir. Aynı bölüm numarası iki kez kullanılamaz. |
| `access` | | `pro` (varsayılan) veya `free`. Aşağıya bak. |
| `readingMinutes` | | Yazılmazsa dakikada 225 kelimeden hesaplanır. |
| `author` | | Boş bırakılırsa Ismail Gokdeniz. |

Dosya adı (slug) küçük harf, rakam ve tire olmalı; `tag`, `series`, `og` kullanılamaz.

## 3. Erişim: `access` ve paywall işareti

- **`access: free`** — deneme her zaman tamamen açık. `<!-- paywall -->` işareti kullanılamaz.
- **`access: pro`** (varsayılan) — yayın tarihinden itibaren **7 gün herkese açık**, sonra Pro'ya kilitlenir.
  - Herkes başlığı, açıklamayı, kapağı ve gövdenin ilk bölümünü görür.
  - Kesim noktası `<!-- paywall -->` işaretidir. İşaret yoksa gövdenin yaklaşık ilk %30'u (paragraf sonunda) gösterilir.
  - İşareti iyi bir yere koy: okuru merak ettiren ama sorunun cevabını vermeyen bir paragrafın sonu.

Güvenlik: kilitli bölüm sitenin statik dosyalarına **hiç girmez** — ilk 7 gün de dahil
(statik dosya CDN'de günlerce durur). Okur kalan metni `GET /essays/{slug}/body` ile alır;
pencereyi ve Pro yetkisini sunucu hesaplar. Build sonunda `out/` taranır, kilitli
metin bulunursa build başarısız olur.

## 4. Desteklenen biçim

Yalnızca bunlar: paragraf, `## ` başlık, `>` alıntı (son satır `— Kaynak` ise kaynak olur),
`- ` madde listesi, tek başına satırda görsel `![alt](src "açıklama")` ve `<!-- paywall -->`.

Kalın/italik, link, kod, numaralı liste, `###` ve HTML **desteklenmez**; kullanılırsa build
satır numarasıyla hata verir. Markdown özel karakterleri metinde gerekirse `\*` gibi kaçışla.

## 5. Görseller

- Klasör: `app-frontend/public/essays/<deneme-klasörü>/`, yol `/essays/<deneme-klasörü>/dosya.jpg`.
- Kapak için yatay görsel kullan (16:9 kırpılır), genişlik ~1600 px, JPG, ~300 KB altı.
- Her görselin **alt metni** zorunlu.

Kamu malı / açık lisanslı görsel kaynakları:

- [The Public Domain Review](https://publicdomainreview.org/) — seçki ve bağlam, kaynak kurumunu yaz.
- [The Met Open Access](https://www.metmuseum.org/art/collection/search?showOnly=openAccess) — "Open Access" (CC0) işaretli eserler.
- [Wikimedia Commons](https://commons.wikimedia.org/) — dosya sayfasındaki lisansı kontrol et; "Public domain" ya da CC0 tercih et. CC BY ise eser sahibini ve lisansı `coverCredit`'e yaz.

`coverCredit` biçimi: `Sanatçı, Eser adı (yıl). Kurum, lisans.`
Kendi ürettiğin görselde: `Illustration: Ismail Gokdeniz (made with Canva)`.

## 6. Yerelde kontrol

```bash
cd app-frontend
npm run essays     # yalnızca içeriği doğrular, hataları gösterir
npm run dev        # http://localhost:3000/essays/
npm run build      # tam build + sızıntı kontrolü
```

Yerelde `npm run dev` ile pro denemenin kilitli kısmı görünmez (o kısım sunucudan gelir);
açık önizleme ve paywall kutusu görünür.
