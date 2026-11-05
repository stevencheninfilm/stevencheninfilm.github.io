#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://stevencheninfilm.com';
const OUTPUTS = { 'avocado-ai/index.html': 'en', 'en/avocado-ai/index.html': 'en', 'zh/avocado-ai/index.html': 'zh' };
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const account = 'https://www.douyin.com/user/MS4wLjABAAAAY7HD_9adJB--CH4qwBrmMwY0dQYcDh5LYZ0F_vfe3yK04ZZnfcDT821j1Wasrni8';
const douyinFilms = {
  'roadster-01': 'https://www.douyin.com/video/7697548458885991689',
  'roadster-02': 'https://www.douyin.com/video/7703382715244072202'
};
const stills = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/images/avocado-ai/stills/manifest.json'), 'utf8'));
const stillDescriptions = {
  zh: [
    ['收费站前的拥堵车流', 'Roadster 喷射升空，飞越收费站', '驾驶舱视角俯瞰收费站', '收费站顶部升起发射装置'],
    ['夜间驾驶舱中的角色特写', '驾驶者回望车窗外的金门大桥', '副驾驶座上系着安全带的画像', '直升机俯瞰桥面追逐', '两辆 Roadster 并行穿过桥面车流', '直升机驾驶舱中的角色特写', '驾驶舱视角中的桥面飞行轨迹', '两辆 Roadster 飞越断桥', '金门大桥上空的车辆与驾驶者', '车内角色仰望桥面上空', '两辆 Roadster 飞向运输机货舱', '运输机驾驶舱中的两名角色', 'Fast & Furious: Tesla Roadster 片名画面']
  ],
  en: [
    ['Traffic waiting at the toll station', 'The Roadster lifts off above the toll station', 'A cockpit view above the toll station', 'Launch equipment rises from the toll station'],
    ['Character close-up in a night-time cockpit', 'A driver looks back toward the Golden Gate Bridge', 'A framed portrait buckled into the passenger seat', 'A helicopter follows the bridge chase', 'Two Roadsters race side by side', 'Character close-up in a helicopter cockpit', 'A flight trail seen from the driving seat', 'Two Roadsters fly beyond the broken bridge', 'A driver above the Golden Gate Bridge', 'A character looks up from the cockpit', 'Two Roadsters approach a cargo aircraft', 'Two characters in the aircraft cockpit', 'Fast & Furious: Tesla Roadster title frame']
  ]
};
const copy = {
  zh: {
    title: '鳄梨AI — Steven Chen', description: '鳄梨AI / YueVisuals。把离谱拍成电影：两支 Tesla Roadster AI 创意短片，及其背后的叙事与镜头设计。', role: '生成式AI艺术家 / 影像创作者 / 电影人', skip: '跳至作品', nav: ['作品', 'AI 影像', '抖音AI创作', '电影', '广告', '关于'],
    eyebrow: '个人独立创作 · 抖音 AI 影像', name: '鳄梨AI', account: 'YueVisuals / AI Filmmaking', headline: ['把离谱，', '拍成电影。'], translation: 'Unexpected ideas. Cinematic stories.', intro: '把日常推向想象，<br>让一个出乎意料的瞬间，长成一支短片。', profile: '抖音主页', copyProfile: '复制账号链接', copied: '已复制', copyFailed: '复制未成功，可直接打开链接', rail: '两支精选短片', watch: '观看短片', watchFull: '观看完整短片', preview: '静音预览', previewHint: '停留预览 · 点击观看', details: '创作笔记', views: '播放', likes: '点赞', shares: '分享', snapshot: '抖音后台数据快照，非实时数据。', snapshotDetail: '数据来源：抖音作品后台。', previous: '上一支', next: '下一支', filmCount: '当前作品', noteLabel: '叙事 / 镜头 / 节奏', noteHeadline: '荒诞是入口，<br>镜头让它成立。', noteDescription: '从一个设定，到一段完整体验。', premise: '创意切入', craft: '叙事与制作', contribution: '个人创作', contributionText: '创意策划 · AI 影像 · 剪辑与声音', noteTabs: '选择创作笔记', related: '继续探索', relatedTitle: '下一个想象，<br>从哪里开始？', relatedText: 'AI 叙事、品牌影像与新的视觉可能。', contact: '聊聊创作合作', backAI: '回到 AI 影像', close: '关闭影院', cinema: '鳄梨AI · 站内影院', play: '播放', mute: '静音', time: '播放时间', seek: '拖动播放进度', fullscreen: '全屏观看', loading: '正在载入短片', unavailable: '影片暂时不可用，请点按重试。', finished: '这一幕结束，下一幕继续。', watchNext: '观看另一支短片', copyFilm: '复制作品链接', direct: '直接打开视频',
    films: [
      { id: 'roadster-01', title: '堵车？直接飞过去。', english: 'Tesla Roadster · An unexpected detour', category: 'AI 荒诞短片', date: '2026.10.17', iso: '2026-10-17', duration: '00:18', views: '485.4万', likes: '7万', shares: '11.2万', alt: '一辆飞行 Roadster 越过堵车驶向中国收费站', official: '特斯拉 Roadster 创意视频', note: '飞越堵车，<br>停在收费站。', premise: '以 Roadster 飞越堵车开场，用中国收费站的荒诞反转制造笑点。一个熟悉的出行烦恼，被推向意料之外的结局。', craft: '让飞行的爽感与收费站的现实感形成反差。用短促的铺垫、清晰的镜头信息和结尾反转，把汽车话题转化为易于分享的 AI 短片。', caption: '日常设定 / 荒诞反转 / 18 秒叙事' },
      { id: 'roadster-02', title: '《速度与激情》× Roadster', english: 'Fast & Furious: Tesla Roadster', category: '非官方 AI 概念预告', date: '2026.11.01', iso: '2026-11-01', duration: '01:31', views: '43.1万', likes: '1.8万', shares: '3.7万', alt: 'Fast & Furious Tesla Roadster 海报：角色、飞行跑车与金门大桥', official: 'FAST & FURIOUS: TESLA ROADSTER', note: '把动作电影，<br>驶进另一种想象。', premise: '以《速度与激情》的动作片语汇重新想象 Tesla Roadster，通过 AI 影像构建角色、车辆与动作场景。', craft: '从角色反应到车辆运动，再到大场面的节奏推进，用镜头衔接、剪辑和声音构成完整的概念预告。非官方创意演绎，呈现个人对动作影像的探索。', caption: '动作语汇 / 场景构建 / 非官方概念预告' }
    ]
  },
  en: {
    title: 'YueVisuals — Steven Chen', description: 'YueVisuals / 鳄梨AI. Unexpected ideas, cinematic stories. Two Tesla Roadster AI short films, with notes on narrative and filmmaking.', role: 'GENERATIVE AI ARTIST / FILMMAKER', skip: 'Skip to films', nav: ['Work', 'AI Visuals', 'YueVisuals', 'Film', 'TVC', 'About'],
    eyebrow: 'INDEPENDENT FILMS · AI ON DOUYIN', name: 'YueVisuals', account: '鳄梨AI / AI Filmmaking', headline: ['Unexpected ideas.', 'Cinematic stories.'], translation: '鳄梨AI · 把离谱，拍成电影。', intro: 'Take an everyday idea somewhere unexpected.<br>Then give it the language of cinema.', profile: 'Douyin profile', copyProfile: 'Copy profile link', copied: 'Copied', copyFailed: 'Could not copy. Open the link directly.', rail: 'Two selected films', watch: 'Watch film', watchFull: 'Watch the full film', preview: 'Silent preview', previewHint: 'Hover to preview · Click to watch', details: 'Creative notes', views: 'views', likes: 'likes', shares: 'shares', snapshot: 'Douyin analytics snapshot. Figures are not live.', snapshotDetail: 'Source: Douyin creator analytics.', previous: 'Previous film', next: 'Next film', filmCount: 'Current film', noteLabel: 'NARRATIVE / CAMERA / RHYTHM', noteHeadline: 'A strange idea.<br>A considered frame.', noteDescription: 'From a simple premise to a complete viewing experience.', premise: 'The premise', craft: 'Narrative & craft', contribution: 'Independent creation', contributionText: 'Concept · AI filmmaking · Editing & sound', noteTabs: 'Choose creative notes', related: 'Keep exploring', relatedTitle: 'Where does the<br>next idea begin?', relatedText: 'AI stories, brand films and new visual possibilities.', contact: 'Start a conversation', backAI: 'Explore AI visuals', close: 'Close cinema', cinema: 'YUEVISUALS · PRIVATE SCREENING', play: 'Play', mute: 'Sound off', time: 'Playback time', seek: 'Seek film', fullscreen: 'Full screen', loading: 'Loading film', unavailable: 'The film could not load. Select Retry to try again.', finished: 'One story ends. Another begins.', watchNext: 'Watch the other film', copyFilm: 'Copy film link', direct: 'Open video directly',
    films: [
      { id: 'roadster-01', title: 'Traffic? Fly over it.', english: 'Tesla Roadster · An unexpected detour', category: 'AI COMEDY SHORT', date: '2026.10.17', iso: '2026-10-17', duration: '00:18', views: '4.854M', likes: '70K', shares: '112K', alt: 'A flying Roadster passes traffic on its way to a Chinese toll station', official: 'Tesla Roadster — An unexpected detour', note: 'Past the traffic.<br>Into the punchline.', premise: 'A Roadster flies over a traffic jam, only to encounter an unexpected turn at a Chinese toll station. An everyday frustration becomes an absurd short story.', craft: 'The freedom of flight meets the everyday logic of a toll booth. A concise setup, clear visual information and a final reversal turn an automotive idea into a shareable AI short.', caption: 'Everyday premise / Absurd reversal / 18-second story' },
      { id: 'roadster-02', title: 'Fast & Furious × Roadster', english: 'Fast & Furious: Tesla Roadster', category: 'UNOFFICIAL AI CONCEPT TRAILER', date: '2026.11.01', iso: '2026-11-01', duration: '01:31', views: '431K', likes: '18K', shares: '37K', alt: 'Fast & Furious Tesla Roadster poster with characters, flying cars and the Golden Gate Bridge', official: 'FAST & FURIOUS: TESLA ROADSTER', note: 'Action cinema.<br>Reimagined.', premise: 'Reimagining the Tesla Roadster through the action-film vocabulary of Fast & Furious, building characters, vehicles and set pieces with AI imagery.', craft: 'Character reactions, vehicle movement and large-scale action are connected through camera choices, editing and sound. An unofficial concept trailer and an independent exploration of action filmmaking.', caption: 'Action vocabulary / World building / Unofficial concept trailer' }
    ]
  }
};

const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
const play = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7z"/></svg>';

function renderPage(file, language) {
  const c = copy[language], zh = language === 'zh';
  const relative = target => path.posix.relative(path.posix.dirname(file), target);
  const asset = target => relative(`assets/${target}`);
  const page = lang => `/${lang}/avocado-ai/index.html`;
  const hrefs = [`/${language}/index.html`, `/${language}/ai/index.html`, page(language), '/film/Film.html', '/tvc/index.html', '/about.html'];
  const image = (film, portrait = false, priority = false) => {
    const name = `${film.id}-poster${portrait ? '-portrait' : ''}`;
    const width = portrait ? 810 : 1600, height = portrait ? 1080 : 900;
    const mobileWidth = portrait ? 540 : 800;
    return `<img src="${asset(`images/avocado-ai/${name}.webp`)}" srcset="${asset(`images/avocado-ai/${name}-mobile.webp`)} ${mobileWidth}w, ${asset(`images/avocado-ai/${name}.webp`)} ${width}w" sizes="(max-width: 680px) 82vw, (max-width: 1000px) 43vw, 27vw" width="${width}" height="${height}" alt="${escape(film.alt)}" decoding="async" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
  };
  const filmLink = film => asset(`videos/avocado-ai/${film.id}-720p.mp4`);
  const watchLink = film => douyinFilms[film.id];
  const gallery = (film, index) => {
    const group = stills.groups.find(group => group.id === film.id);
    return `<section class="av-stills" aria-labelledby="stills-${film.id}"><header><h4 id="stills-${film.id}">${zh ? '精选剧照' : 'Selected stills'}</h4><span>${String(group.items.length).padStart(2, '0')} ${zh ? '幅画面 · 点击放大' : 'FRAMES · SELECT TO EXPLORE'}</span></header><div class="av-still-grid${index === 1 ? ' av-still-grid--wide' : ''}">${group.items.map((item, i) => {
      const thumb = item.thumbnail, full = item.full;
      const description = stillDescriptions[language][index][i];
      const fullURL = asset(`images/avocado-ai/stills/${full.src}`);
      return `<a class="av-still" href="${fullURL}" data-gallery-item data-gallery="${film.id}" data-still-number="${i + 1}" data-gallery-title="${escape(film.title)}" data-caption="${escape(description)}" aria-label="${escape((zh ? '放大剧照' : 'View still') + ' ' + (i + 1) + '：' + description)}"><img src="${asset(`images/avocado-ai/stills/${thumb.src}`)}" width="${thumb.width}" height="${thumb.height}" alt="${escape(description)}" loading="lazy" decoding="async"><span aria-hidden="true"><b>${String(i + 1).padStart(2, '0')}</b><i>↗</i></span></a>`;
    }).join('')}</div></section>`;
  };
  const card = (film, index) => `<article class="av-film" data-film="${film.id}" aria-labelledby="title-${film.id}">
        <a class="av-film-open" href="${watchLink(film)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(c.watch + '：' + film.title)}">
          <div class="av-film-art">${image(film, index === 1, index === 0)}
            <video class="av-hover-video" data-hover-src="${asset(`videos/avocado-ai/${film.id}-hover.mp4`)}" preload="none" muted loop playsinline disablepictureinpicture aria-hidden="true" tabindex="-1"></video>
            <span class="av-film-no" aria-hidden="true">0${index + 1}</span><span class="av-preview-state" aria-hidden="true"><i></i>${c.preview}</span>
            <span class="av-watch-prompt">${play}<span>${c.watch}<small>${zh ? '在抖音观看完整短片 ↗' : 'Watch on Douyin ↗'}</small></span></span><span class="av-film-duration">${film.duration}</span>
            <span class="av-hover-hint" aria-hidden="true">${c.previewHint}</span>
          </div>
        </a>
        <div class="av-film-topline"><span>${film.category}</span><time datetime="${film.iso}">${film.date}</time></div>
        <h2 id="title-${film.id}"><a href="${watchLink(film)}" target="_blank" rel="noopener noreferrer">${escape(film.title)}</a></h2>
        <p class="av-film-english" lang="en">${escape(film.english)}</p>
        <div class="av-film-metrics"><div class="av-stat-heading"><span><i aria-hidden="true">🔥</i>${zh ? '传播表现' : 'REACH & RESPONSE'}</span><a href="#${film.id}" data-note-link="${film.id}">${c.details}<span aria-hidden="true">↗</span></a></div>
          <div class="av-film-response"><p><strong>${film.views}</strong><span>${c.views}</span></p></div>
          <div class="av-film-smallstats"><p><strong>${film.likes}</strong><span>${c.likes}</span></p><p><strong>${film.shares}</strong><span>${c.shares}</span></p></div>
        </div>
      </article>`;
  const note = (film, index) => `<section class="av-note-panel" id="${film.id}" role="tabpanel" aria-labelledby="tab-${film.id}" data-note-panel="${film.id}">
            <p class="av-eyebrow">0${index + 1} / ${escape(film.official)}</p><h3>${film.note}</h3>
            <div class="av-note-columns"><div><h4>${c.premise}</h4><p>${film.premise}</p></div><div><h4>${c.craft}</h4><p>${film.craft}</p></div></div>
            ${gallery(film, index)}
            <div class="av-note-credit"><span>${c.contribution}</span><p>${c.contributionText}</p><a href="${watchLink(film)}" target="_blank" rel="noopener noreferrer">${c.watch} ${arrow}</a></div>
          </section>`;
  const viewer = (film, index) => `<section class="av-watch-panel" data-watch-panel="${film.id}" data-workflow-item aria-hidden="true" hidden>
          <div class="av-watch-player" data-workflow-player data-progressive-group>
            <div class="av-watch-frame">
              <video data-workflow-video data-src="${filmLink(film)}" data-src-hd="${asset(`videos/avocado-ai/${film.id}-1080p.mp4`)}" poster="${asset(`images/avocado-ai/${film.id}-poster.webp`)}" width="1920" height="1080" preload="none" muted playsinline aria-label="${escape(film.title)}"></video>
              <div class="av-loading" data-loading hidden><span></span>${c.loading}</div>
              <div class="av-endcard" data-endcard hidden><p>${c.finished}</p><button type="button" data-next-film>${c.watchNext} <span aria-hidden="true">→</span></button></div>
              <div class="hd-status" data-progressive-status hidden><span data-hd-label></span><progress data-hd-progress max="100" hidden></progress><span data-hd-percent aria-hidden="true" hidden></span><button type="button" data-hd-retry hidden></button></div>
            </div>
            <div class="av-transport" data-player-controls hidden>
              <button type="button" data-player-toggle>${c.play}</button><output data-player-time role="status" aria-label="${c.time}">0:00 / 0:00</output>
              <input type="range" data-player-seek min="0" max="100" step="0.05" value="0" aria-label="${c.seek}" disabled>
              <button type="button" data-player-sound aria-pressed="false">${c.mute}</button><button class="av-fullscreen" type="button" data-fullscreen aria-label="${c.fullscreen}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/></svg></button>
            </div><p class="av-player-status" role="status" data-player-status></p>
          </div>
          <div class="av-watch-caption"><div><h3>${escape(film.title)}</h3><p>${film.category} <span aria-hidden="true">/</span> ${film.date} <span aria-hidden="true">/</span> ${film.duration}</p></div><div class="av-watch-links"><button type="button" data-copy-film>${c.copyFilm}</button><a href="${filmLink(film)}" target="_blank" rel="noopener">${c.direct} ↗</a></div></div>
        </section>`;
  return `<!doctype html>
<html lang="${zh ? 'zh-Hans' : 'en'}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#0b0c0b">
  <title>${escape(c.title)}</title><meta name="description" content="${escape(c.description)}">
  <link rel="canonical" href="${ORIGIN}${page(language)}"><link rel="alternate" hreflang="en" href="${ORIGIN}${page('en')}"><link rel="alternate" hreflang="zh-Hans" href="${ORIGIN}${page('zh')}"><link rel="alternate" hreflang="x-default" href="${ORIGIN}/avocado-ai/index.html">
  <meta property="og:type" content="website"><meta property="og:title" content="${escape(c.title)}"><meta property="og:description" content="${escape(c.description)}"><meta property="og:image" content="${ORIGIN}/assets/images/avocado-ai/roadster-02-poster.webp"><meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="${asset('site.css')}?v=20261104-avocado-1"><link rel="stylesheet" href="${asset('site-language.css')}?v=20261104-avocado-1"><link rel="stylesheet" href="${asset('progressive-video-status.css')}?v=20261104-hd-status-1"><link rel="stylesheet" href="${asset('avocado-ai.css')}?v=20261105-stills-1">
  <script defer src="${asset('site-language.js')}?v=20261104-avocado-1"></script>
</head>
<body class="avocado-page" data-language="${language}">
  <a class="skip-link" href="#main">${c.skip}</a>
  <header class="site-header av-header"><a class="wordmark" href="/${language}/index.html"><span>STEVEN CHEN</span><span class="wordmark-role">${c.role}</span></a>
    <nav class="primary-nav" aria-label="${zh ? '主导航' : 'Main navigation'}">${c.nav.map((label, i) => `<a href="${hrefs[i]}"${i === 2 ? ' class="is-active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <nav class="site-language" aria-label="Language / 语言"><a href="${page('zh')}" data-site-language="zh" lang="zh-Hans"${zh ? ' aria-current="page"' : ''}>中文</a><span aria-hidden="true">/</span><a href="${page('en')}" data-site-language="en" lang="en"${!zh ? ' aria-current="page"' : ''}>ENG</a></nav>
  </header>
  <main id="main" class="av-main">
    <section class="av-hero" aria-labelledby="av-title">
      <div class="av-intro"><p class="av-eyebrow">${c.eyebrow}</p>
        <div class="av-account"><img src="${asset('images/avocado-ai/yuevisuals-avatar.webp')}" width="48" height="48" alt=""><div><p>${c.name}</p><span>${c.account}</span></div></div>
        <h1 id="av-title"><span>${c.headline[0]}</span><em>${c.headline[1]}</em></h1><p class="av-translation" lang="${zh ? 'en' : 'zh-Hans'}">${c.translation}</p><p class="av-lead">${c.intro}</p>
        <div class="av-profile-links"><a href="${account}" target="_blank" rel="noopener noreferrer">${c.profile}${arrow}</a><button type="button" data-copy-profile aria-label="${c.copyProfile}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H5v14h11v-4M9 3h11v12H9z"/></svg></button></div>
      </div>
      <div class="av-film-collection"><div class="av-rail-top"><p>${c.rail}</p><span>2026 / 01—02</span></div><div class="av-film-rail" data-film-rail>${c.films.map(card).join('\n')}</div><div class="av-rail-controls" data-rail-controls hidden><span aria-live="polite" aria-label="${c.filmCount}" data-rail-count>01 / 02</span><div><button type="button" data-rail-prev aria-label="${c.previous}">←</button><button type="button" data-rail-next aria-label="${c.next}">→</button></div></div></div>
    </section>
    <div class="av-stats-caption"><span>${c.snapshot}</span><span>${c.snapshotDetail}</span></div>
    <section class="av-notes" id="creative-notes" aria-labelledby="notes-title"><header><p class="av-eyebrow">${c.details}</p><h2 id="notes-title">${c.noteHeadline}</h2><p>${c.noteDescription}</p><span class="av-notes-spine">${c.noteLabel}</span></header>
      <div class="av-notes-content"><div class="av-note-tabs" role="tablist" aria-label="${c.noteTabs}">${c.films.map((f, i) => `<button type="button" id="tab-${f.id}" role="tab" aria-controls="${f.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? '0' : '-1'}" data-note-tab="${f.id}"><span>0${i + 1}</span>${escape(i ? (zh ? '动作再想象' : 'Action, reimagined') : (zh ? '收费站反转' : 'An unexpected detour'))}</button>`).join('')}</div>${c.films.map(note).join('\n')}</div>
    </section>
    <section class="av-contact" aria-labelledby="contact-title"><div><p class="av-eyebrow">${c.related}</p><h2 id="contact-title">${c.relatedTitle}</h2><p>${c.relatedText}</p></div><div class="av-contact-links"><a class="av-contact-main" href="mailto:kieen1454@gmail.com">${c.contact}${arrow}</a><a href="/${language}/ai/index.html">${c.backAI}<span aria-hidden="true">→</span></a></div></section>
  </main>
  <footer class="av-footer"><span>© 2026 STEVEN CHEN / YUEVISUALS</span><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">沪ICP备2026056937号-1</a></footer>
  <dialog class="av-cinema" id="av-cinema" aria-labelledby="cinema-title" data-cinema><div class="av-cinema-shell">
      <header class="av-cinema-header"><div><p>${c.cinema}</p><h2 id="cinema-title" data-cinema-title>${escape(c.films[0].title)}</h2></div><button type="button" class="av-close" data-cinema-close aria-label="${c.close}"><span aria-hidden="true">×</span></button></header>
      ${c.films.map(viewer).join('\n')}
      <nav class="av-cinema-films" aria-label="${c.rail}">${c.films.map((f, i) => `<button type="button" data-viewer-film="${f.id}" aria-pressed="false"><span>0${i + 1}</span>${escape(f.title)}<small>${f.duration}</small></button>`).join('')}</nav>
      <div class="av-announcement" data-copy-announcement role="status" aria-live="polite"></div>
    </div></dialog>
  <div class="av-toast" role="status" aria-live="polite" data-toast hidden></div>
  <dialog class="av-lightbox" data-lightbox aria-labelledby="av-lightbox-title">
    <header class="av-lightbox-top"><div><p>${zh ? '精选剧照' : 'SELECTED STILLS'}</p><h2 id="av-lightbox-title" data-lightbox-title></h2></div><button type="button" class="av-close" data-lightbox-close aria-label="${zh ? '关闭看图' : 'Close image viewer'}"><span aria-hidden="true">×</span></button></header>
    <figure class="av-lightbox-stage" data-lightbox-stage><img data-lightbox-image alt="" draggable="false"><div class="av-lightbox-loading" data-lightbox-loading role="status" hidden>${zh ? '正在加载画面' : 'Loading image'}</div><div class="av-lightbox-error" data-lightbox-error hidden><p>${zh ? '图片暂未加载成功' : 'The image could not load'}</p><button type="button" data-lightbox-retry>${zh ? '重试' : 'Retry'}</button><a data-lightbox-direct target="_blank" rel="noopener">${zh ? '直接打开图片 ↗' : 'Open image directly ↗'}</a></div></figure>
    <button type="button" class="av-lightbox-prev" data-lightbox-prev aria-label="${zh ? '上一张剧照' : 'Previous still'}">←</button><button type="button" class="av-lightbox-next" data-lightbox-next aria-label="${zh ? '下一张剧照' : 'Next still'}">→</button>
    <footer class="av-lightbox-bottom"><p data-lightbox-caption></p><span data-lightbox-count aria-live="polite"></span><span class="av-lightbox-hint">${zh ? '左右切换 · Esc 关闭' : 'ARROWS TO EXPLORE · ESC TO CLOSE'}</span></footer>
  </dialog>
  <script defer src="${asset('progressive-video.js')}?v=20261104-hd-status-1"></script><script defer src="${asset('workflow-player.js')}?v=20261104-player-ended-1"></script><script defer src="${asset('progressive-video-status.js')}?v=20261104-hd-status-2"></script><script defer src="${asset('avocado-ai.js')}?v=20261105-stills-1"></script><script defer src="${asset('avocado-gallery.js')}?v=20261105-stills-1"></script>
</body>
</html>
`;
}

function main() {
  const check = process.argv.includes('--check');
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = renderPage(file, language), target = path.join(ROOT, file);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) throw new Error(`${file} is stale. Run node tools/build-avocado-pages.cjs`);
    } else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, html); }
  }
  console.log(`${check ? 'Verified' : 'Built'} ${Object.keys(OUTPUTS).length} YueVisuals cinema routes.`);
}
if (require.main === module) main();
module.exports = { OUTPUTS, copy, renderPage };
