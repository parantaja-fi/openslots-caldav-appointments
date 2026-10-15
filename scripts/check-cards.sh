#!/bin/sh
# The board's links are backticked card ids, which lychee cannot see. This is
# their check (METHODOLOGY.md §2): every card's frontmatter id matches its
# filename, and every id-shaped reference in tracked Markdown names a card
# that exists, in .devtool/features/ or its done/.
set -u
cd "$(dirname "$0")/.."
st=0

for f in .devtool/features/*.md .devtool/features/done/*.md; do
  [ -f "$f" ] || continue
  id=$(awk -F'"' '/^id:/{print $2; exit}' "$f")
  [ "$id" = "$(basename "$f" .md)" ] ||
    { echo "card id mismatch: $f says $id" >&2; st=1; }
done

refs=$(git ls-files '*.md' | xargs grep -ho \
  '`[a-z][a-z0-9-]*-20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]`' | tr -d '`' | sort -u)
for id in $refs; do
  [ -f ".devtool/features/$id.md" ] || [ -f ".devtool/features/done/$id.md" ] ||
    { echo "dangling card reference: $id" >&2; st=1; }
done

exit $st
