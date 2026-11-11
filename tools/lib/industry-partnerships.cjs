'use strict';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function renderIndustryPartnerships(partners, language) {
  const zh = language === 'zh';
  const image = (file, width, height, className = '') => `<img src="../assets/images/logos/${file}" width="${width}" height="${height}" alt="" loading="lazy" decoding="async"${className ? ` class="${className}"` : ''}>`;
  const logos = {
    dreamina: image('dreamina-mark.svg', 80, 80),
    kling: image('kling-official.png', 96, 96),
    shotlab: image('xinpianchang-mark.svg', 96, 96),
    moodio: `<span class="industry-partnership__wordmark">Moodio</span>${image('cmu-logo.webp', 40, 40, 'industry-partnership__cmu')}`,
    opencreator: image('opencreator-logo.jpg', 96, 96),
  };
  return `<div class="industry-partnerships__viewport" role="region" aria-label="${zh ? '五项行业合作' : 'Five industry partnerships'}" tabindex="0" aria-describedby="partnerships-scroll-hint"><ul class="industry-partnerships__list" role="list">${partners.map(partner => {
    const name = partner.name[language], secondary = partner.secondaryName[language];
    return `<li class="industry-partnership industry-partnership--${escape(partner.id)}" data-industry-partner="${escape(partner.id)}">
        <div class="industry-partnership__logo" aria-hidden="true">${logos[partner.id] || ''}</div>
        <h3>${escape(name)}${secondary ? `<span>${escape(secondary)}</span>` : ''}</h3>
        <p class="industry-partnership__role">${escape(partner.role[language])}</p>
        <p class="industry-partnership__detail">${escape(partner.detail[language])}</p>
      </li>`;
  }).join('\n')}</ul></div><p class="industry-partnerships__hint" id="partnerships-scroll-hint">${zh ? '横向滑动查看全部五项合作' : 'Swipe to explore all five partnerships'}</p>`;
}

module.exports = { renderIndustryPartnerships };
