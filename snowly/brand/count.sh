#!/usr/bin/env bash
# Measures every post in X-POSTS.md the way X does.
#
#   ./count.sh
#
# A post over 280 characters is not shortened, it is refused — so the count is
# worth knowing before the paste, not after. X weighs a URL as 23 characters
# whatever its real length, which is why a naive `wc -c` reads long here.
set -euo pipefail
cd "$(dirname "$0")"

awk '
  /^```$/ { infence = !infence; if (!infence) { print "\036" }; next }
  infence { print }
' X-POSTS.md | python3 -c '
import re, sys

URL = re.compile(r"\b[a-z0-9-]+\.(fun|com|org|io|xyz|app|dev)\b(/\S*)?", re.I)
blocks = [b.strip("\n") for b in sys.stdin.read().split("\036") if b.strip()]

worst = 0
for i, text in enumerate(blocks, 1):
    n = len(URL.sub("x" * 23, text))
    worst = max(worst, n)
    head = text.split("\n")[0][:44]
    state = f"OVER by {n - 280}" if n > 280 else f"{280 - n} left"
    print(f"  {i}. {head:<46} {n:>3}  {state}")

print()
print("all fit" if worst <= 280 else "something is over — fix it before posting")
sys.exit(0 if worst <= 280 else 1)
'
