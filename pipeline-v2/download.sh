#!/usr/bin/env bash
# Download every raw source pipeline-v2 uses into ../raw-data/v2 (gitignored).
# Re-runnable: skips files that are already complete. License per source in sources.yaml.
set -euo pipefail
cd "$(dirname "$0")/../raw-data" 2>/dev/null || { mkdir -p "$(dirname "$0")/../raw-data"; cd "$(dirname "$0")/../raw-data"; }
mkdir -p v2 && cd v2
get() { # get <url> <file>
  if [ -s "$2" ] && [ "$(curl -sIL "$1" | awk 'tolower($1)=="content-length:"{n=$2} END{print n+0}' | tr -d '\r')" = "$(stat -c%s "$2")" ]; then
    echo "have $2"; return; fi
  echo "get  $2"; curl -fL --retry 4 -C - -o "$2" "$1" || curl -fL --retry 4 -o "$2" "$1"
}
get https://www.ims.uni-stuttgart.de/documents/ressourcen/lexika/derivbase/derivbase-v2.0.zip derivbase-v2.0.zip
get https://www.ims.uni-stuttgart.de/documents/ressourcen/lexika/derivbase/derivbase-doc-2.0.txt derivbase-doc-2.0.txt
get https://raw.githubusercontent.com/kbatsuren/MorphyNet/main/deu/deu.derivational.v1.tsv morphynet-deu.derivational.v1.tsv
get https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl kaikki-en-German.jsonl
get https://kaikki.org/dewiktionary/Deutsch/kaikki.org-dictionary-Deutsch.jsonl kaikki-de-Deutsch.jsonl
# Reconstruction pages (Proto-West-Germanic, Proto-Germanic, Proto-Indo-European): follow history chains and descendants
get "https://kaikki.org/dictionary/Proto-West%20Germanic/kaikki.org-dictionary-ProtoWestGermanic.jsonl" kaikki-en-gmw-pro.jsonl
get https://kaikki.org/dictionary/Proto-Germanic/kaikki.org-dictionary-ProtoGermanic.jsonl kaikki-en-gem-pro.jsonl
get https://kaikki.org/dictionary/Proto-Indo-European/kaikki.org-dictionary-ProtoIndoEuropean.jsonl kaikki-en-ine-pro.jsonl
[ -d derivbase-v2.0 ] || unzip -q -o derivbase-v2.0.zip -d derivbase-v2.0
echo done
