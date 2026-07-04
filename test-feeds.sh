#!/usr/bin/env bash
# Cogletta — feed sağlık kontrolü (macOS uyumlu; perl + curl kullanır)
# generate-articles/index.ts içindeki TÜM makale+podcast feed'lerini çıkarır ve
# Lambda'nın gönderdiği AYNI header'larla (GET) test eder. 200 dönse bile içinde
# <item>/<entry> var mı sayar (200 ama boş feed de kötüdür).
#
# Kullanım (repo kökünden):
#   chmod +x test-feeds.sh
#   ./test-feeds.sh
# veya dosya yolunu ver:
#   ./test-feeds.sh app-backend/lambdas/articles/generate-articles/index.ts

set -uo pipefail

SRC="${1:-app-backend/lambdas/articles/generate-articles/index.ts}"
if [[ ! -f "$SRC" ]]; then
  echo "Dosya bulunamadı: $SRC"
  echo "Kullanım: ./test-feeds.sh [path/to/generate-articles/index.ts]"
  exit 1
fi

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
ACCEPT="application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.7"
ACCEPT_LANG="en-US,en;q=0.9"
TIMEOUT=12

# --- 1) Kaynakları ayrıştır (perl — macOS'ta hazır gelir) -----------------------
PARSED="$(perl -ne '
  $section="ARTICLE" if /const RSS_SOURCES/;
  $section="PODCAST" if /const PODCAST_SOURCES/;
  if (/^\s*"([^"]+)"\s*:\s*\[/) { $cat=$1; next; }
  if (/name:\s*"([^"]+)"[^}]*url:\s*"([^"]+)"/) {
    print "$section\t$cat\t$1\t$2\n" if $section && $cat;
  }
' "$SRC")"

TOTAL=$(printf "%s\n" "$PARSED" | grep -c .)
echo "Bulunan feed sayısı: $TOTAL"
echo "Test başlıyor (GET, Lambda header'ları, ${TIMEOUT}s timeout)..."
echo "------------------------------------------------------------------------"
printf "%-5s %-6s %-8s %-24s %s\n" "HTTP" "ITEMS" "TYPE" "CATEGORY" "URL"
echo "------------------------------------------------------------------------"

TMP="$(mktemp)"
PROBLEMS=()

while IFS=$'\t' read -r SECTION CATEGORY NAME URL; do
  [[ -z "${URL:-}" ]] && continue

  CODE=$(curl -sS -L --max-time "$TIMEOUT" \
    -o "$TMP" -w "%{http_code}" \
    -A "$UA" -H "Accept: $ACCEPT" -H "Accept-Language: $ACCEPT_LANG" \
    "$URL" 2>/dev/null)
  CODE=${CODE:-000}

  ITEMS=$(grep -oE "<item[ >]|<entry[ >]" "$TMP" 2>/dev/null | wc -l | tr -d ' ')

  printf "%-5s %-6s %-8s %-24s %s\n" "$CODE" "$ITEMS" "$SECTION" "$CATEGORY" "$URL"

  if [[ "$CODE" != "200" || "$ITEMS" == "0" ]]; then
    PROBLEMS+=("$CODE | items=$ITEMS | $SECTION | $CATEGORY | $NAME | $URL")
  fi
done <<< "$PARSED"

rm -f "$TMP"

echo "========================================================================"
if [[ ${#PROBLEMS[@]} -eq 0 ]]; then
  echo "OK — sorunlu feed yok (hepsi 200 ve icinde oge var)."
else
  echo "SORUNLU FEED'LER (${#PROBLEMS[@]} adet — kod!=200 veya 0 oge):"
  echo "------------------------------------------------------------------------"
  for p in "${PROBLEMS[@]}"; do echo "  $p"; done
  echo "------------------------------------------------------------------------"
  echo "Bu blogu bana yapistir; olu/bos olanlari temizleyip degistireyim."
fi
