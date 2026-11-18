// Append a published film here. Its poster, full film and mobile encode live in its own media directory.
// Each entry has title, poster, video, mobile (optional) and description. Paths are relative to projects/cat-nest.html.
const additionalCatCampaigns = [];

const series = document.getElementById('series');
const list = document.getElementById('series-list');
for (const film of additionalCatCampaigns) {
  const link = document.createElement('a');
  link.href = film.video;
  link.dataset.film = '';
  link.dataset.title = film.title;
  link.dataset.poster = film.poster;
  if (film.mobile) link.dataset.mobile = film.mobile;
  const img = new Image();
  img.src = film.poster;
  img.alt = '';
  img.loading = 'lazy';
  const title = document.createElement('h3');
  title.textContent = film.title;
  const copy = document.createElement('p');
  copy.textContent = film.description;
  link.append(img, title, copy);
  list.append(link);
}
series.hidden = list.childElementCount === 0;
