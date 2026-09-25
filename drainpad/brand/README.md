# Drainpad — brand

Everything the account and the link preview need, and the one script that builds
them.

| | |
| --- | --- |
| `compose.sh` | Builds the link preview and the post cards, and captions the two images that start as art |
| `PROMPTS.md` | The Google Flow prompts for the logo, the banner and the post background |
| `X-PROFILE.md` | Handle, display name, bio |
| `X-POSTS.md` | Every post, in the order they go up |
| `fonts/` | The three faces the site loads, kept here so `compose.sh` fetches nothing |
| `out/` | What comes out. Built rather than hand-made, so it can be rebuilt |

```bash
./compose.sh
```

## What is drawn and what is generated

The link preview and the post cards are **type on a poured slab** — a wordmark, a
line, a grate. There is no photograph in them, so there is nothing to generate:
they are composed from the same colours and the same faces the site loads, which
is the point. A wordmark burned into a card and a heading rendered in a browser
should be the same letters, not two faces that merely look similar.

The logo, the header and the background the post cards sit on **start as art
from Google Flow**, because those three want a real image behind them. The prompts ask for art with no lettering at all.
Image generators misspell, and DRAINPAD coming back as DRIANPAD is not a risk
worth taking with the one word that has to be right — so the words go on
afterwards, in `compose.sh`, placed around what covers the image on each surface.
The avatar sits over the lower left of an X header, so the header's type starts
past it.

Drop the Flow renders in as `out/x-avatar-plain.jpg`, `out/x-header-plain.jpg`
and `out/post-bg-plain.jpg`, then re-run. Until a file is there its step is
skipped and everything else still builds — and the post cards fall back to the
drawn slab, which is a finished image in its own right rather than a placeholder.

## No numbers, anywhere in here

Not in a card, not in a post, not in the bio. The supply, the split, what the
grate keeps and the range a pool opens across are constants in contracts that
are verified with their source published — that is where they bind, and anyone
can read them there. A figure repeated into a picture is a second copy that can
go stale, be mistyped, or be read as a promise, and it cannot be checked against
the chain by looking at it.

Posts point at the explorer instead.
