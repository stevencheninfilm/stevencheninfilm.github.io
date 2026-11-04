# Preview first, automatic high-quality playback

Native site videos with `data-src-hd` start through their existing lightweight preview player. Normal quality upgrades wait for `window.load`, the opening animation to finish, and currently visible preview players to become ready. After a short preview interval, `assets/progressive-video.js` uses an idle callback and low-priority fetch to download the higher-quality source. Only one visible video/group downloads HD at a time. Leaving a card, scrolling away, or hiding the page cancels an unfinished upgrade. Films still require their existing Play action before any video starts loading.

Both comparison files must download and decode before either visible element changes. The engine preserves the existing video nodes and current time, pause, mute, volume, playback speed and loop state. A brief hold frame covers source replacement. Download/decode failure keeps or restores the preview; it does not turn an optional quality upgrade into a failed player. File/group/page memory budgets and bounded attempts prevent unlimited background work.

The small `[data-progressive-status]` badge shows real downloaded-byte progress, a short HD confirmation after replacement, and a retry button if the optional upgrade fails. Unknown total sizes use indeterminate progress instead of an estimated percentage. A comparison's total becomes known once both response sizes are available. The retry button requeues only the currently visible failed group and never navigates to a separate video file. Downloads may continue for up to ten minutes while making progress; a 45-second transfer stall times out without interrupting the preview.

A genuine preview error or startup timeout can also request a bounded HD recovery for the currently visible group. Normal playback still gives the preview its first frame before downloading HD. Recovery preserves the user's play/pause choice instead of treating the loader's temporary pause as a manual pause, and successful HD decoding clears the preview error interface.

## Source quality

| Media | Initial source | Final source |
| --- | --- | --- |
| DLSS original / enhanced | Mobile 540p preview; desktop low-bitrate 1080p preview | Original 1080p / genuine 4K, with one enhanced-side audio track |
| 3D previs / AI render | Existing low-bitrate preview | Original high-bitrate 720p streams, remuxed without picture re-encoding |
| Journey, Feel, Cybertruck | Existing mobile/720p previews | 1080p H.264, yuv420p, AAC, faststart, encoded from the original supplied films |
| 玄天诀 trailer | New compatible 540p H.264 preview | Compatible 1080p H.264/AAC, replacing the previous HEVC-only playback path |
| From Prompt to Motion | Small 480×384 preview with original SAR | Original 720×576 stream with SAR 118:81; no artificial upscale |

The character choreography video uses its separate timed-frame controller. Third-party embedded players retain their platform's playback logic. Neither is handed to the ordinary film upgrader.

## Adding a video

Provide a compatible preview in `data-src`, an optional lighter `data-src-mobile`, and the final compatible MP4 in `data-src-hd`. Load the shared progressive script before the player controller. Wrap synchronized comparison videos in one layout-bearing `data-progressive-group` container; do not put that attribute on a `display: contents` wrapper.

Controllers listen for bubbling `progressive-video:switch-start`, `:switch-end` and `:switch-error`. During replacement, they suspend synchronization, automatic seeks and source-error UI. Custom transport actions use `window.ProgressiveVideo.getIntent(video)` / `setIntent(video, patch)`. A controller that resumes playback after completion sets `event.detail.handled = true`; the engine then avoids a duplicate play attempt. `isSwitching(video)` covers both HD replacement and preview restoration.

`data-progressive-quality="hd"` records a completed upgrade for browser QA. All new asset URLs and changed script URLs are versioned for CDN/browser cache isolation.

`progressive-video:state` reports `state`, `loaded`, `total`, `percent`, `quality`, `retryable` and the owning `videos`. `window.ProgressiveVideo.getStatus(videoOrGroup)` returns the same state; `retry(videoOrGroup)` explicitly retries a failed visible group. Load `assets/progressive-video-status.js` after the engine, with the badge inside a layout-bearing `data-progressive-group`. Status buttons isolate keyboard and pointer events from the project deck and comparison divider.
