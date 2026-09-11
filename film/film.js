const projects = [
  { title: 'Tumbleweed', role: 'Director', year: '2024', cover: 'tumbleweed_cover.jpg', prefix: 'tumbleweed', count: 6, description: 'A graduation film set in western China, shaped by distance, silence, and the landscapes people leave behind.', link: ['Watch via Baidu Pan', 'https://pan.baidu.com/s/1SXGOQOQRrPMyNpA5KLSbug?pwd=8888'], size: 'wide' },
  { title: 'In Every Look', role: 'Director', year: '2024', cover: 'everylook_cover.jpg', prefix: 'everylook', count: 6, description: 'A narrative short about attention, intimacy, and the meaning held inside a glance.', link: ['Watch on Bilibili', 'https://www.bilibili.com/video/BV1mH9YYLEy2/'] },
  { title: 'Healing Wings', role: 'Documentary', year: '2024', cover: 'healing_cover.jpg', prefix: 'healing', count: 6, description: 'A documentary portrait centered on care, recovery, and the people who make hope practical.' },
  { title: 'Reason to Lie', role: 'Colorist', year: '2024', cover: 'reason_cover.jpg', prefix: 'reason', count: 6, description: 'A suspense short with a restrained, shadow-led color language.', link: ['Watch via Baidu Pan', 'https://pan.baidu.com/s/14J02p1QUOHUMcIonuLXpyw?pwd=8888'], size: 'wide' },
  { title: 'Papa and Pluto', role: 'Producer', year: '2023', cover: 'papa_cover.jpg', prefix: 'papa', count: 4, description: 'A dark suspense story developed and produced around an intimate emotional premise.', link: ['Watch via Baidu Pan', 'https://pan.baidu.com/s/1sjfUbMeWceF_hZZQkUS6yQ?pwd=8888'] },
  { title: 'Alone', role: 'Director', year: '2022', cover: 'alone_cover.jpg', prefix: 'alone', count: 12, description: 'A New York narrative short about solitude and the inner weather of a city.', link: ['Watch on Xinpianchang', 'https://www.xinpianchang.com/a12617120?from=UserProfile'] },
  { title: 'Power Failure', role: 'Director', year: '2021', cover: 'power_cover.jpg', prefix: 'power', count: 6, description: 'A short film built around interruption, uncertainty, and the quiet after the lights go out.', link: ['Watch on Bilibili', 'https://www.bilibili.com/video/BV1a3411v75i/'], size: 'wide' },
  { title: 'The Cube', role: 'Director', year: '2021', cover: 'cube_cover.jpg', prefix: 'cube', count: 6, description: 'A compact speculative short about enclosure, systems, and choice.', link: ['Watch on Bilibili', 'https://www.bilibili.com/video/BV1EU4y1t79w/'] },
  { title: 'Invert', role: 'Director', year: '2020', cover: 'invert_cover.jpg', prefix: 'invert', count: 6, description: 'An early short film exploring reversal, perception, and consequence.', link: ['Watch on Bilibili', 'https://www.bilibili.com/video/BV1Wt4y1k7h7/'] },
  { title: 'Wuhan Jiudao', role: 'Editor / Colorist', year: '2025', cover: 'wuhan_cover.jpg', prefix: 'wuhan', count: 6, description: 'An institutional film for Wuhan Jiudao Taoist Company.', link: ['View project', 'https://mp.weixin.qq.com/s/hXrt1FpEUkuQJgpZvSd8tQ'], size: 'wide' },
  { title: 'René Furterer', role: 'Editor', year: '2025', cover: 'rene_cover.jpg', prefix: 'rene', count: 4, description: 'A promotional film for the Guangzhou Golden Ribbon public-welfare project.', link: ['View project', 'https://mp.weixin.qq.com/s/cYBaOpyelteCD5U7np7XwA'] },
  { title: 'GE HealthCare', role: 'Assistant Director', year: '2023', cover: 'ge_cover.jpg', prefix: 'ge', count: 4, description: 'A medical commercial supported through assistant direction and on-site editing.' },
  { title: 'Feihe Milk', role: 'Producer', year: '2022', cover: 'feihe_cover.jpg', prefix: 'feihe', count: 3, description: 'A branded short produced for Baby Day.', link: ['View project', 'http://fh528zgbbd.cloud-top.com.cn/?scene=wechat-koc-kol&mz_ca=2299469&mz_sp=8AKJR'], size: 'wide' }
];

const grid = document.querySelector('#film-grid');
const dialog = document.querySelector('#project-dialog');
const dialogTitle = document.querySelector('#dialog-title');
const dialogRole = document.querySelector('#dialog-role');
const dialogHero = document.querySelector('#dialog-hero');
const dialogDescription = document.querySelector('#dialog-description');
const dialogLinks = document.querySelector('#dialog-links');
const dialogGallery = document.querySelector('#dialog-gallery');

projects.forEach((project, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `film-card${project.size === 'wide' ? ' film-card--wide' : ''}`;
  button.innerHTML = `<img src="images/thumbs/${project.cover}" alt="${project.title}" loading="lazy" decoding="async"><span class="film-card__shade"></span><span class="film-card__meta"><span>${String(index + 1).padStart(2, '0')}</span><strong>${project.title}</strong><em>${project.role} / ${project.year}</em></span>`;
  button.addEventListener('click', () => openProject(project));
  grid.appendChild(button);
});

function openProject(project) {
  dialogTitle.textContent = project.title;
  dialogRole.textContent = `${project.role} / ${project.year}`;
  dialogHero.src = `images/${project.cover}`;
  dialogHero.alt = `${project.title} key art`;
  dialogDescription.textContent = project.description;
  dialogLinks.innerHTML = project.link ? `<a href="${project.link[1]}" target="_blank" rel="noreferrer">${project.link[0]} ↗</a>` : '';
  dialogGallery.innerHTML = '';
  for (let index = 1; index <= project.count; index += 1) {
    const image = document.createElement('img');
    image.src = `images/${project.prefix}_img_${index}.png`;
    image.alt = `${project.title} still ${index}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    dialogGallery.appendChild(image);
  }
  dialog.showModal();
  document.body.classList.add('dialog-open');
}

function closeProject() {
  dialog.close();
  document.body.classList.remove('dialog-open');
}

document.querySelector('#dialog-close').addEventListener('click', closeProject);
dialog.addEventListener('click', (event) => { if (event.target === dialog) closeProject(); });
dialog.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
  dialogHero.removeAttribute('src');
  dialogGallery.replaceChildren();
});
