# Homepage languages

The homepage has two independent copy sources, with shared media and interaction code:

- `locales/home.en.html`: English first, served at `/en/index.html` and the default root entry.
- `locales/home.zh.html`: Chinese first, served at `/zh/index.html`.

Edit these templates, then run `node tools/build-home-pages.cjs`. Nested routes receive correctly rebased assets and links. `index-v3.html` remains synchronized with the root entry. Check generated files with `node tools/build-home-pages.cjs --check`.

`assets/site-language.js` handles the switch and root-entry defaults. Manual selection is remembered in local storage. Explicit language URLs stay in that language. Switching preserves the current project via `?project=`. Both homepages link directly to Vibe Coding, AI Visuals, Film and About; Vibe Coding keeps its English name and original display typography in the Chinese edition.

For new root visitors, the nonblocking same-origin `/site-region.txt` request uses `X-Site-Country` from the mainland Alibaba CDN. This file contains JSON with an unknown country; the header is configured as `$ip_country_id`, using the actual visitor IP country rather than browser language. CN selects Chinese. Overseas GitHub responses have no such header and keep English. Unknown, failed or slow hints keep the page usable in English; visitors can always switch manually. No third-party IP lookup or location permission is used.

Country responses must not be stored in browser caches. The current fetch uses `cache: no-store`. The CDN caches only the country-neutral `/site-region.txt` body for 600 seconds (directory rule, priority 99); its outgoing country header is evaluated for each request, including cache hits. Other JSON caching remains zero. Changing the site's regional DNS/CDN routing requires rechecking this hint.

This initial release localizes the homepage. Linked AI Visuals, film, TVC and project detail pages retain their existing content until separately translated.
