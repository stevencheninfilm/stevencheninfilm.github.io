// Published films use paths relative to projects/cat-nest.html.
// Each entry has title, poster, video, mobile (optional) and description.
const additionalCatCampaigns = [];

const series = document.getElementById('series');
const list = document.getElementById('series-list');
for (const film of additionalCatCampaigns) {
  const card = document.createElement('article');
  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'none';
  video.poster = film.poster;
  video.setAttribute('aria-label', film.title);
  const mobile = window.matchMedia('(max-width: 767px)').matches || navigator.connection?.saveData;
  video.src = mobile && film.mobile ? film.mobile : film.video;

  const title = document.createElement('h3');
  title.textContent = film.title;
  const copy = document.createElement('p');
  copy.textContent = film.description;
  card.append(video, title, copy);
  list.append(card);
}
series.hidden = list.childElementCount === 0;
