// Only these verified lossless variants replace their original PNG paths.
const losslessWebpStills = new Set([
  "alone_img_1",
  "alone_img_10",
  "alone_img_11",
  "alone_img_12",
  "alone_img_2",
  "alone_img_3",
  "alone_img_4",
  "alone_img_5",
  "alone_img_6",
  "alone_img_7",
  "alone_img_8",
  "alone_img_9",
  "everylook_img_1",
  "everylook_img_2",
  "everylook_img_3",
  "everylook_img_4",
  "everylook_img_5",
  "everylook_img_6",
  "ge_img_1",
  "ge_img_2",
  "ge_img_3",
  "ge_img_4",
  "invert_img_4",
  "reason_img_1",
  "reason_img_2",
  "reason_img_3",
  "reason_img_4",
  "reason_img_5",
  "reason_img_6",
  "rene_img_2",
  "rene_img_3",
  "rene_img_4",
  "wuhan_img_1",
  "wuhan_img_2",
  "wuhan_img_3",
  "wuhan_img_4",
  "wuhan_img_5",
  "wuhan_img_6"
]);

// Content source: 陈越作品集 2025 0828.pptx. See docs/portfolio-content-sources.md.
// Newer, user-confirmed AI project dates remain independent of this archive.
const projects = [
  {
    id: 'alone', title: 'Alone', chinese: '孤', role: 'Writing / Director / Color Grading', date: '08/2022', type: 'Narrative short', duration: '18 min',
    cover: 'alone_cover.jpg', hero: '../assets/images/home/alone-poster-20260925.webp', preview: '../assets/images/home/alone-preview-20260925.webp', prefix: 'alone', count: 12,
    // Synopsis and recognition supersede the deck: user update, 25 Sep 2026.
    description: 'Alone follows a Chinese woman living in the United States with her grandson. While he is away on a trip with his college classmates, she must pay her phone bill on her own. Unable to speak English, she struggles to complete the task, but resolves the problem with a neighbor’s help. After her grandson returns, she begins to face her limited English with greater acceptance and look for ways to overcome the language barrier.',
    descriptionZh: 'Alone，她讲述的是一个与孙子一起生活在美国的中国人，在孙子与大学同学出去游玩的时候独自面对支付电话费的故事。由于不懂英语，她遭遇了困难。在邻居的帮助下成功解决了问题，并且在最后孙子回来之后，她开始坦然面对自己英语不好的问题，并且开始寻找解决方法。',
    staffPicks: { image: '../assets/images/projects/alone/alone-staff-picks-2023-3840.png', mobileImage: '../assets/images/projects/alone/alone-staff-picks-2023-mobile.png', alt: '新片场精选周榜：2023年第35期、2023年第34期 / Xinpianchang Staff Picks — 2023, Weeks 35 & 34' },
    recognition: [
      { year: '2023', en: '53rd USA Film Festival — International Short Film Award Finalist · Screened', zh: '第53届美国电影节 — 国际短片奖决赛 · 展映' },
      { year: '2023', en: 'Los Angeles Film Awards — Best Documentary Winner', zh: '洛杉矶电影奖 — 最佳纪录片奖得主' },
      { year: '2022', en: 'New York International Film Awards™ — Grand Jury Award · Screened', zh: '纽约国际电影奖™ — 大陪审团奖 · 展映' },
      { year: '2023', en: 'International New York Film Festival — Official Selection · Screened', zh: '国际纽约电影节 — 入围 · 展映' },
      { year: '2022', en: 'New York Oniros Film Awards® — Finalist', zh: '纽约奧尼罗斯影展® — 入围决赛' },
      { year: '2023', en: '9th New Vision Graduation Film Showcase — Official Selection', zh: '第九届 New Vision 毕业影像展 — 入围' }
    ],
    link: ['Watch on Xinpianchang', 'https://www.xinpianchang.com/a12617120?from=UserProfile']
  },
  { id: 'tumbleweed', title: 'Tumbleweed', chinese: '风滚草', role: 'Editing / Color Grading', date: '08/2024', type: 'Narrative short', duration: '22 min', cover: 'tumbleweed_cover.jpg', prefix: 'tumbleweed', count: 6, description: 'A Syracuse University graduation film set in western China. I shaped the edit and color grade, completing post-production within one week.', descriptionZh: '雪城大学导演毕业短片，故事发生在中国西部。负责影片剪辑与调色，在一周内完成后期制作。', link: ['Watch via Baidu Pan · code 8888', 'https://pan.baidu.com/s/1SXGOQOQRrPMyNpA5KLSbug?pwd=8888'], size: 'wide' },
  { id: 'everylook', title: 'In Every Look', chinese: '在你眼里', role: 'Director / Color Grading', date: '10/2024', type: 'Narrative short', duration: '6 min', cover: 'everylook_cover.jpg', prefix: 'everylook', count: 6, description: 'A narrative short I directed while studying at the USC School of Cinematic Arts, with color grading developed as part of the film’s visual language.', descriptionZh: '在南加州大学电影艺术学院学习期间创作的剧情短片，负责导演与调色。', link: ['Watch on Bilibili', 'https://www.bilibili.com/video/BV1mH9YYLEy2/'] },
  { id: 'healing', title: 'Healing Wings', chinese: '治愈的翅膀', role: 'Color Grading / Location Sound / Audio Post', date: '10/2024', type: 'Feature documentary', duration: '120 min', cover: 'healing_cover.jpg', prefix: 'healing', count: 6, description: 'After losing her child to kidney cancer, a mother in the United States works to support pediatric kidney-cancer research across China and the US. The documentary brings together interviews with eight pediatric specialists and two affected families. My work spans color grading, location sound and audio post-production.', descriptionZh: '一位在美国生活的母亲失去患肾癌的孩子后，投身中美儿童肾癌研究支持工作。影片采访了中美两国的八位儿科专家及两个患儿家庭。我负责调色、现场录音及音频后期。' },
  { id: 'reason', title: 'Reason to Lie', chinese: '谎言的理由', role: 'Color Grading', date: '10/2024', type: 'Suspense short', duration: '19 min', cover: 'reason_cover.jpg', prefix: 'reason', count: 6, description: 'A suspense short made in collaboration with a Loyola Marymount University director. The grade explores a darker, Kodak-inspired palette to support the film’s atmosphere.', descriptionZh: '与洛约拉马利蒙特大学导演合作的悬疑短片。以偏暗、具有柯达胶片质感的色彩设计支持影片的悬疑氛围。', link: ['Watch via Baidu Pan · code 8888', 'https://pan.baidu.com/s/14J02p1QUOHUMcIonuLXpyw?pwd=8888'], size: 'wide' },
  { id: 'papa', title: 'Papa and Pluto', chinese: '普星', role: 'Producing / Color Grading', date: '09/2023', type: 'Narrative short', duration: '15 min', cover: 'papa_cover.jpg', prefix: 'papa', count: 4, description: 'A suspense short produced in Shanghai for a Columbia University MFA application. Production brought together four locations, a purpose-built basement set and a three-day shoot; I also completed the color grade.', descriptionZh: '为哥伦比亚大学 MFA 申请创作的悬疑短片。负责制片与调色，协调上海四处拍摄场地及地下室置景，完成三天拍摄。', link: ['Watch via Baidu Pan · code 8888', 'https://pan.baidu.com/s/1sjfUbMeWceF_hZZQkUS6yQ?pwd=8888'] },
  { id: 'power', title: 'Power Failure', chinese: '停电', role: 'Director', date: '12/2021', type: 'Narrative short', cover: 'power_cover.jpg', prefix: 'power', count: 6, description: 'A couple caught between work and an argument are given a chance to reconnect when a blackout interrupts their evening. The single-room film was shot in one four-hour night.', descriptionZh: '工作忙碌、缺少沟通的情侣在争吵时遭遇停电，意外获得重新交流的机会。影片以单一房间为场景，在一个夜晚的四小时内拍摄完成。', link: ['Watch on Bilibili', 'https://www.bilibili.com/video/BV1a3411v75i/'], size: 'wide' },
  { id: 'cube', title: 'The Cube', chinese: '方块', role: 'Director', date: '04/2021', type: 'Narrative short', cover: 'cube_cover.jpg', prefix: 'cube', count: 6, description: 'Awakening in an unfamiliar room, a character confronts an isolated, cube-like space and an inner conflict. The film was shot in one day across a street in Jing’an, an office and a warehouse.', descriptionZh: '主人公在陌生房间醒来，在孤立的方块空间中面对内心矛盾。影片于一天内在静安街道、办公室与仓库完成拍摄。', link: ['Watch on Bilibili', 'https://www.bilibili.com/video/BV1EU4y1t79w/'] },
  { id: 'invert', title: 'Invert', chinese: '倒影', role: 'Director', date: '12/2020', type: 'Narrative short', cover: 'invert_cover.jpg', prefix: 'invert', count: 6, description: 'Unexplained events repeat at home, gradually foreshadowing the character’s own ending. Three months of preparation led to a one-day shoot.', descriptionZh: '家中反复出现无法解释的事件，逐渐预示主人公自己的结局。经过三个月筹备，于一天内完成拍摄。', link: ['Watch on Bilibili', 'https://www.bilibili.com/video/BV1Wt4y1k7h7/'] },
  { id: 'wuhan', collection: 'tvc', title: 'Wuhan Jiudao', chinese: '武汉九道文化', role: 'Editing / Color Grading', date: '07/2025', type: 'Company film', count: 6, preview: '../assets/images/tvc/wuhan-05.webp', description: 'A company film rooted in Wuhan’s Taoist culture. I supported the director through a month of preparation, provided on-set editing and grading previews, and completed the post-production edit and grade.', descriptionZh: '武汉九道文化企业宣传片。前期与导演协作，为拍摄和后期提供技术支持；现场完成剪辑、调色预览，并在约半个月内完成后期剪辑与调色。', link: ['View film on WeChat', 'https://mp.weixin.qq.com/s/hXrt1FpEUkuQJgpZvSd8tQ'] },
  { id: 'rene', collection: 'tvc', title: 'René Furterer', chinese: '馥绿德雅 × 金丝带公益', role: 'Editing / Color Grading', date: '04/2025', type: 'Brand & public-welfare film', count: 5, preview: '../assets/images/tvc/rene-04.webp', description: 'A public-welfare film for René Furterer and Guangzhou Golden Ribbon. Post-production combined editing, color grading and motion-graphics coordination; the film was released through the brand’s official social channels.', descriptionZh: '馥绿德雅与广州金丝带公益合作宣传片。负责剪辑、调色及图形包装协作，作品发布于品牌官方小红书、微博与微信公众号。', link: ['View film on WeChat', 'https://mp.weixin.qq.com/s/cYBaOpyelteCD5U7np7XwA'] },
  { id: 'ge', collection: 'tvc', title: 'GE HealthCare', chinese: '通用医疗', role: 'Assistant Direction / On-set Editing', date: '08/2023', type: 'Healthcare commercial', count: 6, preview: '../assets/images/tvc/ge-02.webp', description: 'A medical commercial created for physicians in China. I assisted the director during preparation and production, building rough cuts on set so the client could review the developing film during the shoot.', descriptionZh: '面向中国医生的医疗广告。负责导演助理工作及现场剪辑，从前期筹备到现场执行提供支持，并及时制作粗剪，供客户在拍摄过程中审看。' },
  { id: 'feihe', collection: 'tvc', title: 'Feihe', chinese: '飞鹤 · 5.28 中国宝宝日', role: 'Producing / Editing / Sound', date: '05/2022', type: 'Baby Day branded short', count: 4, description: 'A branded short for Feihe’s May 28 Baby Day campaign. I coordinated with New York-based artist Song Ting, supported preparation and filming, and worked on sound, editing and graphics through delivery.', descriptionZh: '飞鹤 5.28 中国宝宝日品牌短片。对接纽约艺术家宋婷，协调前期筹备与拍摄，负责声音、剪辑及包装素材整理等工作。', link: ['View campaign', 'http://fh528zgbbd.cloud-top.com.cn/?scene=wechat-koc-kol&mz_ca=2299469&mz_sp=8AKJR'] }
];

const grid = document.querySelector('#film-grid');
const dialog = document.querySelector('#project-dialog');
const dialogTitle = document.querySelector('#dialog-title');
const dialogRole = document.querySelector('#dialog-role');
const dialogHero = document.querySelector('#dialog-hero');
const dialogDescription = document.querySelector('#dialog-description');
const dialogLinks = document.querySelector('#dialog-links');
const dialogGallery = document.querySelector('#dialog-gallery');

const collection = grid.dataset.collection || 'film';
const visibleProjects = projects.filter(project => (project.collection || 'film') === collection);
const baseTitle = document.title;
let currentProject = null;
let returnFocus = null;
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const heroSource = project => project.hero || (project.collection === 'tvc' ? `../assets/images/tvc/${project.id}-01.webp` : `../film/images/${project.cover}`);

function recognitionItemsHTML(items) {
  return items.map(item => `<li><span class="film-recognition-list__year">${escapeHTML(item.year)}</span><div><p lang="en">${escapeHTML(item.en)}</p><p lang="zh-Hans">${escapeHTML(item.zh)}</p></div></li>`).join('');
}

// The page overview and project dialog share the same bilingual recognition.
document.querySelectorAll('[data-project-recognition]').forEach(list => {
  const project = projects.find(item => item.id === list.dataset.projectRecognition);
  list.innerHTML = recognitionItemsHTML(project?.recognition || []);
});

visibleProjects.forEach((project, index) => {
  const card = document.createElement('a');
  card.href = `#${project.id}`;
  // Keep the wide / paired / paired rhythm tied to order, without empty grid cells.
  const isWide = collection === 'film' && index % 3 === 0;
  card.className = `film-card${isWide ? ' film-card--wide' : ''}${project.id === 'alone' ? ' film-card--poster' : ''}`;
  const preview = project.preview || (collection === 'tvc' ? `../assets/images/tvc/${project.id}-preview.webp` : `../film/images/${project.cover}`);
  card.innerHTML = `<img src="${preview}" alt="" loading="lazy" decoding="async"><span class="film-card__shade"></span><span class="film-card__meta"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHTML(project.title)}<small lang="zh-Hans">${escapeHTML(project.chinese)}</small></strong><em>${escapeHTML(project.role)}<br>${project.date}</em></span>`;
  card.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    returnFocus = card;
    history.pushState({ portfolioProject: true }, '', card.href);
    openProject(project);
  });
  grid.appendChild(card);
});

function openProject(project) {
  if (dialog.open && currentProject === project.id) return;
  currentProject = project.id;
  document.title = `${project.title} — Steven Chen`;
  dialogTitle.textContent = project.title;
  dialogRole.textContent = `${project.chinese} / ${project.type}`;
  dialogHero.src = heroSource(project);
  dialogHero.alt = `${project.title} key art`;
  dialogDescription.innerHTML = `<p>${escapeHTML(project.description)}</p><p lang="zh-Hans">${escapeHTML(project.descriptionZh)}</p>`;
  if (project.staffPicks) {
    dialogDescription.innerHTML += `<figure class="alone-staff-picks alone-staff-picks--detail"><picture><source media="(max-width: 560px)" srcset="${escapeHTML(project.staffPicks.mobileImage)}" width="1920" height="640"><img src="${escapeHTML(project.staffPicks.image)}" width="3840" height="320" decoding="async" alt="${escapeHTML(project.staffPicks.alt)}"></picture></figure>`;
  }
  document.querySelector('#dialog-facts').innerHTML = `<div><dt>Role</dt><dd>${escapeHTML(project.role)}</dd></div><div><dt>Date</dt><dd>${project.date}</dd></div>${project.duration ? `<div><dt>Runtime</dt><dd>${project.duration}</dd></div>` : ''}`;
  const recognition = document.querySelector('#dialog-recognition');
  recognition.hidden = !project.recognition?.length;
  recognition.innerHTML = project.recognition?.length ? `<h3>Recognition / <span lang="zh-Hans">荣誉</span></h3><ol class="film-recognition-list">${recognitionItemsHTML(project.recognition)}</ol>` : '';
  dialogLinks.innerHTML = project.link ? `<a href="${escapeHTML(project.link[1])}" target="_blank" rel="noreferrer">${escapeHTML(project.link[0])} ↗</a>` : '<p class="viewing-note">Selected stills below · No public viewing link provided.</p>';
  dialogGallery.innerHTML = '';
  for (let index = 1; index <= project.count; index += 1) {
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    const stem = `${project.prefix}_img_${index}`;
    image.src = collection === 'tvc' ? `../assets/images/tvc/${project.id}-${String(index).padStart(2, '0')}.webp` : `../film/images/${stem}.${losslessWebpStills.has(stem) ? 'webp' : 'png'}`;
    image.alt = `${project.title} — project image ${index}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    if (collection === 'tvc' && ((project.id === 'rene' && index === 5) || (project.id === 'feihe' && index === 4))) figure.className = 'gallery-portrait';
    const caption = document.createElement('figcaption');
    caption.textContent = `${project.title} / ${String(index).padStart(2, '0')}`;
    figure.append(image, caption);
    dialogGallery.appendChild(figure);
  }
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  document.body.classList.add('dialog-open');
}

function closeProject() {
  if (history.state?.portfolioProject) history.back();
  else {
    history.replaceState(null, '', location.pathname + location.search);
    dialog.close();
  }
}

document.querySelector('#dialog-close').addEventListener('click', closeProject);
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeProject(); });
dialog.addEventListener('cancel', event => { event.preventDefault(); closeProject(); });
dialog.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
  dialogHero.removeAttribute('src');
  dialogGallery.replaceChildren();
  document.title = baseTitle;
  currentProject = null;
  returnFocus?.focus({ preventScroll: true });
});

function syncProjectLocation() {
  const project = visibleProjects.find(item => `#${item.id}` === location.hash);
  if (project) openProject(project);
  else if (dialog.open) dialog.close();
}
window.addEventListener('popstate', syncProjectLocation);
window.addEventListener('hashchange', syncProjectLocation);
syncProjectLocation();
