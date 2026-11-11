/* ============================================================================
   app.js — ДВИЖОК ПЛАТФОРМЫ
   ----------------------------------------------------------------------------
   Здесь лежит то, что одинаково на всех страницах заведения:
     • подстановка фирменных цветов,
     • шапка с фото,
     • верхняя навигация и кнопка ☰,
     • боковое меню с контактами,
     • промо-баннеры,
     • модальное окно брони,
     • появление блоков при прокрутке,
     • подвал сайта.

   Того, что уникально для одной страницы (рисование зала, рисование меню),
   тут нет — оно живёт внутри своей страницы. Правило простое:
   «на всех страницах» → сюда, «только на одной» → в саму страницу.

   Страница подключает движок одной строкой:
       const venue = initVenuePage('hall');   // или 'menu'
   ============================================================================ */


/* ============================================================================
   1. МАЛЕНЬКИЕ ПОМОЩНИКИ
   ============================================================================ */

/* Экранирование текста перед вставкой в HTML.
   Нужно, чтобы имя гостя вида <b> не сломало вёрстку страницы. */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* '#2C0A0D' → '44, 10, 13'. Нужно для полупрозрачных цветов в CSS. */
function hexToRgb(hex) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var num = parseInt(h, 16);
  if (isNaN(num)) return '0, 0, 0';
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(', ');
}

/* Оставляет в строке только цифры: '+7 (701) 123-45-67' → '77011234567' */
function onlyDigits(text) {
  return String(text || '').replace(/\D/g, '');
}

/* Сегодняшняя дата в формате '2026-08-13' — такой понимает <input type="date"> */
function todayISO() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

/* '2026-08-13' → '13 августа' — чтобы в подтверждении читалось по-человечески */
function prettyDate(iso) {
  var months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  return Number(p[2]) + ' ' + months[Number(p[1]) - 1];
}

/* Правильное окончание: 1 гость, 2 гостя, 5 гостей */
function guestWord(n) {
  var last = n % 10, two = n % 100;
  if (two >= 11 && two <= 14) return 'гостей';
  if (last === 1) return 'гость';
  if (last >= 2 && last <= 4) return 'гостя';
  return 'гостей';
}


/* ============================================================================
   2. КАКОЕ ЗАВЕДЕНИЕ ПОКАЗЫВАЕМ
   ----------------------------------------------------------------------------
   Берём id из адреса страницы: venue.html?id=circus
   Если id нет или он неизвестен — показываем первое заведение из venues.js,
   чтобы страница не оказалась пустой.
   ============================================================================ */

function getVenueId() {
  var id = new URLSearchParams(window.location.search).get('id');
  if (id && venues[id]) return id;
  return Object.keys(venues)[0];
}

function getVenue() {
  return venues[getVenueId()];
}

/* Собирает ссылку на страницу этого же заведения: pageUrl('menu') → 'menu.html?id=circus' */
function pageUrl(page, venueId) {
  return page + '.html?id=' + (venueId || getVenueId());
}


/* ============================================================================
   3. ФИРМЕННЫЕ ЦВЕТА
   ----------------------------------------------------------------------------
   Правило: имя цвета в venues.js = имя переменной в CSS.
   theme.accent → var(--accent). Добавишь новый цвет в данные —
   он сразу доступен в стилях, ничего связывать вручную не нужно.
   ============================================================================ */

function applyTheme(theme) {
  var root = document.documentElement;

  Object.keys(theme).forEach(function (name) {
    root.style.setProperty('--' + name, theme[name]);

    /* Тот же цвет ещё и в виде «R, G, B» — чтобы в стилях можно было
       задать прозрачность: rgba(var(--accent-rgb), 0.4). */
    root.style.setProperty('--' + name + '-rgb', hexToRgb(theme[name]));
  });

  /* Цвета статусов столов — общие для всех заведений (см. venues.js) */
  Object.keys(tableStatuses).forEach(function (key) {
    root.style.setProperty('--st-' + key, tableStatuses[key].color);
  });
}


/* ============================================================================
   4. ПЕРВЫЙ ЭКРАН
   ----------------------------------------------------------------------------
   Фото на весь экран, поверх него огромный заголовок — как у Délice:
   каждое слово на своей строке и своей ширины, будто надпись нарисована
   от руки. Ширину букв меняет переменный шрифт (ось wdth), поэтому
   слова честно занимают своё место и не наезжают друг на друга.
   ============================================================================ */

/* Делит заголовок на строки: по слову на строку, но не больше трёх строк —
   всё, что не влезло, уходит в последнюю. Ширину строк задаёт CSS
   по классам hl-1, hl-2, hl-3. */
function heroTitleHtml(text) {
  var words = String(text || '').split(/\s+/).filter(Boolean);
  var lines = words.length <= 3 ? words : [words[0], words[1], words.slice(2).join(' ')];

  /* Каждая буква — в своём span с порядковым номером --i: CSS проявляет
     их по очереди, как у ONYX. Пробелы оставляем обычным текстом. */
  var n = 0;
  return lines.map(function (line, i) {
    var chars = Array.from(line).map(function (ch) {
      if (ch === ' ') return ' ';
      return '<span class="ch" style="--i:' + (n++) + '">' + esc(ch) + '</span>';
    }).join('');
    return '<span class="hl hl-' + (i + 1) + '">' + chars + '</span>';
  }).join('');
}

/* Круглая печать на углу рамки первого экрана: текст бежит по кругу,
   в центре знак платформы. text — что написать по кругу. */
var heroBadgeCount = 0;   // у каждой печати свой id окружности
function heroBadgeHtml(text) {
  var id = 'badgeArc' + (heroBadgeCount++);
  return '<div class="hero-badge" aria-hidden="true">' +
      '<svg class="ring" viewBox="0 0 136 136">' +
        '<defs><path id="' + id + '" d="M68,68 m-52,0 a52,52 0 1,1 104,0 a52,52 0 1,1 -104,0"/></defs>' +
        '<text><textPath href="#' + id + '" textLength="320">' + esc(text) + '</textPath></text>' +
      '</svg>' +
      LOGO_SVG +
    '</div>';
}

/* Видео для первого экрана.
   video — { wide, tall, poster }: широкий ролик для компьютера, вертикальный
   для телефона и кадр, который виден, пока видео грузится.
   Грузим только один ролик — под форму экрана, чтобы телефон не качал оба.
   Повернули телефон или сузили окно — ролик меняется (см. ниже).
   Без звука (muted) и с playsinline — иначе телефоны не запустят его сами.
   Если человек отключил анимации в системе, видео не играет — остаётся кадр. */
var NARROW_SCREEN = window.matchMedia('(max-aspect-ratio: 4/5)');   // заметно выше, чем шире

function heroVideoSrc(el) {
  return (NARROW_SCREEN.matches && el.dataset.tall) || el.dataset.wide || el.dataset.tall;
}

function heroVideoHtml(video, label) {
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var src = (NARROW_SCREEN.matches && video.tall) || video.wide || video.tall;

  return '<video class="hero-video" src="' + esc(src) + '"' +
           ' data-wide="' + esc(video.wide || '') + '" data-tall="' + esc(video.tall || '') + '"' +
           (video.poster ? ' poster="' + esc(video.poster) + '"' : '') +
           (calm ? '' : ' autoplay loop') +
           ' muted playsinline preload="auto" aria-label="' + esc(label) + '"></video>';
}

/* Форма экрана изменилась — подменяем ролик, если нужен другой */
NARROW_SCREEN.addEventListener('change', function () {
  document.querySelectorAll('.hero-video').forEach(function (el) {
    var src = heroVideoSrc(el);
    if (src && el.getAttribute('src') !== src) el.setAttribute('src', src);
  });
});

function renderHero(venue, page) {
  var host = document.getElementById('hero');
  if (!host) return;

  var about = venue.about || {};

  var config = {
    hall:  { eyebrow: venue.location, title: venue.name,          sub: venue.tagline,
             photo: about.heroPhoto || venue.cover, video: about.heroVideo },
    menu:  { eyebrow: venue.name,     title: 'Меню',              sub: venue.tagline,
             photo: venue.menuCover },
    owner: { eyebrow: venue.name,     title: 'Кабинет владельца', sub: 'Демонстрация отчёта на примерных цифрах',
             photo: null }
  }[page] || { eyebrow: venue.location, title: venue.name, sub: venue.tagline, photo: venue.cover };

  /* Ссылки под текстом. На странице зала — бронь и меню; в меню — переход
     к разделам; в кабинете ссылок нет, там всё ниже на одной странице. */
  var ctas = '';
  if (page === 'hall') {
    ctas = '<div class="hero-ctas">' +
        '<button class="btn btn-coral" type="button" id="heroBookBtn">Забронировать стол</button>' +
        '<a class="link-more" href="' + pageUrl('menu', venue.id) + '">Смотреть меню</a>' +
      '</div>';
  } else if (page === 'menu') {
    ctas = '<div class="hero-ctas"><a class="link-more" href="#filters">К разделам меню</a></div>';
  }

  host.className = 'hero-full' + (config.photo ? '' : ' no-media');
  host.innerHTML =
    (config.photo
      ? '<div class="hero-media" style="background-image:url(\'' + esc(config.photo) + '\')" ' +
          'role="img" aria-label="' + esc(venue.name) + '">' +
          (config.video ? heroVideoHtml(config.video, venue.name) : '') +
        '</div>' +
        heroBadgeHtml(venue.name + ' · ' + (venue.city || 'Астана') + ' · бронь без звонков · ')
      : '') +
    '<div class="hero-content">' +
      (config.eyebrow ? '<div class="eyebrow">' + esc(config.eyebrow) + '</div>' : '') +
      '<h1 class="hero-title">' + heroTitleHtml(config.title) + '</h1>' +
      (config.sub ? '<p class="hero-sub">' + esc(config.sub) + '</p>' : '') +
      ctas +
    '</div>';

  var book = document.getElementById('heroBookBtn');
  if (book) book.addEventListener('click', function () { openBooking(null); });
}


/* ============================================================================
   5. ЛОГОТИП, ШАПКА И КНОПКИ В УГЛУ
   ----------------------------------------------------------------------------
   Шапка в духе ONYX: сверху тонкая бронзовая строка-объявление, ниже —
   ссылки слева и справа, знак платформы по центру. Над мрамором шапка
   почти прозрачная, ниже — светлая с размытием. При прокрутке
   строка-объявление уезжает вверх.
   ============================================================================ */

/* Логотип платформы — буква «О» из названия, обыгранная как тарелка:
   внешний круг, кольцо сервировки и точка-место в центре.
   Рисуем кодом, а не картинкой: масштабируется без потери чёткости,
   красится текущим цветом текста и не требует файла в проекте.

   Толщины линий подобраны под мелкий размер (22–28px в шапке): при более
   тонких штрихах внутреннее кольцо на такой величине пропадает совсем. */
var LOGO_SVG =
  '<svg class="logo" viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
    '<circle cx="32" cy="32" r="23"   stroke="currentColor" stroke-width="4.5"/>' +
    '<circle cx="32" cy="32" r="12.5" stroke="currentColor" stroke-width="3" opacity="0.5"/>' +
    '<circle cx="32" cy="32" r="4.5"  fill="currentColor"/>' +
  '</svg>';

/* Знак бренда: логотип + название. Ведёт на главную. */
function brandMarkHtml() {
  return '<a class="brandmark" href="index.html" aria-label="' + esc(platform.name) + '">' +
           LOGO_SVG + '<span>' + esc(platform.name) + '</span>' +
         '</a>';
}

/* Значок меню — три длинные тонкие линии. Когда меню открыто, CSS
   складывает их в крестик: кнопка, которая открыла меню, его и закрывает. */
var ICON_MENU =
  '<svg viewBox="0 0 32 18" width="32" height="18" fill="none" stroke="currentColor" ' +
       'stroke-width="1.4" aria-hidden="true">' +
    '<path d="M1 2h30"/><path d="M1 9h30"/><path d="M1 16h30"/>' +
  '</svg>';

/* Часы — у строки-объявления и у расписания в подвале */
var ICON_CLOCK =
  '<svg class="icon-clock" viewBox="0 0 16 16" width="14" height="14" fill="none" ' +
       'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="8" cy="8" r="6.4"/><path d="M8 4.6V8l2.3 1.5"/>' +
  '</svg>';

function navLinksHtml(links) {
  return (links || []).map(function (link) {
    return '<a href="' + esc(link.href) + '">' + esc(link.text) + '</a>';
  }).join('');
}

/* Собирает шапку в host.
   opts.banner — строка-объявление, opts.city — подпись справа над шапкой,
   opts.left / opts.right — ссылки по сторонам от знака: [{ text, href }] */
function mountHeader(host, opts) {
  host.classList.add('nav');
  host.innerHTML =
    '<div class="nav-banner">' +
      '<span class="nav-msg">' + ICON_CLOCK + esc(opts.banner || '') + '</span>' +
      '<span class="nav-city">' + esc(opts.city || '') + '</span>' +
    '</div>' +
    '<div class="nav-inner">' +
      '<nav class="nav-links" aria-label="Разделы">' + navLinksHtml(opts.left) + '</nav>' +
      brandMarkHtml() +
      '<nav class="nav-links nav-links-right" aria-label="Ещё разделы">' + navLinksHtml(opts.right) + '</nav>' +
      '<button class="burger" id="burgerBtn" type="button" aria-label="Меню" ' +
              'aria-expanded="false" aria-controls="sidebar">' + ICON_MENU + '</button>' +
    '</div>';

  document.getElementById('burgerBtn').addEventListener('click', toggleSidebar);

  /* Клик по ссылке шапки закрывает меню, если оно открыто на телефоне */
  host.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
      if (document.body.classList.contains('menu-open')) closeSidebar();
    });
  });

  initNavTone(host);
}

/* Два состояния шапки:
   .scrolled — страницу сдвинули, строка-объявление уезжает вверх;
   .solid    — первый экран уехал, шапка становится кремовой.
   Первый экран ищем при каждой проверке: на страницах заведения шапка
   рисуется раньше, чем он появляется. */
function initNavTone(nav) {
  function update() {
    var hero = document.querySelector('.hero-full');
    var heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
    nav.classList.toggle('scrolled', window.scrollY > 40);
    nav.classList.toggle('solid', heroBottom <= nav.getBoundingClientRect().bottom);
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  setTimeout(update, 0);   // после того, как страница дорисует первый экран
}

function renderNav(venue, page) {
  var host = document.getElementById('nav');
  if (!host) return;

  var id = venue.id;
  var hours = (venue.contacts || {}).hours;

  mountHeader(host, {
    banner: venue.name + (hours ? ' · ' + hours : ''),
    city:   venue.city,
    left:  [{ text: 'Карта зала', href: pageUrl('venue', id) },
            { text: 'Меню',       href: pageUrl('menu', id) }],
    right: [{ text: 'События',    href: pageUrl('venue', id) + '#sec-events' },
            { text: 'Контакты',   href: pageUrl('venue', id) + '#sec-details' }]
  });
}

/* Кнопки, приклеенные к низу экрана по центру, — как
   «Bon cadeau · Réservation» у ONYX. Коралловые, встык.
   items: [{ text, href }] или [{ text, onClick }]. Первая — главная. */
function renderActionBar(items) {
  var bar = document.createElement('div');
  bar.className = 'action-bar';

  items.forEach(function (item, i) {
    var el = document.createElement(item.href ? 'a' : 'button');
    el.className = 'action-btn' + (i === 0 ? ' primary' : '');
    el.textContent = item.text;
    if (item.href) {
      el.href = item.href;
    } else {
      el.type = 'button';
      el.addEventListener('click', item.onClick);
    }
    bar.appendChild(el);
  });

  document.body.appendChild(bar);
}

/* Полоса разделов заведения. Стоит сразу под первым экраном,
   а при прокрутке прилипает под шапкой. */
function renderLocalNav(venue, page) {
  var host = document.getElementById('localNav');
  if (!host) return;

  var id = venue.id;

  /* На странице зала вкладки строит сама venue.html — оставляем ей
     пустой контейнер. На остальных страницах — две обычные ссылки. */
  var links = page === 'hall'
    ? '<nav class="venue-tabs" id="venueTabs" aria-label="Разделы заведения"></nav>'
    : '<nav class="local-links" aria-label="Разделы заведения">' +
        '<a href="' + pageUrl('venue', id) + '">Обзор</a>' +
        '<a href="' + pageUrl('menu', id) + '"' + (page === 'menu' ? ' class="current"' : '') + '>Меню</a>' +
      '</nav>';

  host.className = 'local-nav';
  host.innerHTML = '<div class="local-nav-inner">' + links + '</div>';
}


/* ============================================================================
   6. МЕНЮ ПОД ШАПКОЙ
   ----------------------------------------------------------------------------
   На телефоне ссылки шапки не помещаются — их заменяет кнопка ☰.
   Карточка во всю ширину раскрывается вниз прямо из шапки.
   Показываем только заполненные контакты. Пустая строка в venues.js
   означает «пункта нет» — владелец впишет позже, и он появится сам.
   ============================================================================ */

/* Иконки соцсетей рисуем прямо в разметке (inline SVG), а не картинками:
   так они красятся текущим цветом текста и не требуют отдельных файлов. */
var ICON_INSTAGRAM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">' +
    '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5"/>' +
    '<circle cx="12" cy="12" r="4.1"/>' +
    '<circle cx="17.5" cy="6.5" r="1.15" fill="currentColor" stroke="none"/>' +
  '</svg>';

var ICON_WHATSAPP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
       'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M20.6 11.7a8.6 8.6 0 0 1-12.8 7.5L3.4 20.6l1.4-4.3A8.6 8.6 0 1 1 20.6 11.7Z"/>' +
    '<path d="M9.2 8.4c.5-.1.8 0 1 .4l.7 1.5c.1.3 0 .5-.2.7l-.5.5c-.1.2-.2.3 0 .6a6 6 0 0 0 2.4 2.1c.3.1.5.1.6-.1l.5-.6c.2-.2.4-.2.7-.1l1.5.7c.3.2.5.4.4.8a2 2 0 0 1-1.9 1.5c-1 0-2.6-.6-4-2s-2-3-2-4a2 2 0 0 1 1.4-1.9Z"/>' +
  '</svg>';

/* Разделы платформы колонками: группа — заголовок, под ним ссылки.
   Данные — platform.megamenu в venues.js. */
function platformLinksHtml() {
  var groups = (platform.megamenu || []).map(function (group) {
    var links = (group.columns || []).map(function (column) {
      return column.items.map(function (item) {
        return '<a class="side-plain" href="' + esc(item.href) + '">' + esc(item.text) + '</a>';
      }).join('');
    }).join('');

    return '<div class="side-group">' +
        '<div class="side-group-title">' + esc(group.title) + '</div>' + links +
      '</div>';
  }).join('');

  return groups ? '<div class="side-groups">' + groups + '</div>' : '';
}

/* Вставляет готовую карточку меню и затемнение в страницу */
function mountSidebar(html) {
  var backdrop = document.createElement('div');
  backdrop.className = 'side-backdrop';
  backdrop.id = 'sideBackdrop';

  var panel = document.createElement('div');
  panel.className = 'sidebar';
  panel.id = 'sidebar';
  panel.innerHTML = html;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  backdrop.addEventListener('click', closeSidebar);

  /* Экран повернули или изменили размер окна — пересчитываем положение,
     но только если меню открыто. */
  window.addEventListener('resize', function () {
    if (panel.classList.contains('open')) positionSidebar();
  });
}

/* Меню для главной: у неё нет заведения, поэтому контактов нет —
   ссылки шапки и разделы платформы. */
function renderPlatformSidebar(links) {
  mountSidebar(
    '<div class="side-brand">' + esc(platform.tagline) + '</div>' +
    (links && links.length
      ? '<nav class="side-nav">' + navLinksHtml(links) + '</nav>'
      : '') +
    platformLinksHtml()
  );
  document.querySelectorAll('.side-nav a').forEach(function (link) {
    link.addEventListener('click', closeSidebar);
  });
}

function renderSidebar(venue) {
  var c = venue.contacts || {};
  var id = venue.id;
  var html = '';

  html += '<div class="side-brand">' + esc(venue.name) + '</div>';

  /* --- Разделы заведения: крупно --- */
  html +=
    '<nav class="side-nav">' +
      '<a href="' + pageUrl('venue', id) + '">Карта зала</a>' +
      '<a href="' + pageUrl('menu', id) + '">Меню</a>' +
      '<a href="#" id="sideBookBtn">Забронировать стол</a>' +
      '<a href="index.html">Другие заведения</a>' +
    '</nav>';

  /* --- Адрес, часы, телефон и соцсети одним блоком --- */
  var contact = '';
  if (c.address) contact += '<div class="side-strong">' + esc(c.address) + '</div>';
  if (c.hours)   contact += '<div class="side-dim">' + esc(c.hours) + '</div>';

  /* Ссылкой tel: делаем только настоящий номер: в заглушке
     «+7 (___) ___-__-__» цифр мало, покажем просто текстом. */
  if (c.phone) {
    var phoneDigits = onlyDigits(c.phone);
    contact += phoneDigits.length >= 10
      ? '<a class="side-phone" href="tel:+' + phoneDigits + '">' + esc(c.phone) + '</a>'
      : '<div class="side-phone">' + esc(c.phone) + '</div>';
  }

  var icons = '';
  if (c.instagram) {
    var nick = String(c.instagram).replace('@', '');
    icons += '<a href="https://instagram.com/' + esc(nick) + '" target="_blank" rel="noopener" ' +
                'aria-label="Instagram">' + ICON_INSTAGRAM + '</a>';
  }
  if (c.whatsapp) {
    icons += '<a href="https://wa.me/' + onlyDigits(c.whatsapp) + '" target="_blank" rel="noopener" ' +
                'aria-label="WhatsApp">' + ICON_WHATSAPP + '</a>';
  }
  if (icons) contact += '<div class="side-icons">' + icons + '</div>';

  if (c.map2gis) {
    contact += '<a class="side-link" href="' + esc(c.map2gis) + '" target="_blank" rel="noopener">Как добраться</a>';
  }

  if (contact) html += '<div class="side-contact">' + contact + '</div>';

  /* --- Разделы платформы колонками внизу карточки --- */
  html += platformLinksHtml();

  mountSidebar(html);

  /* «Забронировать стол» — закрываем меню и открываем форму без выбранного стола */
  document.getElementById('sideBookBtn').addEventListener('click', function (e) {
    e.preventDefault();
    closeSidebar();
    openBooking(null);
  });
}

/* Ставит карточку меню сразу под шапку. Ширину и края задаёт CSS,
   а здесь считаем только верх и высоту: шапка меняет высоту,
   когда строка-объявление уезжает. */
function positionSidebar() {
  var panel = document.getElementById('sidebar');
  var nav = document.querySelector('.nav');
  if (!panel || !nav) return;

  var top = nav.getBoundingClientRect().bottom;
  panel.style.top = top + 'px';
  panel.style.maxHeight = (window.innerHeight - top) + 'px';
}

function setMenuState(open) {
  var panel = document.getElementById('sidebar');
  if (!panel) return;

  if (open) positionSidebar();
  panel.classList.toggle('open', open);
  document.getElementById('sideBackdrop').classList.toggle('open', open);
  document.body.classList.toggle('no-scroll', open);
  document.body.classList.toggle('menu-open', open);   // по нему CSS превращает ☰ в крестик

  var burger = document.getElementById('burgerBtn');
  if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function openSidebar()  { setMenuState(true); }
function closeSidebar() { setMenuState(false); }

function toggleSidebar() {
  setMenuState(!document.body.classList.contains('menu-open'));
}


/* ============================================================================
   7. АКЦИИ — КАРУСЕЛЬ «ПЛАСТИНОК»
   ----------------------------------------------------------------------------
   Как блок «Plaisirs du jour» у Délice: круглые «тарелки» в ряд, над
   центральной — надпись дугой, а фон всего блока перекрашивается
   в цвет той акции, что сейчас в центре. Одна функция на два места:
   общая лента на главной и блок акций на странице заведения.
   ============================================================================ */

/* Собирает промо всех заведений в одну ленту вперемешку.
   Идём по кругу: первое промо каждого заведения, потом вторые, потом третьи.
   Так у всех одинаковые шансы попасть в начало ленты, и порядок не скачет
   при каждой перезагрузке — в отличие от случайной перетасовки. */
function mixAllPromos() {
  var lists = Object.keys(venues).map(function (id) {
    return (venues[id].promos || []).map(function (promo) {
      return { promo: promo, venueId: id };
    });
  });

  var mixed = [];
  var round = 0;
  var addedSomething = true;

  while (addedSomething) {
    addedSomething = false;
    lists.forEach(function (list) {
      if (list[round]) {
        mixed.push(list[round]);
        addedSomething = true;
      }
    });
    round++;
  }
  return mixed;
}

var promoArcCount = 0;   // у каждой дуги свой id: на странице их может быть несколько

/* Рисует карусель акций.
   host     — куда вставлять
   items    — массив { promo, venueId }
   showFrom — писать ли на карточке, из какого она заведения (нужно на главной)
   title    — надпись дугой над центральной карточкой */
function renderPromos(host, items, showFrom, title) {
  if (!host) return;

  if (items.length === 0) {
    host.style.display = 'none';   // акций нет — блок не показываем вовсе
    return;
  }

  /* Надпись по дуге — текст, уложенный вдоль кривой (textPath в SVG).
     Для чтения с экрана рядом лежит обычный заголовок, скрытый визуально. */
  var arcId = 'promoArc' + (++promoArcCount);
  var head = document.createElement('h2');
  head.className = 'promo-heading';
  head.innerHTML =
    '<span class="sr-only">' + esc(title || 'Акции') + '</span>' +
    '<svg class="promo-arc" viewBox="0 0 520 150" aria-hidden="true">' +
      '<path id="' + arcId + '" d="M 40 140 A 220 220 0 0 1 480 140" fill="none"/>' +
      '<text><textPath href="#' + arcId + '" startOffset="50%" text-anchor="middle">' +
        esc(title || 'Акции') +
      '</textPath></text>' +
    '</svg>';

  var strip = document.createElement('div');
  strip.className = 'promo-strip';

  items.forEach(function (item) {
    var promo = item.promo;
    var venue = venues[item.venueId];

    var meta = [];
    if (showFrom) meta.push(venue.name);
    if (promo.price) meta.push(promo.price);

    /* Карточка — ссылка на страницу заведения, которое разместило акцию.
       Цвет акции запоминаем в data-атрибуте: его подхватит фон блока. */
    var card = document.createElement('a');
    card.className = 'promo-card';
    card.href = pageUrl('venue', item.venueId);
    card.dataset.color = promo.accent;

    card.innerHTML =
      '<div class="promo-ring">' +
        '<span class="promo-emoji">' + esc(promo.emoji) + '</span>' +
        (promo.badge ? '<span class="promo-badge">' + esc(promo.badge) + '</span>' : '') +
      '</div>' +
      '<div class="promo-title">' + esc(promo.title) + '</div>' +
      '<div class="promo-subtitle">' + esc(promo.subtitle) + '</div>' +
      (meta.length ? '<div class="promo-meta">' + esc(meta.join(' · ')) + '</div>' : '');

    strip.appendChild(card);
  });

  host.classList.add('promo-stage');
  host.appendChild(head);
  host.appendChild(strip);
  initStrip(strip);
  initPromoStage(host, strip);
}

/* Следит, какая карточка ближе всего к центру ленты, отмечает её
   и перекрашивает фон блока в её цвет. Плавность перехода — в CSS. */
function initPromoStage(stage, strip) {
  var cards = [].slice.call(strip.children);
  var pending = false;

  function update() {
    pending = false;
    var box = strip.getBoundingClientRect();
    var middle = box.left + box.width / 2;
    var best = cards[0];
    var bestDistance = Infinity;

    cards.forEach(function (card) {
      var r = card.getBoundingClientRect();
      var distance = Math.abs(r.left + r.width / 2 - middle);
      if (distance < bestDistance) { bestDistance = distance; best = card; }
    });

    cards.forEach(function (card) { card.classList.toggle('is-active', card === best); });
    if (best.dataset.color) stage.style.setProperty('--stage', best.dataset.color);
  }

  /* Пересчёт не чаще раза за кадр: событие прокрутки приходит
     десятки раз в секунду, а перекрасить фон достаточно один. */
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }

  strip.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
}


/* Стрелки под горизонтальной лентой: «←  ——  →».
   Полоска посередине показывает, какая часть ленты сейчас видна
   и где она. Если всё и так влезает в ширину, стрелки прячутся. */
function initStrip(strip) {
  if (!strip || strip.dataset.strip) return;   // не вешаем стрелки дважды
  strip.dataset.strip = 'on';

  var bar = document.createElement('div');
  bar.className = 'strip-nav';
  bar.innerHTML =
    '<button class="strip-arrow" type="button" aria-label="Назад">&larr;</button>' +
    '<span class="strip-track"><span class="strip-thumb"></span></span>' +
    '<button class="strip-arrow" type="button" aria-label="Вперёд">&rarr;</button>';
  strip.parentNode.insertBefore(bar, strip.nextSibling);

  var prev = bar.children[0];
  var next = bar.children[2];
  var thumb = bar.querySelector('.strip-thumb');

  /* Шаг прокрутки — одна карточка вместе с промежутком */
  function step() {
    var card = strip.firstElementChild;
    var gap = parseFloat(getComputedStyle(strip).columnGap) || 0;
    return card ? card.offsetWidth + gap : strip.clientWidth;
  }

  prev.addEventListener('click', function () { strip.scrollBy({ left: -step(), behavior: 'smooth' }); });
  next.addEventListener('click', function () { strip.scrollBy({ left:  step(), behavior: 'smooth' }); });

  function update() {
    var max = strip.scrollWidth - strip.clientWidth;
    bar.hidden = max <= 1;
    if (bar.hidden) return;

    /* Ширина бегунка — видимая доля ленты, отступ — сколько уже пролистали */
    thumb.style.width = (strip.clientWidth / strip.scrollWidth * 100) + '%';
    thumb.style.marginLeft = (strip.scrollLeft / strip.scrollWidth * 100) + '%';
    prev.disabled = strip.scrollLeft <= 1;
    next.disabled = strip.scrollLeft >= max - 1;
  }

  strip.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}


/* Круглые «печати» с цифрами вперемешку с фото — как блок статистики
   Délice («160 passionnés», «1970»…). Печать наезжает на угол фото.
   items  — [{ value, label }]
   photos — картинки, идут по кругу; без них остаются одни печати. */
function statsHtml(items, photos) {
  return '<div class="stats">' + items.map(function (item, i) {
    var photo = photos && photos.length ? photos[i % photos.length] : '';
    return '<div class="stat-item' + (i % 2 ? ' is-low' : '') + '">' +
        (photo ? '<div class="stat-photo" style="background-image:url(\'' + esc(photo) + '\')"></div>' : '') +
        '<div class="stamp">' +
          '<span class="stamp-value">' + esc(item.value) + '</span>' +
          '<span class="stamp-label">' + esc(item.label) + '</span>' +
        '</div>' +
      '</div>';
  }).join('') + '</div>';
}

/* Три круглых фото по краям красного блока — у Délice они «висят»
   у краёв, наполовину за пределами экрана. Положение задаёт CSS
   по порядку: первое слева сверху, второе справа, третье слева снизу. */
function circlePhotosHtml(photos) {
  return (photos || []).filter(Boolean).slice(0, 3).map(function (photo, i) {
    return '<div class="circle-photo circle-photo-' + (i + 1) + '" ' +
             'style="background-image:url(\'' + esc(photo) + '\')" aria-hidden="true"></div>';
  }).join('');
}


/* ============================================================================
   8. МОДАЛЬНОЕ ОКНО БРОНИ
   ----------------------------------------------------------------------------
   Пока без сервера: заявка складывается в массив bookings в памяти браузера.
   Когда появится backend — отправку добавим в одном месте, в submitBooking().
   ============================================================================ */

var bookings = [];       // заявки текущей сессии (при перезагрузке страницы очищаются)
var bookingTable = null; // стол, с которого открыли форму (может быть null)

/* Список времени от 10:00 до 23:30 с шагом 30 минут */
function buildTimeList(from, to, step) {
  function toMin(t) { var p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function toStr(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

  var list = [];
  for (var m = toMin(from); m <= toMin(to); m += step) list.push(toStr(m));
  return list;
}

function createBookingModal(venue) {
  var cfg = venue.booking || {};
  var times = buildTimeList(cfg.timeFrom || '10:00', cfg.timeTo || '23:00', cfg.step || 30);
  var maxGuests = cfg.maxGuests || 10;

  var timeOptions = times.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('');

  var guestOptions = '';
  for (var i = 1; i <= maxGuests; i++) {
    guestOptions += '<option value="' + i + '">' + i + ' ' + guestWord(i) + '</option>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'bookingOverlay';
  overlay.innerHTML =
    '<div class="modal">' +
      '<button class="close-btn" id="bookingCloseBtn" aria-label="Закрыть">&times;</button>' +

      /* --- Экран 1: форма --- */
      '<div class="modal-body" id="bookingForm">' +
        '<h2 id="bookingTitle">Бронирование стола</h2>' +
        '<div class="modal-sub" id="bookingSub"></div>' +

        '<div class="row2">' +
          '<div class="field">' +
            '<label for="bkDate">Дата</label>' +
            '<input type="date" id="bkDate">' +
          '</div>' +
          '<div class="field">' +
            '<label for="bkTime">Время</label>' +
            '<select id="bkTime">' + timeOptions + '</select>' +
          '</div>' +
        '</div>' +

        '<div class="field">' +
          '<label for="bkGuests">Гостей</label>' +
          '<select id="bkGuests">' + guestOptions + '</select>' +
        '</div>' +

        '<div class="field">' +
          '<label for="bkName">Имя</label>' +
          '<input type="text" id="bkName" placeholder="Как к вам обращаться" autocomplete="name">' +
        '</div>' +

        '<div class="field">' +
          '<label for="bkPhone">Телефон</label>' +
          '<input type="tel" id="bkPhone" placeholder="+7 701 234 56 78" autocomplete="tel">' +
        '</div>' +

        '<div class="form-error" id="bookingError"></div>' +
        '<button class="btn" id="bookingSubmit">Отправить заявку</button>' +
      '</div>' +

      /* --- Экран 2: подтверждение --- */
      '<div class="done" id="bookingDone" style="display:none">' +
        '<div class="tick">&#127881;</div>' +
        '<h2>Заявка принята</h2>' +
        '<p>Администратор свяжется с вами для подтверждения.</p>' +
        '<div class="done-box" id="bookingSummary"></div>' +
        '<button class="btn btn-ghost" id="bookingDoneBtn">Готово</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  /* Закрытие: крестик, клик по тёмному фону, кнопка «Готово» */
  document.getElementById('bookingCloseBtn').addEventListener('click', closeBooking);
  document.getElementById('bookingDoneBtn').addEventListener('click', closeBooking);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeBooking();
  });

  document.getElementById('bookingSubmit').addEventListener('click', function () {
    submitBooking(venue);
  });
}

/* Открыть форму. table — объект стола из venues.js или null (бронь без выбора стола) */
function openBooking(table) {
  bookingTable = table;
  bookingEvent = null;   // бронь под событие ставит openBookingForEvent после этой функции
  var venue = getVenue();

  document.getElementById('bookingTitle').textContent =
    table ? 'Бронь стола ' + table.id : 'Бронирование стола';

  document.getElementById('bookingSub').textContent =
    table ? (table.view + ' · ' + table.seats + ' ' + guestWord(table.seats) + ' · ' + venue.name)
          : (venue.name + ' · ' + venue.location);

  /* Значения по умолчанию: сегодня, и столько гостей, сколько мест за столом */
  var dateInput = document.getElementById('bkDate');
  dateInput.value = todayISO();
  dateInput.min = todayISO();   // прошлую дату выбрать нельзя
  if (table) document.getElementById('bkGuests').value = String(table.seats);

  document.getElementById('bookingError').textContent = '';
  document.getElementById('bookingForm').style.display = '';
  document.getElementById('bookingDone').style.display = 'none';

  document.getElementById('bookingOverlay').classList.add('open');
  document.body.classList.add('no-scroll');
}

function closeBooking() {
  document.getElementById('bookingOverlay').classList.remove('open');
  document.body.classList.remove('no-scroll');
}

/* Проверка полей и «отправка» заявки */
function submitBooking(venue) {
  var date   = document.getElementById('bkDate').value;
  var time   = document.getElementById('bkTime').value;
  var guests = Number(document.getElementById('bkGuests').value);
  var name   = document.getElementById('bkName').value.trim();
  var phone  = document.getElementById('bkPhone').value.trim();
  var errorBox = document.getElementById('bookingError');

  /* Показать ошибку и остановить отправку */
  function showError(text) { errorBox.textContent = text; return false; }

  /* --- Проверки по порядку: первая же ошибка останавливает отправку --- */
  if (!date)                          return showError('Выберите дату');
  if (date < todayISO())              return showError('Эта дата уже прошла');
  if (name.length < 2)                return showError('Введите имя');
  if (onlyDigits(phone).length < 10)  return showError('Введите телефон полностью');

  /* Если бронируют на сегодня — время не должно быть в прошлом */
  if (date === todayISO()) {
    var now = new Date();
    var nowStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    if (time < nowStr) return showError('Это время сегодня уже прошло');
  }

  /* --- Заявка принята --- */
  var booking = {
    venue: venue.name,
    table: bookingTable ? bookingTable.id : 'на усмотрение администратора',
    date: date, time: time, guests: guests, name: name, phone: phone,
    event: bookingEvent ? bookingEvent.title : null,   // бронь под событие из афиши
    createdAt: new Date().toISOString()
  };
  bookings.push(booking);

  /* Сюда позже встанет отправка на сервер:
     fetch('/api/bookings', { method:'POST', body: JSON.stringify(booking) }) */
  console.log('Новая заявка:', booking);

  document.getElementById('bookingSummary').innerHTML =
    '<div><b>Заведение:</b> ' + esc(venue.name) + '</div>' +
    (booking.event ? '<div><b>Событие:</b> ' + esc(booking.event) + '</div>' : '') +
    '<div><b>Стол:</b> ' + esc(booking.table) + '</div>' +
    '<div><b>Когда:</b> ' + esc(prettyDate(date)) + ', ' + esc(time) + '</div>' +
    '<div><b>Гостей:</b> ' + guests + '</div>' +
    '<div><b>Имя:</b> ' + esc(name) + '</div>' +
    '<div><b>Телефон:</b> ' + esc(phone) + '</div>';

  document.getElementById('bookingForm').style.display = 'none';
  document.getElementById('bookingDone').style.display = '';
}


/* ============================================================================
   8.5. КАРТИНКА БЛЮДА И ОЦЕНКИ
   ----------------------------------------------------------------------------
   Картинка блюда переехала сюда из menu.html: теперь она нужна двум
   страницам — полному меню и превью меню на странице заведения.
   ============================================================================ */

/* Есть фото — показываем фото, нет — цветную заглушку в цвете раздела.
   Фото добавляются по одному, вёрстку править не нужно.
   place — где рисуем: 'in-card', 'in-reco' или 'in-modal'. */
function dishImageHtml(dish, color, place) {
  /* Плашка «СТОП» поверх картинки, если блюдо кончилось */
  var stop = dish.stop ? '<span class="dish-stop">СТОП</span>' : '';

  if (dish.photo) {
    return '<div class="dish-img ' + place + ' has-photo" ' +
           'style="background-image:url(\'' + esc(dish.photo) + '\')">' + stop + '</div>';
  }
  /* Фото ещё нет — пустая тарелка с подписью, без эмодзи */
  return '<div class="dish-img ' + place + '" style="--dish-color:' + esc(color) + '">' +
           '<span class="dish-soon">Фото скоро</span>' + stop +
         '</div>';
}

/* --- Крупный обзор блюда ----------------------------------------------------
   Три состояния: вращение по кадрам, статичное фото, пустая тарелка «фото скоро».
   Что именно покажется, решают сами данные — вёрстка одна и та же.
   -------------------------------------------------------------------------- */
function dishViewerHtml(dish, color) {
  var frames = dish.frames || [];
  var spinnable = frames.length > 1;
  var stage;

  if (spinnable) {
    stage = '<img class="dish-frame" src="' + esc(frames[0]) + '" alt="' + esc(dish.name) + '" draggable="false">';
  } else if (dish.photo) {
    stage = '<img class="dish-frame dish-photo" src="' + esc(dish.photo) + '" alt="' + esc(dish.name) + '" draggable="false">';
  } else {
    stage = '<div class="dish-img in-view" style="--dish-color:' + esc(color) + '">' +
              '<span class="dish-soon">Фото скоро</span>' +
            '</div>';
  }

  return '<div class="dish-view' + (spinnable ? ' spinnable' : '') + '">' +
      '<div class="dish-stage">' + stage + '</div>' +
      (spinnable
        ? '<button class="dish-spin" type="button" aria-label="Повернуть блюдо">&#8635;</button>' +
          '<div class="dish-hint">Потяните, чтобы рассмотреть со всех сторон</div>'
        : '<div class="dish-hint">Обзор 360° появится после съёмки блюда</div>') +
    '</div>';
}

/* Оживляет вращение: перетаскивание меняет кадр, кнопка ↻ крутит оборот сама */
function initDishRotator(root, frames) {
  if (!root || !frames || frames.length < 2) return;

  var stage = root.querySelector('.dish-stage');
  var img = root.querySelector('.dish-frame');
  var index = 0;
  var ШАГ = 8;          // сколько пикселей протяжки приходится на один кадр
  var авто = null;

  /* Подгружаем кадры заранее: иначе при первом обороте они будут
     появляться рывками по мере скачивания. */
  frames.forEach(function (src) { new Image().src = src; });

  function показать(i) {
    index = ((i % frames.length) + frames.length) % frames.length;
    img.src = frames[index];
  }

  /* --- Перетаскивание --- */
  var тянем = false, startX = 0, startIndex = 0;

  stage.addEventListener('pointerdown', function (e) {
    остановить();
    тянем = true;
    startX = e.clientX;
    startIndex = index;
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener('pointermove', function (e) {
    if (!тянем) return;
    показать(startIndex + Math.round((e.clientX - startX) / ШАГ));
  });

  ['pointerup', 'pointercancel'].forEach(function (тип) {
    stage.addEventListener(тип, function () { тянем = false; });
  });

  /* --- Кнопка: один полный оборот --- */
  function остановить() { if (авто) { clearInterval(авто); авто = null; } }

  root.querySelector('.dish-spin').addEventListener('click', function () {
    if (авто) { остановить(); return; }      // повторный клик останавливает
    var осталось = frames.length;
    авто = setInterval(function () {
      показать(index + 1);
      if (--осталось <= 0) остановить();
    }, 45);
  });
}

/* --- Карусель блюда: само блюдо, затем ингредиенты --------------------------
   Прокрутка сделана на CSS (scroll-snap), а не на скриптах: пальцем свайп
   работает сам собой, а стрелки просто просят браузер прокрутить на экран.
   Последний слайд — полный список ингредиентов, до него и доводит свайп
   вправо на телефоне.
   -------------------------------------------------------------------------- */
function dishCarouselHtml(dish, color) {
  var ing = dish.ingredients || [];

  /* Слайд 1 — само блюдо (вращение, фото или заглушка) */
  var slides = ['<div class="dish-slide">' + dishViewerHtml(dish, color) + '</div>'];
  var captions = [dish.compo || dish.name];

  /* Слайды ингредиентов */
  ing.forEach(function (item) {
    var картинка = item.photo
      ? '<img class="dish-frame" src="' + esc(item.photo) + '" alt="' + esc(item.name) + '" draggable="false">'
      : '<div class="dish-img in-view" style="--dish-color:' + esc(color) + '">' +
          '<span class="dish-emoji">' + esc(item.emoji) + '</span></div>';

    slides.push('<div class="dish-slide"><div class="dish-view"><div class="dish-stage">' +
                картинка + '</div></div></div>');
    captions.push('<b>' + esc(item.name) + '</b>' + (item.note ? ' — ' + esc(item.note) : ''));
  });

  /* Последний слайд — весь состав списком */
  if (ing.length > 0) {
    var список = ing.map(function (item) {
      return '<li>' + esc(item.name) + '</li>';
    }).join('');

    slides.push('<div class="dish-slide"><div class="dish-view"><div class="dish-stage">' +
        '<ul class="ing-list">' + список + '</ul>' +
      '</div></div></div>');
    captions.push('Всё, из чего собрано блюдо');
  }

  /* Стрелки и точки нужны только когда слайдов больше одного */
  var управление = slides.length > 1
    ? '<div class="dish-nav">' +
        '<button class="dish-arrow" type="button" data-dir="-1" aria-label="Назад">&#8249;</button>' +
        '<span class="dish-dots">' + slides.map(function (_, i) {
          return '<span class="dot' + (i === 0 ? ' on' : '') + '"></span>';
        }).join('') + '</span>' +
        '<button class="dish-arrow" type="button" data-dir="1" aria-label="Вперёд">&#8250;</button>' +
      '</div>'
    : '';

  return '<div class="dish-carousel" data-captions="' + esc(JSON.stringify(captions)) + '">' +
      '<div class="dish-track">' + slides.join('') + '</div>' +
      '<div class="dish-caption">' + captions[0] + '</div>' +
      управление +
    '</div>';
}

/* Стрелки, точки и подпись под текущим слайдом */
function initDishCarousel(root) {
  if (!root) return;

  var track = root.querySelector('.dish-track');
  var caption = root.querySelector('.dish-caption');
  var dots = root.querySelectorAll('.dish-dots .dot');
  var captions = JSON.parse(root.dataset.captions);

  function обновить() {
    /* Номер слайда считаем из положения прокрутки — тогда он верен
       и после свайпа пальцем, и после нажатия стрелки. */
    var i = Math.round(track.scrollLeft / track.clientWidth);
    i = Math.max(0, Math.min(captions.length - 1, i));

    caption.innerHTML = captions[i];
    dots.forEach(function (dot, j) { dot.classList.toggle('on', j === i); });
  }

  track.addEventListener('scroll', обновить, { passive: true });

  root.querySelectorAll('.dish-arrow').forEach(function (btn) {
    btn.addEventListener('click', function () {
      track.scrollBy({ left: track.clientWidth * Number(btn.dataset.dir), behavior: 'smooth' });
    });
  });
}

/* Граммовка и БЖУ строкой под описанием */
function nutritionHtml(nutrition) {
  if (!nutrition) return '';

  var поля = [
    { label: 'Порция',   value: nutrition.weight },
    { label: 'Белки',    value: nutrition.protein },
    { label: 'Жиры',     value: nutrition.fat },
    { label: 'Углеводы', value: nutrition.carbs },
    { label: 'Энергия',  value: nutrition.kcal }
  ].filter(function (п) { return п.value; });

  if (поля.length === 0) return '';

  return '<div class="nutrition">' + поля.map(function (п) {
    return '<div class="nutri-item">' +
        '<span class="nutri-value">' + esc(п.value) + '</span>' +
        '<span class="nutri-label">' + esc(п.label) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

/* Выделяет жирным ключевые слова в описании — как у Apple под товаром.
   Экранируем сначала весь текст, потом оборачиваем уже безопасные куски:
   в обратном порядке экранирование съело бы сами теги. */
function highlightHtml(text, words) {
  var out = esc(text || '');
  (words || []).forEach(function (word) {
    out = out.replace(esc(word), '<b>' + esc(word) + '</b>');
  });
  return out;
}

/* Средний балл по отзывам. Считаем, а не храним отдельно —
   иначе однажды разойдётся с самими отзывами. */
function averageScore(reviews) {
  if (!reviews || reviews.length === 0) return 0;
  var sum = reviews.reduce(function (total, r) { return total + r.score; }, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

/* Строка звёзд: 4 → ★★★★☆ */
function starsHtml(score) {
  var full = Math.round(score);
  var out = '';
  for (var i = 1; i <= 5; i++) out += (i <= full ? '★' : '☆');
  return '<span class="stars">' + out + '</span>';
}


/* ============================================================================
   9. ПОДВАЛ САЙТА
   ----------------------------------------------------------------------------
   Подвал в духе ONYX: сверху тёмно-синяя бегущая строка «Забронировать
   стол», ниже на мраморе — крупное «Приходите», расписание (часы работы
   каждого заведения), колонки ссылок, название платформы крупно
   и строка с копирайтом.

   Тексты ссылок берутся из platform.footer, список заведений — из venues,
   поэтому новое заведение появляется в подвале само.
   ============================================================================ */

function renderFooter(host) {
  if (!host) return;
  var data = platform.footer || {};

  /* Превращает массив { text, href, primary } в набор ссылок */
  function linkList(items) {
    return (items || []).map(function (item) {
      return '<a href="' + esc(item.href) + '"' + (item.primary ? ' class="primary"' : '') + '>' +
               esc(item.text) +
             '</a>';
    }).join('');
  }

  /* Расписание: название заведения — ссылка, напротив часы работы */
  var schedule = Object.keys(venues).map(function (id) {
    var v = venues[id];
    return '<div class="schedule-row">' +
        '<a href="' + pageUrl('venue', id) + '">' + esc(v.name) + '</a>' +
        '<span>' + esc((v.contacts || {}).hours || '') + '</span>' +
      '</div>';
  }).join('');

  /* Соцсети — ссылкой с иконкой. Без адреса не показываем: ссылка
     «в никуда» хуже, чем её отсутствие. Нет ни одной — колонки нет. */
  var socialLinks = (data.social || []).filter(function (item) {
    return item.href && item.href !== '#';
  }).map(function (item) {
    return '<a href="' + esc(item.href) + '" target="_blank" rel="noopener">' +
             (item.icon === 'whatsapp' ? ICON_WHATSAPP : ICON_INSTAGRAM) + esc(item.text) +
           '</a>';
  }).join('');

  /* Бегущая строка ведёт к брони: на странице заведения открывает форму,
     на главной — список заведений (брони без заведения не бывает) */
  var canBook = typeof openBooking === 'function' && document.getElementById('bookingOverlay');
  var phrase = '<span class="marquee-item">Забронировать стол</span>';
  var half = phrase + phrase + phrase + phrase;

  host.className = 'site-footer';
  host.innerHTML =
    '<a class="marquee" id="footerMarquee" href="' + (canBook ? '#' : 'index.html#venuesHead') + '">' +
      '<span class="marquee-track">' + half + half + '</span>' +
    '</a>' +
    '<div class="footer-hello">' +
      '<div class="eyebrow">Ждём вас</div>' +
      '<h2>Приходите</h2>' +
    '</div>' +
    '<div class="footer-top-row">' +
      '<div class="footer-schedule">' +
        '<div class="footer-schedule-head">' + ICON_CLOCK + 'Часы работы</div>' +
        schedule +
      '</div>' +
      '<div class="footer-cols">' +
        '<div class="footer-col"><h4>Компания</h4>' + linkList(data.company) + '</div>' +
        '<div class="footer-col"><h4>Партнёрам</h4>' + linkList(data.partners) + '</div>' +
        (socialLinks
          ? '<div class="footer-col"><h4>Мы в соцсетях</h4>' +
              '<div class="footer-social">' + socialLinks + '</div>' +
            '</div>'
          : '') +
      '</div>' +
    '</div>' +
    '<div class="footer-word" aria-hidden="true">' + esc(platform.name) + '</div>' +
    '<div class="footer-bottom">' +
      /* Год берём текущий, а не пишем в данные — иначе он устареет 1 января */
      '<div class="footer-note">© ' + new Date().getFullYear() + ' ' + esc(platform.name) + '. ' +
        esc(data.note || '') + '</div>' +
      '<a class="footer-up" href="#">Наверх &uarr;</a>' +
    '</div>';

  if (canBook) {
    document.getElementById('footerMarquee').addEventListener('click', function (e) {
      e.preventDefault();
      openBooking(null);
    });
  }
}


/* ============================================================================
   9а. АФИША: СОБЫТИЯ ЗАВЕДЕНИЙ
   ----------------------------------------------------------------------------
   Концерты, стендап, открытия, мастер-классы — как на sxodim.com или
   ticketon.kz, но с главным отличием: под событие сразу бронируется стол.
   Билеты мы не продаём — вход и депозит гость оплачивает заведению.

   Данные — venue.events в venues.js, категории — platform.eventTypes.
   Здесь общие детали: карточка, окно события, календарь, «поделиться».
   Страницы: events.html (вся афиша), блок на главной, блок у заведения.
   ============================================================================ */

var WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
var MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/* 'ГГГГ-ММ-ДД' → дата в местном времени (без сдвига часового пояса) */
function isoToDate(iso) {
  var p = String(iso).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/* Дата через n дней после iso, в виде 'ГГГГ-ММ-ДД' */
function isoAfter(iso, days) {
  var d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* Все будущие события всех заведений одним списком, по дате и времени.
   К каждому добавляем venueId — чтобы знать, где бронировать. */
function allEvents() {
  var today = todayISO();
  var list = [];
  Object.keys(venues).forEach(function (id) {
    (venues[id].events || []).forEach(function (ev) {
      if (ev.date >= today) list.push(Object.assign({ venueId: id }, ev));
    });
  });
  return list.sort(function (a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
  });
}

function findEvent(id) {
  return allEvents().filter(function (ev) { return ev.id === id; })[0] || null;
}

function eventTag(ev) {
  var t = (platform.eventTypes || {})[ev.type];
  return t ? t.tag : 'Событие';
}

/* «Сегодня», «Завтра» или «пт, 13 ноября» */
function eventDayLabel(iso) {
  if (iso === todayISO()) return 'Сегодня';
  if (iso === isoAfter(todayISO(), 1)) return 'Завтра';
  return WEEKDAYS_SHORT[isoToDate(iso).getDay()] + ', ' + prettyDate(iso);
}

/* Ссылка на бронь под событие: страница заведения сама откроет форму
   с датой и временем события (см. initEventBookingFromUrl) */
function eventBookUrl(ev) {
  return 'venue.html?id=' + encodeURIComponent(ev.venueId) + '&event=' + encodeURIComponent(ev.id);
}

/* Карточка события: фото с датой-печатью, категория, название, где и когда */
function eventCardHtml(ev) {
  var v = venues[ev.venueId];
  var d = isoToDate(ev.date);
  return '<article class="ev-card' + (ev.pin ? ' is-pinned' : '') + '">' +
      (ev.pin ? adLabelHtml(ev.pin === 'paid') : '') +
      '<button type="button" class="ev-photo" data-open-event="' + esc(ev.id) + '" ' +
              'style="background-image:url(\'' + esc(ev.photo || v.cover) + '\')" aria-label="' + esc(ev.title) + '">' +
        '<span class="ev-date"><b>' + d.getDate() + '</b><span>' + MONTHS_SHORT[d.getMonth()] + '</span></span>' +
        '<span class="ev-tag">' + esc(eventTag(ev)) + '</span>' +
      '</button>' +
      '<div class="ev-body">' +
        '<div class="ev-venue">' + esc(v.name) + '</div>' +
        '<h3 class="ev-title">' + esc(ev.title) + '</h3>' +
        '<div class="ev-meta">' + esc(eventDayLabel(ev.date)) + ' · ' + esc(ev.time) + '</div>' +
        '<div class="ev-price">' + esc(ev.price) + (ev.note ? ' <span>· ' + esc(ev.note) + '</span>' : '') + '</div>' +
        '<div class="ev-actions">' +
          '<a class="btn btn-coral btn-small" href="' + eventBookUrl(ev) + '">Забронировать стол</a>' +
          '<button type="button" class="link-more ev-more" data-open-event="' + esc(ev.id) + '">Подробнее</button>' +
        '</div>' +
      '</div>' +
    '</article>';
}


/* --- Окно события ---------------------------------------------------------
   Создаётся один раз на странице. Открывается кнопкой «Подробнее»
   (любой элемент с data-open-event) или ссылкой ?event=… на «Афише». */
function ensureEventModal() {
  if (document.getElementById('eventOverlay')) return;

  var overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'eventOverlay';
  overlay.innerHTML =
    '<div class="modal ev-modal">' +
      '<button class="close-btn" id="eventCloseBtn" aria-label="Закрыть">&times;</button>' +
      '<div class="ev-modal-photo" id="evPhoto"></div>' +
      '<div class="modal-body" id="evBody"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  document.getElementById('eventCloseBtn').addEventListener('click', closeEventModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeEventModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeEventModal();
  });
}

function openEventModal(id) {
  var ev = findEvent(id);
  if (!ev) return;
  ensureEventModal();
  var v = venues[ev.venueId];

  document.getElementById('evPhoto').style.backgroundImage = 'url(\'' + (ev.photo || v.cover) + '\')';
  document.getElementById('evBody').innerHTML =
    '<div class="eyebrow">' + esc(eventTag(ev)) + '</div>' +
    '<h2>' + esc(ev.title) + '</h2>' +
    '<div class="ev-rows">' +
      '<div><span>Когда</span><b>' + esc(eventDayLabel(ev.date)) + ', ' + esc(ev.time) +
        (ev.end ? '–' + esc(ev.end) : '') + '</b></div>' +
      '<div><span>Где</span><b><a href="' + pageUrl('venue', ev.venueId) + '">' + esc(v.name) + '</a></b></div>' +
      '<div><span>Адрес</span><b>' + esc(v.location) + '</b></div>' +
      '<div><span>Вход</span><b>' + esc(ev.price) + (ev.note ? ', ' + esc(ev.note) : '') + '</b></div>' +
    '</div>' +
    '<p class="ev-text">' + esc(ev.text || '') + '</p>' +
    '<p class="ev-pay">Билеты мы не продаём: вход и депозит оплачиваются в заведении. ' +
      'Бронь стола — бесплатно.</p>' +
    '<div class="ev-modal-actions">' +
      '<a class="btn btn-coral" href="' + eventBookUrl(ev) + '">Забронировать стол</a>' +
      '<button type="button" class="btn btn-ghost" id="evCalendar">В календарь</button>' +
      '<button type="button" class="link-more" id="evShare">Поделиться</button>' +
    '</div>' +
    '<div class="ev-share-note" id="evShareNote" aria-live="polite"></div>';

  document.getElementById('evCalendar').addEventListener('click', function () { downloadEventIcs(ev); });
  document.getElementById('evShare').addEventListener('click', function () { shareEvent(ev); });

  document.getElementById('eventOverlay').classList.add('open');
  document.body.classList.add('no-scroll');
}

function closeEventModal() {
  document.getElementById('eventOverlay').classList.remove('open');
  document.body.classList.remove('no-scroll');
}

/* Кнопки «Подробнее» в любом месте страницы — один общий обработчик */
document.addEventListener('click', function (e) {
  var btn = e.target.closest && e.target.closest('[data-open-event]');
  if (!btn) return;
  e.preventDefault();
  openEventModal(btn.getAttribute('data-open-event'));
});


/* --- «В календарь»: файл .ics, который понимают телефоны и Google Календарь.
   В Казахстане с 2024 года одно время — UTC+5. Пишем время в UTC,
   тогда календарь сам покажет его правильно в любом часовом поясе. */
function icsTime(dateIso, time) {
  var p = dateIso.split('-').map(Number);
  var t = String(time || '00:00').split(':').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], t[0] - 5, t[1]));
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function downloadEventIcs(ev) {
  var v = venues[ev.venueId];
  /* Конец: время окончания; если оно «за полночь» — следующий день; если нет — +3 часа */
  var endDate = ev.date;
  var endTime = ev.end;
  if (!endTime) {
    var h = Number(ev.time.split(':')[0]) + 3;
    endTime = String(h % 24).padStart(2, '0') + ':' + ev.time.split(':')[1];
    if (h >= 24) endDate = isoAfter(ev.date, 1);
  } else if (endTime < ev.time) {
    endDate = isoAfter(ev.date, 1);
  }

  var lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Oryn//Afisha//RU', 'BEGIN:VEVENT',
    'UID:' + ev.id + '@oryn',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
    'DTSTART:' + icsTime(ev.date, ev.time),
    'DTEND:' + icsTime(endDate, endTime),
    'SUMMARY:' + ev.title + ' — ' + v.name,
    'LOCATION:' + v.name + ', ' + v.location,
    'DESCRIPTION:' + (ev.text || '') + ' Вход: ' + ev.price,
    'END:VEVENT', 'END:VCALENDAR'
  ];
  var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ev.id + '.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* --- «Поделиться»: на телефоне — системное меню (WhatsApp, Telegram…),
   на компьютере — ссылка копируется в буфер обмена */
function shareEvent(ev) {
  var url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'events.html?event=' + encodeURIComponent(ev.id);
  var note = document.getElementById('evShareNote');
  if (navigator.share) {
    navigator.share({ title: ev.title, text: ev.title + ' — ' + venues[ev.venueId].name, url: url }).catch(function () {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function () { note.textContent = 'Ссылка скопирована'; });
  } else {
    note.textContent = url;
  }
}


/* --- Бронь под событие ------------------------------------------------------
   Открывает обычную форму брони, но с датой и временем события
   и пометкой, на какое событие бронь. */
var bookingEvent = null;   // событие, под которое открыли форму (или null)

function openBookingForEvent(ev) {
  openBooking(null);
  bookingEvent = ev;
  document.getElementById('bookingTitle').textContent = 'Стол на событие';
  document.getElementById('bookingSub').textContent =
    ev.title + ' · ' + eventDayLabel(ev.date) + ', ' + ev.time;
  document.getElementById('bkDate').value = ev.date;
  var timeSelect = document.getElementById('bkTime');
  if ([].some.call(timeSelect.options, function (o) { return o.value === ev.time; })) timeSelect.value = ev.time;
}

/* На странице заведения: ссылка вида venue.html?id=circus&event=jazz-friday
   сразу открывает форму брони под это событие */
function initEventBookingFromUrl() {
  var id = new URLSearchParams(location.search).get('event');
  if (!id) return;
  var ev = findEvent(id);
  if (ev && ev.venueId === getVenueId()) openBookingForEvent(ev);
}


/* ============================================================================
   9б. ПРОДВИЖЕНИЕ: РЕКЛАМНЫЕ МЕСТА
   ----------------------------------------------------------------------------
   Заведение может купить место повыше: «Выбор недели» на главной,
   первое место в каталоге, событие в топе афиши (см. platform.adFormats).
   Данные — venue.ads и event.pin в venues.js.

   Правило честности: платное место всегда подписано «Реклама», место,
   которое мы выбрали сами, — «Выбор редакции». Так требует закон РК
   «О рекламе», и так гость продолжает доверять каталогу.
   ============================================================================ */

/* Действует ли место сейчас: есть и срок ещё не прошёл */
function adActive(slot) {
  return !!(slot && slot.until && slot.until >= todayISO());
}

/* Подпись над карточкой */
function adLabelHtml(paid) {
  return '<span class="ad-label' + (paid ? ' paid' : '') + '">' +
           (paid ? 'Реклама' : 'Выбор редакции') +
         '</span>';
}

/* Заведение с действующим местом «первое в каталоге» */
function venueOnTop(v) {
  return adActive((v.ads || {}).top);
}

/* Заведение недели для большого блока на главной. Платное место важнее
   выбора редакции; если таких несколько — то, у кого срок кончается раньше. */
function featuredVenueId() {
  var ids = Object.keys(venues).filter(function (id) {
    return adActive((venues[id].ads || {}).featured);
  });
  ids.sort(function (a, b) {
    var fa = venues[a].ads.featured, fb = venues[b].ads.featured;
    if (!!fb.paid !== !!fa.paid) return fb.paid ? 1 : -1;
    return fa.until.localeCompare(fb.until);
  });
  return ids[0] || null;
}

/* Отмеченные события — первыми, остальные по дате */
function pinnedEventsFirst(list) {
  return list.filter(function (ev) { return ev.pin; })
    .concat(list.filter(function (ev) { return !ev.pin; }));
}


/* ============================================================================
   10. ПОЯВЛЕНИЕ ПРИ ПРОКРУТКЕ
   ----------------------------------------------------------------------------
   Элементы с классом .reveal приглушены, пока не попадут в среднюю часть
   экрана. Следит за этим IntersectionObserver — встроенный в браузер
   механизм: он сам сообщает, когда элемент вошёл в зону видимости.
   Это дешевле, чем считать координаты на каждое движение прокрутки.
   ============================================================================ */

function initScrollReveal() {
  var items = document.querySelectorAll('.reveal');
  if (items.length === 0) return;

  /* Показать всё сразу, если браузер старый или человек отключил анимации */
  var noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (noMotion || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('visible'); });
    return;
  }

  var observerWorked = false;

  var observer = new IntersectionObserver(function (entries) {
    observerWorked = true;
    entries.forEach(function (entry) {
      /* Добавляем и снимаем класс, а не только добавляем — тогда эффект
         работает в обе стороны: при прокрутке назад элемент снова гаснет
         у края экрана и проявляется, когда возвращается в середину. */
      entry.target.classList.toggle('visible', entry.isIntersecting);
    });
  }, {
    /* Сужаем зону на 12% сверху и снизу: яркой считается середина экрана,
       а не весь его край. Именно это даёт эффект «проявления к центру». */
    rootMargin: '-12% 0px -12% 0px',
    threshold: 0.12
  });

  items.forEach(function (el) { observer.observe(el); });

  /* Страховка. Обычно наблюдатель сообщает о видимых элементах сразу после
     запуска. Но если в какой-то среде он промолчит, вся страница останется
     полупрозрачной — а это выглядит как поломка. Через полторы секунды
     проверяем, сработал ли он хоть раз, и если нет — показываем всё.
     Лучше без эффекта, чем приглушённый сайт. */
  setTimeout(function () {
    if (observerWorked) return;
    items.forEach(function (el) { el.classList.add('visible'); });
  }, 1500);
}


/* ============================================================================
   11. ЗАПУСК СТРАНИЦЫ
   ----------------------------------------------------------------------------
   Одна строка в странице собирает всё общее:
       const venue = initVenuePage('hall');
   ============================================================================ */

function initVenuePage(page) {
  var venue = getVenue();

  var titles = { menu: ' — меню', owner: ' — кабинет владельца', hall: ' — карта зала' };
  document.title = venue.name + (titles[page] || '');

  applyTheme(platform.theme);   // одна палитра на весь сайт
  renderNav(venue, page);       // шапка со строкой-объявлением
  renderHero(venue, page);      // фото на весь экран
  renderLocalNav(venue, page);  // полоса разделов заведения
  renderSidebar(venue);         // меню под шапкой для телефона
  createBookingModal(venue);
  renderFooter(document.getElementById('siteFooter'));

  /* Кнопки в правом нижнем углу: бронь всегда под рукой */
  renderActionBar([
    { text: 'Забронировать', onClick: function () { openBooking(null); } },
    { text: 'Меню',          href: pageUrl('menu', venue.id) },
    { text: 'Карта зала',    href: pageUrl('venue', venue.id) + '#hallBand' }
  ]);

  /* Esc закрывает то, что открыто сверху: сначала модалку, потом меню */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var modal = document.getElementById('bookingOverlay');
    if (modal && modal.classList.contains('open')) { closeBooking(); return; }
    if (document.getElementById('sidebar').classList.contains('open')) closeSidebar();
  });

  return venue;
}
