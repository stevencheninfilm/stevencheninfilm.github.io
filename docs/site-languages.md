# Site languages

The homepage has two independent copy sources, with shared media and interaction code:

- `locales/home.en.html`: English first, served at `/en/index.html` and the default root entry.
- `locales/home.zh.html`: Chinese first, served at `/zh/index.html`.

Edit these templates, then run `node tools/build-home-pages.cjs`. Nested routes receive correctly rebased assets and links. `index-v3.html` remains synchronized with the root entry. Check generated files with `node tools/build-home-pages.cjs --check`.

`assets/site-language.js` handles the switch and root-entry defaults. Manual selection is remembered in local storage. Explicit language URLs stay in that language. Switching preserves the current project via `?project=`. Both homepages link directly to Vibe Coding, AI Visuals, Film and About; Vibe Coding keeps its English name and original display typography in the Chinese edition.

AI Visuals also has two independent copy sources:

- `locales/ai.en.html`: served at `/en/ai/index.html` and the default `/ai/index.html` entry.
- `locales/ai.zh.html`: served at `/zh/ai/index.html`, with Chinese headlines, descriptions, navigation, news and player labels, plus secondary English titles.

Run `node tools/build-ai-pages.cjs` after editing either AI source. These templates use paths relative to `/ai/`; the generator rebases assets, HD sources and local links for the deeper locale routes. `--check` verifies generated pages. Home links lead directly to the matching language's AI page. The language switch preserves a visible workflow after scrolling, or the existing project hash elsewhere. `/ai/index.html` and `/ai/` reuse manual preference and the same country hint as the homepage; explicit `/en/ai/` and `/zh/ai/` routes stay stable.

The Chinese layout is scoped in `assets/ai-locales.css`; shared comparison and workflow controllers select runtime labels from the page or nearest language attribute. Preview-first HD upgrades, lazy full-film playback and workflow anchor IDs are shared across both languages.

For new root visitors, the nonblocking same-origin `/site-region.txt` request uses `X-Site-Country` from the mainland Alibaba CDN. This file contains JSON with an unknown country; the header is configured as `$ip_country_id`, using the actual visitor IP country rather than browser language. CN selects Chinese. Overseas GitHub responses have no such header and keep English. Unknown, failed or slow hints keep the page usable in English; visitors can always switch manually. No third-party IP lookup or location permission is used.

Country responses must not be stored in browser caches. The current fetch uses `cache: no-store`. The CDN caches only the country-neutral `/site-region.txt` body for 600 seconds (directory rule, priority 99); its outgoing country header is evaluated for each request, including cache hits. Other JSON caching remains zero. Changing the site's regional DNS/CDN routing requires rechecking this hint.

The homepage and AI Visuals are localized. Film, TVC, About and project detail pages retain their existing content until separately translated.
