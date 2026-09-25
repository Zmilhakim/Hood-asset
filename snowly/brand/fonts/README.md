# Fonts

The two faces the site uses, kept here so `caption.sh` runs without fetching
anything.

| File | Face | Where it is used |
| --- | --- | --- |
| `fraunces.ttf` | [Fraunces](https://fonts.google.com/specimen/Fraunces) | The wordmark, and every heading on the site |
| `inter.ttf` | [Inter](https://fonts.google.com/specimen/Inter) | The line under the wordmark, and the site's body text |

Both are variable fonts from Google Fonts, under the
[SIL Open Font License 1.1](https://openfontlicense.org), which permits
redistribution alongside the files that use them.

They are the same two the site loads through `next/font`, which is the point:
the wordmark burned into a banner and the heading rendered in a browser should
be the same letters, not two faces that merely look similar.
