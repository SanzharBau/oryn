/* ============================================================================
   owner-analytics.js — ВКЛАДКИ АНАЛИТИКИ В КАБИНЕТЕ ВЛАДЕЛЬЦА
   ----------------------------------------------------------------------------
   Вкладки:
     1. Себестоимость гостя — счётчики, расходники, расходы → база на гостя
     2. Техкарты           — граммы × цена = себестоимость блюда
     3. Склад              — норма по техкартам против факта, перерасход
     4. Кухня              — время приготовления и ожидание на раздаче
     5. Маркетинг          — цена гостя по каналам, эффект рекламы, прогноз
     6. Прогноз            — сколько гостей завтра и что закупить

   Цифры берём из owner-demo.js (объект DEMO). Поля с рамкой можно менять —
   всё пересчитывается сразу. Изменения живут только до перезагрузки
   страницы: сохранять их некуда, пока нет сервера.

   Подключается в owner.html ПОСЛЕ основного скрипта страницы: пользуется
   его переменной venue и функцией money.
   ============================================================================ */


/* ----------------------------------------------------------------------------
   0. ПОМОЩНИКИ
   ---------------------------------------------------------------------------- */

/* Целое число с пробелами: 1234567 → «1 234 567» */
function fmt(n) {
  var sign = n < 0 ? '−' : '';
  return sign + money(Math.round(Math.abs(n)));
}

/* Число с одним знаком после запятой: 2.45 → «2,5» */
function fmt1(n) {
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',').replace(',0', '');
}

/* Цветная метка: ok — зелёная, warn — жёлтая, bad — красная */
function tagHtml(level, text) {
  return '<span class="a-tag ' + level + '">' + esc(text) + '</span>';
}

/* Таблица. На телефоне её можно листать вбок, страница при этом не едет. */
function tableHtml(headers, rows, footer) {
  return '<div class="a-table-wrap"><table class="a-table">' +
      '<thead><tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody>' +
      (footer ? '<tfoot><tr>' + footer.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr></tfoot>' : '') +
    '</table></div>';
}

/* Поле ввода числа. path — где лежит значение в DEMO, например «meters.0.start». */
function inputHtml(path, value, width) {
  return '<input class="a-input" type="number" inputmode="decimal" min="0" step="any" ' +
    'data-path="' + path + '" value="' + value + '"' +
    (width ? ' style="width:' + width + 'px"' : '') + '>';
}

/* Записать значение поля обратно в DEMO по пути «meters.0.start» */
function setByPath(path, value) {
  var keys = path.split('.');
  var target = DEMO;
  for (var i = 0; i < keys.length - 1; i++) target = target[keys[i]];
  target[keys[keys.length - 1]] = value;
}

/* Цена из меню: «6890 ₸» → 6890 */
function menuPrice(dishName) {
  var found = null;
  venue.menu.forEach(function (section) {
    section.items.forEach(function (dish) { if (dish.name === dishName) found = dish; });
  });
  return found ? Number(onlyDigits(found.price)) : 0;
}

function menuDish(dishName) {
  var found = null;
  venue.menu.forEach(function (section) {
    section.items.forEach(function (dish) { if (dish.name === dishName) found = dish; });
  });
  return found;
}

/* Устойчивое «случайное» число 0…1 из строки — как demoNumber на странице */
function demoShare(key) {
  return demoNumber(key, 0, 1000) / 1000;
}

/* Мелкая подсказка под блоком */
function noteHtml(text) {
  return '<p class="a-note">' + text + '</p>';
}


/* ----------------------------------------------------------------------------
   1. СЕБЕСТОИМОСТЬ ГОСТЯ
   ---------------------------------------------------------------------------- */

/* Вся математика в одном месте. Остальные вкладки берут отсюда
   базу на гостя и «сколько остаётся с одного гостя». */
function costModel() {
  var m = DEMO.month;

  var metersSum = DEMO.meters.reduce(function (s, r) { return s + (r.end - r.start) * r.price; }, 0);
  var suppliesSum = DEMO.supplies.reduce(function (s, r) { return s + (r.start + r.bought - r.end) * r.price; }, 0);
  var fixed = DEMO.expenses.reduce(function (s, r) { return s + r.sum; }, 0);
  var variable = metersSum + suppliesSum;   // растут вместе с числом гостей

  var guests = Math.max(1, m.guests);
  var varPerGuest = variable / guests;
  var foodPerGuest = m.avgCheck * m.foodPct / 100;
  var taxPerGuest = m.avgCheck * (m.taxPct + m.acquiringPct) / 100;

  /* Сколько остаётся с одного гостя на аренду, зарплаты и прибыль */
  var contribution = m.avgCheck - foodPerGuest - taxPerGuest - varPerGuest;

  return {
    metersSum: metersSum,
    suppliesSum: suppliesSum,
    fixed: fixed,
    variable: variable,
    guests: guests,
    base: (fixed + variable) / guests,
    fixedPerGuest: fixed / guests,
    varPerGuest: varPerGuest,
    foodPerGuest: foodPerGuest,
    taxPerGuest: taxPerGuest,
    contribution: contribution,
    breakEven: contribution > 0 ? fixed / contribution : Infinity,
    profit: guests * contribution - fixed,
    /* Что будет при другом числе гостей */
    at: function (g) {
      return { base: (fixed + varPerGuest * g) / g, profit: g * contribution - fixed };
    }
  };
}

function renderCost() {
  var host = document.getElementById('paneCost');

  var meterRows = DEMO.meters.map(function (r, i) {
    return [
      esc(r.name),
      inputHtml('meters.' + i + '.start', r.start, 96),
      inputHtml('meters.' + i + '.end', r.end, 96),
      '<span id="m-use-' + i + '"></span> ' + esc(r.unit),
      inputHtml('meters.' + i + '.price', r.price, 70) + ' ₸',
      '<b id="m-sum-' + i + '"></b>'
    ];
  });

  var supplyRows = DEMO.supplies.map(function (r, i) {
    return [
      esc(r.name) + ' <span class="a-unit">' + esc(r.unit) + '</span>',
      inputHtml('supplies.' + i + '.start', r.start, 64),
      inputHtml('supplies.' + i + '.bought', r.bought, 70),
      inputHtml('supplies.' + i + '.end', r.end, 64),
      '<span id="s-use-' + i + '"></span>',
      '<span id="s-day-' + i + '"></span>',
      '<span id="s-100-' + i + '"></span>',
      inputHtml('supplies.' + i + '.price', r.price, 70) + ' ₸',
      '<b id="s-sum-' + i + '"></b>'
    ];
  });

  var expenseRows = DEMO.expenses.map(function (r, i) {
    return [esc(r.name), inputHtml('expenses.' + i + '.sum', r.sum, 120) + ' ₸'];
  });

  var m = DEMO.month;
  var monthFields = [
    ['Гостей за месяц', 'guests', ''],
    ['Средний чек на гостя', 'avgCheck', '₸'],
    ['Позиций на гостя', 'itemsPerGuest', 'шт'],
    ['Продукты от чека', 'foodPct', '%'],
    ['Налог', 'taxPct', '%'],
    ['Комиссия Kaspi / эквайринга', 'acquiringPct', '%']
  ];

  host.innerHTML =
    '<div class="a-intro">' +
      '<p><b>Базовая стоимость гостя</b> — сколько ресторан тратит на одного гостя, ещё до продуктов на тарелке: ' +
      'аренда, зарплаты, вода, свет, бумага, салфетки, уборка.</p>' +
      '<p class="a-formula">Все расходы за месяц (кроме продуктов) ÷ гостей за месяц</p>' +
      '<p>Меняйте цифры в рамках — всё пересчитается.</p>' +
    '</div>' +

    '<div class="kpi-grid" id="costKpi"></div>' +

    '<h3 class="a-h">Счётчики</h3>' +
    noteHtml('Показания раз в месяц: на 1-е число и на последнее. Каждый день мерить не нужно — результат тот же.') +
    tableHtml(['Счётчик', 'Начало месяца', 'Конец месяца', 'Расход', 'Тариф', 'Сумма, ₸'], meterRows,
      ['<b>Итого</b>', '', '', '', '', '<b id="meters-total"></b>']) +

    '<h3 class="a-h">Расходники</h3>' +
    noteHtml('Расход = остаток на начало + закупили − остаток на конец. Так считается любой расходник: ' +
      'туалетная бумага, полотенца после мытья рук, салфетки на столах, химия для уборки.') +
    tableHtml(['Что', 'Было', 'Закупили', 'Осталось', 'Ушло', 'В день', 'На 100 гостей', 'Цена', 'Сумма, ₸'], supplyRows,
      ['<b>Итого</b>', '', '', '', '', '', '', '', '<b id="supplies-total"></b>']) +

    '<div class="a-two">' +
      '<div>' +
        '<h3 class="a-h">Постоянные расходы</h3>' +
        noteHtml('Не зависят от числа гостей: аренда и зарплаты одинаковы, пришло 50 человек или 500.') +
        tableHtml(['Статья', 'За месяц'], expenseRows, ['<b>Итого</b>', '<b id="fixed-total"></b>']) +
      '</div>' +
      '<div>' +
        '<h3 class="a-h">Гости и чек</h3>' +
        noteHtml('Число гостей и средний чек берутся из кассы.') +
        tableHtml(['Показатель', 'Значение'], monthFields.map(function (f) {
          return [f[0], inputHtml('month.' + f[1], m[f[1]], 100) + ' ' + f[2]];
        })) +
      '</div>' +
    '</div>' +

    '<h3 class="a-h">Если гостей станет больше</h3>' +
    noteHtml('Аренда и зарплаты делятся на большее число людей — каждый гость обходится дешевле.') +
    '<div id="whatIf"></div>' +
    '<div class="a-callout" id="costInsight"></div>';

  updateCost();
}

/* Пересчитать только цифры — поля ввода не трогаем, чтобы не сбить курсор */
function updateCost() {
  var c = costModel();
  var m = DEMO.month;
  var set = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text; };

  DEMO.meters.forEach(function (r, i) {
    set('m-use-' + i, fmt(r.end - r.start));
    set('m-sum-' + i, fmt((r.end - r.start) * r.price));
  });
  DEMO.supplies.forEach(function (r, i) {
    var used = r.start + r.bought - r.end;
    set('s-use-' + i, fmt(used));
    set('s-day-' + i, fmt1(used / m.days));
    set('s-100-' + i, fmt1(used / c.guests * 100));
    set('s-sum-' + i, fmt(used * r.price));
  });
  set('meters-total', fmt(c.metersSum));
  set('supplies-total', fmt(c.suppliesSum));
  set('fixed-total', fmt(c.fixed));

  var kpis = [
    { label: 'Базовая стоимость гостя', value: fmt(c.base) + ' ₸', sub: 'до продуктов на тарелке', main: true },
    { label: 'Из них постоянные', value: fmt(c.fixedPerGuest) + ' ₸', sub: 'аренда, зарплаты и др.' },
    { label: 'Из них переменные', value: fmt(c.varPerGuest) + ' ₸', sub: 'вода, свет, расходники' },
    { label: 'Точка безубыточности', value: isFinite(c.breakEven) ? fmt(c.breakEven) + ' гостей' : 'не достигается',
      sub: isFinite(c.breakEven) ? '≈ ' + fmt(c.breakEven / m.days) + ' в день — чтобы выйти в ноль' : 'гость приносит меньше, чем стоит' },
    { label: 'Прибыль за месяц', value: fmt(c.profit) + ' ₸', sub: 'до налога на прибыль', bad: c.profit < 0 }
  ];
  document.getElementById('costKpi').innerHTML = kpis.map(function (k) {
    return '<div class="kpi' + (k.main ? ' kpi-main' : '') + '">' +
        '<div class="kpi-label">' + esc(k.label) + '</div>' +
        '<div class="kpi-value' + (k.bad ? ' neg' : '') + '">' + esc(k.value) + '</div>' +
        '<div class="kpi-delta">' + esc(k.sub) + '</div>' +
      '</div>';
  }).join('');

  var steps = [-20, 0, 10, 25];
  document.getElementById('whatIf').innerHTML = tableHtml(
    ['Гостей в месяц', 'База на гостя', 'Прибыль за месяц'],
    steps.map(function (p) {
      var g = Math.round(c.guests * (1 + p / 100));
      var r = c.at(g);
      var label = fmt(g) + (p === 0 ? ' <span class="a-unit">сейчас</span>' : ' <span class="a-unit">' + (p > 0 ? '+' : '') + p + '%</span>');
      return [label, fmt(r.base) + ' ₸', '<span class="' + (r.profit < 0 ? 'neg' : 'pos') + '">' + fmt(r.profit) + ' ₸</span>'];
    })
  );

  var plus10 = c.at(Math.round(c.guests * 1.1));
  document.getElementById('costInsight').innerHTML =
    '<b>Что это значит.</b> Каждый гость сверх ' + fmt(c.breakEven) + ' в месяц приносит около ' +
    fmt(c.contribution) + ' ₸ чистыми. Плюс 10% гостей — это ' + fmt(plus10.profit - c.profit) +
    ' ₸ прибыли в месяц без новых расходов на аренду и зарплаты. Поэтому пустой стол и гость, ' +
    'который не пришёл по брони, — прямые потери.';
}


/* ----------------------------------------------------------------------------
   2. ТЕХКАРТЫ
   ---------------------------------------------------------------------------- */

var techIndex = 0;   // какое блюдо открыто

function productByName(name) {
  return DEMO.products.filter(function (p) { return p.name === name; })[0];
}

function semiByName(name) {
  return DEMO.semis.filter(function (s) { return s.name === name; })[0];
}

/* Стоимость количества продукта: граммы и мл — от цены за кг/л, штуки — поштучно */
function productCost(name, qty) {
  var p = productByName(name);
  if (p) return p.unit === 'шт' ? p.price * qty : p.price * qty / 1000;
  var semi = semiByName(name);
  if (semi) return semiPricePerKg(semi) * qty / 1000;
  return 0;
}

/* Заготовка: стоимость всей партии ÷ выход в кг */
function semiBatchCost(semi) {
  return semi.items.reduce(function (s, it) { return s + productCost(it.p, it.qty); }, 0);
}
function semiPricePerKg(semi) {
  return semiBatchCost(semi) / semi.yieldKg;
}

function unitOf(name) {
  var p = productByName(name);
  if (!p) return 'г';
  return p.unit === 'шт' ? 'шт' : (p.unit === 'л' ? 'мл' : 'г');
}

function cardCost(card) {
  return card.items.reduce(function (s, it) { return s + productCost(it.p, it.gross); }, 0);
}

/* Фудкост: доля продуктов в цене. До 35% — норма, 35–40% — проверить, выше — пересмотреть */
function foodLevel(pct) {
  if (pct <= 35) return ['ok', 'в норме'];
  if (pct <= 40) return ['warn', 'проверить'];
  return ['bad', 'пересмотреть'];
}

function renderTech() {
  var host = document.getElementById('paneTech');

  host.innerHTML =
    '<div class="a-intro">' +
      '<p><b>Техкарта</b> — рецепт блюда с точными граммами. Повар один раз готовит блюдо на весах, ' +
      'и дальше себестоимость считается сама.</p>' +
      '<p class="a-formula">Граммы каждого продукта × цена за грамм, затем сумма</p>' +
      '<p><b>Брутто</b> — сколько взяли со склада, <b>нетто</b> — сколько пошло в блюдо после чистки. ' +
      'Платим за брутто, поэтому считаем по нему.</p>' +
    '</div>' +
    '<div class="a-chips" id="techChips"></div>' +
    '<div id="techDish"></div>' +
    '<h3 class="a-h">Все блюда</h3>' +
    '<div id="techSummary"></div>' +
    '<h3 class="a-h">Заготовки</h3>' +
    noteHtml('Соус варят кастрюлей, поэтому у него своя техкарта на всю партию. ' +
      'Цена 1 кг = стоимость партии ÷ сколько соуса вышло.') +
    '<div id="techSemis"></div>' +
    '<h3 class="a-h">Цены продуктов</h3>' +
    noteHtml('По последним накладным поставщиков. Поменяйте цену — все блюда с этим продуктом пересчитаются. ' +
      'Например, поднимите конину до 5 500 ₸.') +
    '<div class="a-price-grid">' +
      DEMO.products.map(function (p, i) {
        return '<label class="a-price">' +
            '<span>' + esc(p.name) + '</span>' +
            '<span>' + inputHtml('products.' + i + '.price', p.price, 86) + ' ₸/' + esc(p.unit) + '</span>' +
          '</label>';
      }).join('') +
    '</div>';

  document.getElementById('techChips').innerHTML = DEMO.techCards.map(function (card, i) {
    return '<button type="button" class="filter-btn' + (i === techIndex ? ' active' : '') + '" data-tech="' + i + '">' +
      esc(card.dish.split(' «')[0]) + '</button>';
  }).join('');

  updateTech();
}

function updateTech() {
  var card = DEMO.techCards[techIndex];
  var c = costModel();
  var dish = menuDish(card.dish);
  var price = menuPrice(card.dish);
  var products = cardCost(card);
  var baseShare = c.base / DEMO.month.itemsPerGuest;
  var full = products + baseShare;
  var pct = price ? products / price * 100 : 0;
  var level = foodLevel(pct);

  var rows = card.items.map(function (it) {
    var waste = it.gross ? Math.round((1 - it.net / it.gross) * 100) : 0;
    var semi = semiByName(it.p);
    var unitPrice = semi ? semiPricePerKg(semi) : productByName(it.p).price;
    var unitLabel = semi ? '₸/кг' : '₸/' + productByName(it.p).unit;
    return [
      esc(it.p),
      it.gross + ' ' + unitOf(it.p),
      it.net + ' ' + unitOf(it.p),
      waste ? waste + '%' : '—',
      fmt(unitPrice) + ' ' + unitLabel,
      '<b>' + fmt(productCost(it.p, it.gross)) + ' ₸</b>'
    ];
  });

  document.getElementById('techDish').innerHTML =
    '<div class="a-dish">' +
      (dish && dish.photo ? '<img class="a-dish-photo" src="' + esc(dish.photo) + '" alt="">' : '') +
      '<div class="a-dish-body">' +
        '<h3 class="a-dish-name">' + esc(card.dish) + '</h3>' +
        tableHtml(['Продукт', 'Брутто', 'Нетто', 'Отход', 'Цена', 'Стоимость'], rows,
          ['<b>Продукты на блюдо</b>', '', '', '', '', '<b>' + fmt(products) + ' ₸</b>']) +
        '<div class="a-sum">' +
          '<div><span>Продукты</span><b>' + fmt(products) + ' ₸</b></div>' +
          '<div><span>Доля базы гостя на блюдо</span><b>' + fmt(baseShare) + ' ₸</b>' +
            '<small>база ' + fmt(c.base) + ' ₸ ÷ ' + fmt1(DEMO.month.itemsPerGuest) + ' позиции на гостя</small></div>' +
          '<div><span>Полная себестоимость</span><b>' + fmt(full) + ' ₸</b></div>' +
          '<div><span>Цена в меню</span><b>' + fmt(price) + ' ₸</b></div>' +
          '<div><span>Продукты от цены (фудкост)</span><b>' + fmt1(pct) + '% ' + tagHtml(level[0], level[1]) + '</b></div>' +
          '<div><span>Остаётся с блюда</span><b class="' + (price - full < 0 ? 'neg' : 'pos') + '">' + fmt(price - full) + ' ₸</b>' +
            '<small>до налога и комиссии</small></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.getElementById('techSummary').innerHTML = tableHtml(
    ['Блюдо', 'Продукты', 'Цена', 'Фудкост', ''],
    DEMO.techCards.map(function (cd) {
      var pr = menuPrice(cd.dish);
      var cost = cardCost(cd);
      var p = pr ? cost / pr * 100 : 0;
      var lv = foodLevel(p);
      return [esc(cd.dish), fmt(cost) + ' ₸', fmt(pr) + ' ₸', fmt1(p) + '%', tagHtml(lv[0], lv[1])];
    })
  ) + noteHtml('Ориентир: продукты — 25–35% от цены блюда. Выше 40% — поднять цену, уменьшить порцию ' +
    'или заменить дорогой продукт.');

  document.getElementById('techSemis').innerHTML = '<div class="a-two">' + DEMO.semis.map(function (s) {
    return '<div class="a-card">' +
        '<h4>' + esc(s.name.replace(' (заготовка)', '')) + '</h4>' +
        tableHtml(['Продукт', 'На партию', 'Стоимость'], s.items.map(function (it) {
          return [esc(it.p), it.qty + ' ' + unitOf(it.p), fmt(productCost(it.p, it.qty)) + ' ₸'];
        })) +
        '<div class="a-semi-total">Партия ' + fmt(semiBatchCost(s)) + ' ₸ ÷ выход ' + s.yieldKg + ' кг = <b>' +
          fmt(semiPricePerKg(s)) + ' ₸ за кг</b></div>' +
      '</div>';
  }).join('') + '</div>';
}


/* ----------------------------------------------------------------------------
   3. СКЛАД: НОРМА ПРОТИВ ФАКТА
   ---------------------------------------------------------------------------- */

/* Сколько сырья уходит на порции блюда. Заготовки раскладываем на продукты:
   70 г соуса из партии на 3 кг = 70/3000 каждого продукта этой партии. */
function rawUsage(card, portions, into) {
  card.items.forEach(function (it) {
    var semi = semiByName(it.p);
    if (semi) {
      var k = it.gross / (semi.yieldKg * 1000);
      semi.items.forEach(function (s) {
        into[s.p] = (into[s.p] || 0) + s.qty * k * portions;
      });
    } else {
      into[it.p] = (into[it.p] || 0) + it.gross * portions;
    }
  });
  return into;
}

/* Граммы → кг с одним знаком; штуки — как есть */
function qtyText(name, qty) {
  var p = productByName(name);
  if (p && p.unit === 'шт') return fmt(qty) + ' шт';
  return fmt1(qty / 1000) + ' ' + (p && p.unit === 'л' ? 'л' : 'кг');
}

function stockModel() {
  var guests = DEMO.month.guests;
  var norm = {};
  DEMO.techCards.forEach(function (card) {
    rawUsage(card, Math.round(guests * card.share), norm);
  });

  return Object.keys(norm).map(function (name) {
    var factor = DEMO.stockFactor[name] || DEMO.stockFactorDefault;
    var n = norm[name];
    var fact = n * factor;
    var start = n * 0.25;
    var end = n * 0.2;
    var overQty = fact - n;
    return {
      name: name,
      start: start,
      bought: fact + end - start,
      end: end,
      norm: n,
      fact: fact,
      overPct: (factor - 1) * 100,
      overMoney: productCost(name, overQty)
    };
  /* Сверху — самый большой перерасход в процентах: это проблемы, с которых начинать */
  }).sort(function (a, b) { return b.overPct - a.overPct || b.overMoney - a.overMoney; });
}

function stockLevel(pct) {
  if (pct <= 5) return ['ok', 'норма'];
  if (pct <= 10) return ['warn', 'проверить'];
  return ['bad', 'перерасход'];
}

function renderStock() {
  var host = document.getElementById('paneStock');
  var rows = stockModel();
  var total = rows.reduce(function (s, r) { return s + Math.max(0, r.overMoney); }, 0);
  var bad = rows.filter(function (r) { return r.overPct > 10; });
  /* Больше всего денег теряем не обязательно там, где больше процент:
     4% дорогой конины дороже 31% пармезана */
  var worst = rows.slice().sort(function (a, b) { return b.overMoney - a.overMoney; })[0];

  host.innerHTML =
    '<div class="a-intro">' +
      '<p>Повар может положить где-то больше, где-то меньше. За месяц случайные отклонения гасят друг друга, ' +
      'а постоянный перерасход видно сразу.</p>' +
      '<p class="a-formula">Факт (по складу) − норма (продажи × граммы из техкарт)</p>' +
      '<p>До 5% — нормально: погрешность весов, пробы. Больше 10% — разбираться.</p>' +
    '</div>' +

    '<div class="kpi-grid">' +
      '<div class="kpi kpi-main"><div class="kpi-label">Потери за месяц</div><div class="kpi-value">' + fmt(total) + ' ₸</div>' +
        '<div class="kpi-delta">продукты сверх нормы</div></div>' +
      '<div class="kpi"><div class="kpi-label">Продуктов с перерасходом</div><div class="kpi-value">' + bad.length + '</div>' +
        '<div class="kpi-delta">больше 10% сверх нормы</div></div>' +
      '<div class="kpi"><div class="kpi-label">Больше всего теряем</div><div class="kpi-value a-kpi-text">' + esc(worst.name) + '</div>' +
        '<div class="kpi-delta">+' + fmt(worst.overPct) + '% · ' + fmt(worst.overMoney) + ' ₸</div></div>' +
    '</div>' +

    '<h3 class="a-h">Инвентаризация за месяц</h3>' +
    noteHtml('Факт = было на складе + закупили − осталось. Норма = сколько блюд продали × граммы по техкарте. ' +
      'Соусы разложены на продукты, из которых их варят. В демо — продукты пяти блюд из вкладки «Техкарты».') +
    tableHtml(['Продукт', 'Было', 'Закупили', 'Осталось', 'Ушло по факту', 'По норме', 'Разница', 'В деньгах', ''],
      rows.map(function (r) {
        var lv = stockLevel(r.overPct);
        return [
          esc(r.name),
          qtyText(r.name, r.start),
          qtyText(r.name, r.bought),
          qtyText(r.name, r.end),
          '<b>' + qtyText(r.name, r.fact) + '</b>',
          qtyText(r.name, r.norm),
          '+' + fmt1(r.overPct) + '%',
          fmt(r.overMoney) + ' ₸',
          tagHtml(lv[0], lv[1])
        ];
      })) +

    '<div class="a-two">' +
      '<div>' +
        '<h3 class="a-h">' + esc(DEMO.shifts.product) + ' по сменам</h3>' +
        noteHtml('Если перерасход только в одну смену — причина в людях этой смены, а не в рецепте.') +
        '<div class="top-list">' + DEMO.shifts.rows.map(function (s) {
          return '<div class="top-row"><span class="name">' + esc(s.name) + '</span>' +
            '<span class="bar-track"><span class="bar-fill" style="width:' + Math.min(100, s.over * 1.6) + '%"></span></span>' +
            '<span class="val">+' + s.over + '%</span></div>';
        }).join('') + '</div>' +
      '</div>' +
      '<div>' +
        '<h3 class="a-h">Как убрать перерасход</h3>' +
        '<ol class="a-list">' +
          '<li><b>Разложить по порциям заранее.</b> Сыр и мясо утром по пакетам с нужным весом — «на глаз» положить нечем.</li>' +
          '<li><b>Порционные ложки и половники</b> нужного объёма.</li>' +
          '<li><b>Весы на раздаче</b> для дорогих продуктов.</li>' +
          '<li><b>Фото эталонной тарелки</b> на кухне.</li>' +
          '<li><b>Дорогие продукты</b> — мясо, сыр, морепродукты — пересчитывать раз в неделю.</li>' +
        '</ol>' +
      '</div>' +
    '</div>';
}


/* ----------------------------------------------------------------------------
   4. КУХНЯ: ВРЕМЯ ПРИГОТОВЛЕНИЯ
   ---------------------------------------------------------------------------- */

function kitchenLevel(norm, fact) {
  if (fact <= norm * 1.1) return ['ok', 'вовремя'];
  if (fact <= norm * 1.25) return ['warn', 'на грани'];
  return ['bad', 'опаздывает'];
}

function renderKitchen() {
  var host = document.getElementById('paneKitchen');
  var k = DEMO.kitchen;

  var facts = k.dishes.map(function (d) { return d.fact; }).sort(function (a, b) { return a - b; });
  var median = facts[Math.floor(facts.length / 2)];

  /* Свой график: область столбцов фиксированной высоты, подписи — отдельной
     строкой ниже. Так линия нормы стоит точно на своей высоте. */
  var max = Math.max.apply(null, k.hourFact.concat([k.hourNorm])) * 1.15;
  var bars =
    '<div class="a-plot">' +
      k.hours.map(function (h, i) {
        var v = k.hourFact[i];
        return '<div class="a-pcol' + (v > k.hourNorm ? ' over' : '') + '" style="height:' +
          Math.round(v / max * 100) + '%" title="' + h + ':00 · ' + v + ' мин"><span>' + v + '</span></div>';
      }).join('') +
      '<div class="a-norm-line" style="bottom:' + (k.hourNorm / max * 100) + '%"><span>норма ' + k.hourNorm + ' мин</span></div>' +
    '</div>' +
    '<div class="a-plabels">' + k.hours.map(function (h) { return '<span>' + h + '</span>'; }).join('') + '</div>';

  var late = k.dishes.filter(function (d) { return d.fact > d.norm * 1.25; });
  var slowPass = k.dishes.filter(function (d) { return d.pass >= 3; });

  host.innerHTML =
    '<div class="a-intro">' +
      '<p>Для каждого блюда записываем два момента: <b>заказ пришёл на кухню</b> и <b>повар нажал «Готово»</b>. ' +
      'Разница — время приготовления. Отдельно считаем, сколько готовое блюдо <b>ждёт на раздаче</b>, ' +
      'пока его не заберёт официант: здесь блюда остывают.</p>' +
      '<p><a class="link-more" href="kitchen.html">Открыть демо экрана кухни</a></p>' +
    '</div>' +

    '<div class="kpi-grid">' +
      '<div class="kpi"><div class="kpi-label">Блюд за месяц</div><div class="kpi-value">' + fmt(k.dishesCount) + '</div></div>' +
      '<div class="kpi kpi-main"><div class="kpi-label">Типичное время</div><div class="kpi-value">' + median + ' мин</div>' +
        '<div class="kpi-delta">медиана по блюдам</div></div>' +
      '<div class="kpi"><div class="kpi-label">Отдали вовремя</div><div class="kpi-value">' + k.onTimePct + '%</div>' +
        '<div class="kpi-delta">не дольше нормы</div></div>' +
      '<div class="kpi"><div class="kpi-label">Ждут на раздаче</div><div class="kpi-value">' + fmt1(k.passWait) + ' мин</div>' +
        '<div class="kpi-delta">в среднем</div></div>' +
    '</div>' +

    '<h3 class="a-h">Норма и факт по блюдам</h3>' +
    tableHtml(['Блюдо', 'Норма', 'Факт', 'Разница', 'На раздаче', ''],
      k.dishes.map(function (d) {
        var lv = kitchenLevel(d.norm, d.fact);
        var diff = d.fact - d.norm;
        return [esc(d.dish), d.norm + ' мин', '<b>' + d.fact + ' мин</b>',
          (diff > 0 ? '+' : '') + diff + ' мин', fmt1(d.pass) + ' мин' + (d.pass >= 3 ? ' ' + tagHtml('warn', 'остывает') : ''),
          tagHtml(lv[0], lv[1])];
      })) +
    noteHtml('Факт — медиана, то есть типичное время, а не среднее. Отброшено ' + k.dropped +
      ' отметок дольше 60 минут: повар забыл нажать «Готово», и одна такая отметка испортила бы среднее.') +

    '<h3 class="a-h">Пятница по часам</h3>' +
    noteHtml('Типичное время приготовления в каждый час. Красным — дольше нормы ' + k.hourNorm + ' минут.') +
    '<div class="a-plot-wrap">' + bars + '</div>' +

    '<div class="a-callout"><b>Что видно.</b> ' +
      (late.length ? 'Опаздывают: ' + late.map(function (d) { return d.dish.split(' «')[0]; }).join(', ') + '. ' : '') +
      'С 20:00 до 22:00 в пятницу кухня не успевает — стоит добавить повара на горячий цех в этот час или заранее готовить заготовки. ' +
      (slowPass.length ? slowPass.map(function (d) { return d.dish.split(' «')[0]; }).join(', ') +
        ' подолгу стоит на раздаче — официантам нужен сигнал, что блюдо готово.' : '') +
    '</div>' +

    '<h3 class="a-h">Откуда берутся данные</h3>' +
    '<div class="soon-grid a-soon">' +
      '<div class="soon-item"><div class="icon">&#129534;</div><h4>Из кассы</h4>' +
        '<p>У iiko, r_keeper и Poster часто есть экран кухни: повар нажимает «Готово», касса хранит время. Мы забираем эти данные.</p></div>' +
      '<div class="soon-item"><div class="icon">&#128241;</div><h4>Планшет Orын</h4>' +
        '<p>Если на кухне только печатают бегунки — вешаем планшет с нашим экраном. Одна большая кнопка «Готово».</p></div>' +
      '<div class="soon-item"><div class="icon">&#127909;</div><h4>Камера на раздаче</h4>' +
        '<p>Позже: камера сама видит, когда тарелку поставили и когда забрали. Повару ничего нажимать не нужно.</p></div>' +
    '</div>';
}


/* ----------------------------------------------------------------------------
   5. МАРКЕТИНГ
   ---------------------------------------------------------------------------- */

function renderMarketing() {
  var host = document.getElementById('paneMarketing');
  var c = costModel();
  var m = DEMO.month;
  var camp = DEMO.campaign;
  var first = DEMO.channels[0];

  var chRows = DEMO.channels.map(function (ch) {
    var perGuest = ch.guests ? ch.spend / ch.guests : Infinity;
    var result = ch.guests * c.contribution - ch.spend;
    var lv = result > ch.spend * 0.5 ? ['ok', 'окупился'] : (result >= 0 ? ['warn', 'в ноль'] : ['bad', 'не окупился']);
    return [
      esc(ch.name),
      fmt(ch.spend) + ' ₸',
      ch.bookings,
      ch.came,
      ch.guests,
      '<b>' + (isFinite(perGuest) ? fmt(perGuest) + ' ₸' : '—') + '</b>',
      ch.repeat + '%',
      '<span class="' + (result < 0 ? 'neg' : 'pos') + '">' + fmt(result) + ' ₸</span>',
      tagHtml(lv[0], lv[1])
    ];
  });

  /* Сравнение периодов */
  var incWeekday = (camp.during.weekday - camp.before.weekday) * camp.weekdays;
  var incWeekend = (camp.during.weekend - camp.before.weekend) * camp.weekends;
  var incremental = incWeekday + incWeekend;
  var effect = incremental * c.contribution - camp.spend;
  var maxGuests = Math.max(camp.during.weekend, camp.before.weekend, camp.after.weekend) * 1.1;

  function groupHtml(title, key) {
    return '<div class="a-group">' +
        '<div class="a-group-bars">' +
          ['before', 'during', 'after'].map(function (p) {
            var v = camp[p][key];
            return '<div class="a-gbar ' + p + '" style="height:' + Math.round(v / maxGuests * 100) + '%"><span>' + v + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="chart-label">' + title + '</div>' +
      '</div>';
  }

  host.innerHTML =
    '<div class="a-intro">' +
      '<p>Маркетинг считается одной формулой, но для неё нужно знать, <b>откуда пришёл каждый гость</b>. ' +
      'Каждая бронь через Orын это знает: у блогера, 2ГИС и листовок свои ссылки и QR-коды.</p>' +
      '<p class="a-formula">Цена гостя = расходы на канал ÷ гостей, которые пришли из этого канала</p>' +
    '</div>' +

    '<h3 class="a-h">Каналы за месяц</h3>' +
    tableHtml(['Канал', 'Потратили', 'Броней', 'Пришли', 'Гостей', 'Цена гостя', 'Вернулись', 'Итог', ''], chRows) +
    noteHtml('Итог = гости × ' + fmt(c.contribution) + ' ₸ (столько остаётся с гостя после продуктов, налога и расходников — ' +
      'из вкладки «Себестоимость») − расходы на канал. «Вернулись» — сколько гостей пришли ещё раз за месяц.') +

    '<div class="a-callout"><b>Делим только на тех, кто пришёл с рекламы.</b> ' + esc(first.name) + ' стоил ' +
      fmt(first.spend) + ' ₸ и привёл ' + first.guests + ' гостей: <b>' + fmt(first.spend / first.guests) + ' ₸</b> за гостя. ' +
      'Если разделить на всех ' + fmt(m.guests) + ' гостей месяца, получится ' + fmt(first.spend / m.guests) + ' ₸ — ' +
      'реклама будет казаться почти бесплатной, но это самообман.</div>' +

    '<h3 class="a-h">Эффект рекламы: сравнение периодов</h3>' +
    noteHtml(esc(camp.name) + '. Сравниваем среднее число гостей в день отдельно по будням и выходным: ' +
      'в месяце может быть 4 пятницы, а может 5.') +
    '<div class="a-two">' +
      '<div>' +
        '<div class="a-groups">' + groupHtml('Будни', 'weekday') + groupHtml('Выходные', 'weekend') + '</div>' +
        '<div class="a-legend"><span class="before">2 недели до</span><span class="during">2 недели с рекламой</span>' +
          '<span class="after">2 недели после</span></div>' +
      '</div>' +
      '<div>' +
        '<div class="a-sum">' +
          '<div><span>Прирост в будни</span><b>+' + (camp.during.weekday - camp.before.weekday) + ' × ' + camp.weekdays + ' дн = ' + incWeekday + '</b></div>' +
          '<div><span>Прирост в выходные</span><b>+' + (camp.during.weekend - camp.before.weekend) + ' × ' + camp.weekends + ' дн = ' + incWeekend + '</b></div>' +
          '<div><span>Дополнительных гостей</span><b>' + incremental + '</b></div>' +
          '<div><span>Из них по ссылкам и промокодам</span><b>' + camp.trackedGuests + '</b></div>' +
          '<div><span>Остаётся с них</span><b>' + fmt(incremental * c.contribution) + ' ₸</b></div>' +
          '<div><span>Минус реклама</span><b>−' + fmt(camp.spend) + ' ₸</b></div>' +
          '<div><span>Эффект</span><b class="' + (effect < 0 ? 'neg' : 'pos') + '">' + fmt(effect) + ' ₸</b></div>' +
        '</div>' +
        '<ul class="a-checks">' + camp.checks.map(function (ch) {
          return '<li class="' + (ch.ok ? 'ok' : 'bad') + '">' + esc(ch.text) + '</li>';
        }).join('') + '</ul>' +
      '</div>' +
    '</div>' +
    '<div class="a-callout"><b>Что видно.</b> По ссылкам пришли ' + camp.trackedGuests + ' гостей, а прирост — ' + incremental +
      '. Значит, реклама работает сильнее, чем видно по меткам: люди приходят и без ссылки, приводят друзей. ' +
      'После рекламы поток не упал до прежнего — часть гостей стали постоянными.</div>' +

    '<h3 class="a-h">Сколько гостей придёт: прогноз кампании</h3>' +
    noteHtml('Первая реклама — всегда тест. По её реальным цифрам меняйте доли, и прогноз станет точным.') +
    '<div class="a-two">' +
      '<div>' + tableHtml(['Шаг', 'Значение'], [
        ['Подписчиков у блогера', inputHtml('funnel.followers', DEMO.funnel.followers, 110)],
        ['Увидят сторис', inputHtml('funnel.seePct', DEMO.funnel.seePct, 70) + ' %'],
        ['Перейдут по ссылке', inputHtml('funnel.clickPct', DEMO.funnel.clickPct, 70) + ' %'],
        ['Забронируют', inputHtml('funnel.bookPct', DEMO.funnel.bookPct, 70) + ' %'],
        ['Придут по брони', inputHtml('funnel.comePct', DEMO.funnel.comePct, 70) + ' %'],
        ['Гостей в одной брони', inputHtml('funnel.perBooking', DEMO.funnel.perBooking, 70)],
        ['Бюджет', inputHtml('funnel.budget', DEMO.funnel.budget, 110) + ' ₸']
      ]) + '</div>' +
      '<div id="funnelOut"></div>' +
    '</div>' +

    '<h3 class="a-h">Как понять, что гость пришёл с рекламы</h3>' +
    '<ol class="a-list">' +
      '<li><b>Промокод с подарком</b> — самый надёжный: «Скажи КОКТЕМ — десерт в подарок». У гостя есть причина его назвать.</li>' +
      '<li><b>Своя ссылка и QR-код</b> у каждого канала — бронь через Orын запишет источник сама.</li>' +
      '<li><b>«Откуда узнали?»</b> в форме брони или вопрос официанта при расчёте.</li>' +
      '<li><b>Новый или постоянный:</b> номер из брони сверяем с базой — постоянного гостя привела не реклама.</li>' +
      '<li>Что не поймали метками — покажет <b>сравнение периодов</b> выше.</li>' +
    '</ol>';

  updateFunnel();
}

function updateFunnel() {
  var f = DEMO.funnel;
  var c = costModel();
  var see = f.followers * f.seePct / 100;
  var click = see * f.clickPct / 100;
  var book = click * f.bookPct / 100;
  var come = book * f.comePct / 100;
  var guests = come * f.perBooking;
  var perGuest = guests > 0 ? f.budget / guests : Infinity;
  var result = guests * c.contribution - f.budget;

  var steps = [
    ['Увидят', see], ['Перейдут', click], ['Забронируют', book], ['Придут броней', come]
  ];

  document.getElementById('funnelOut').innerHTML =
    '<div class="a-funnel">' + steps.map(function (s, i) {
      return '<div class="a-funnel-step" style="width:' + (100 - i * 16) + '%"><span>' + s[0] + '</span><b>' + fmt(s[1]) + '</b></div>';
    }).join('') + '</div>' +
    '<div class="a-sum">' +
      '<div><span>Ожидаем гостей</span><b>≈ ' + fmt(guests) + '</b></div>' +
      '<div><span>Цена гостя</span><b>' + (isFinite(perGuest) ? fmt(perGuest) + ' ₸' : '—') + '</b></div>' +
      '<div><span>Прогноз итога</span><b class="' + (result < 0 ? 'neg' : 'pos') + '">' + fmt(result) + ' ₸</b>' +
        '<small>без учёта повторных визитов</small></div>' +
    '</div>';
}


/* ----------------------------------------------------------------------------
   6. ПРОГНОЗ НА ЗАВТРА И ЗАКУПКА
   ---------------------------------------------------------------------------- */

var adRunning = false;   // включён ли переключатель «идёт реклама»

var ДНИ_НЕДЕЛИ = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

function renderForecast() {
  var host = document.getElementById('paneForecast');
  var f = DEMO.forecast;

  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var wd = tomorrow.getDay();
  var base = f.weekdayBase[wd];

  var past = f.lastFourShift.map(function (s) { return base + s; });
  var avg = past.reduce(function (a, b) { return a + b; }, 0) / past.length;
  var bookedGuests = Math.round(base * f.bookedNowShare);
  var byBookings = bookedGuests / f.bookedShare;
  var expected = Math.max(avg, byBookings) * (adRunning ? 1 + f.adUpliftPct / 100 : 1);
  expected = Math.round(expected);

  /* Порции по блюдам и сырьё на них */
  var need = {};
  var portionRows = DEMO.techCards.map(function (card) {
    var portions = Math.ceil(expected * card.share);
    rawUsage(card, portions, need);
    return [esc(card.dish), Math.round(card.share * 100) + '%', '<b>' + portions + '</b>'];
  });

  var orderRows = Object.keys(need).map(function (name) {
    var p = productByName(name);
    var keep = p ? p.keep : 'long';
    var stock = need[name] * f.stockShare[keep] * (0.6 + demoShare('stock' + name) * 0.8);
    var reserve = f.reserve[keep];
    var order = Math.max(0, need[name] * (1 + reserve / 100) - stock);
    return { name: name, need: need[name], stock: stock, reserve: reserve, order: order, keep: keep };
  }).sort(function (a, b) { return b.order - a.order; });

  host.innerHTML =
    '<div class="a-intro">' +
      '<p>Брони — это прогноз, который видно заранее. Вместе с прошлыми такими же днями они говорят, ' +
      'сколько гостей ждать завтра. А техкарты — сколько продуктов на них нужно.</p>' +
    '</div>' +

    '<div class="a-forecast-head">' +
      '<h3 class="a-h">Завтра, в ' + ДНИ_НЕДЕЛИ[wd] + ', ' +
        prettyDate(tomorrow.getFullYear() + '-' + (tomorrow.getMonth() + 1) + '-' + tomorrow.getDate()) + '</h3>' +
      '<label class="a-toggle"><input type="checkbox" id="adToggle"' + (adRunning ? ' checked' : '') + '>' +
        '<span>Идёт реклама (+' + f.adUpliftPct + '%)</span></label>' +
    '</div>' +

    '<div class="kpi-grid">' +
      '<div class="kpi kpi-main"><div class="kpi-label">Ожидаем гостей</div><div class="kpi-value">' + expected + '</div>' +
        '<div class="kpi-delta">берём большее из двух оценок' + (adRunning ? ' + реклама' : '') + '</div></div>' +
      '<div class="kpi"><div class="kpi-label">По 4 прошлым таким же дням</div><div class="kpi-value">' + Math.round(avg) + '</div>' +
        '<div class="kpi-delta">' + past.join(' · ') + '</div></div>' +
      '<div class="kpi"><div class="kpi-label">По броням</div><div class="kpi-value">' + Math.round(byBookings) + '</div>' +
        '<div class="kpi-delta">' + bookedGuests + ' гостей уже в бронях, обычно бронирует ' + Math.round(f.bookedShare * 100) + '%</div></div>' +
    '</div>' +

    '<div class="a-two">' +
      '<div>' +
        '<h3 class="a-h">Сколько порций</h3>' +
        noteHtml('Доля гостей, которые заказывают блюдо, — из продаж в кассе.') +
        tableHtml(['Блюдо', 'Заказывают', 'Порций'], portionRows) +
      '</div>' +
      '<div>' +
        '<h3 class="a-h">Запас</h3>' +
        '<ul class="a-list">' +
          '<li><b>Свежее</b> (мясо, зелень, сливки) — +' + f.reserve.fresh + '%: лучше заказывать чаще и меньше.</li>' +
          '<li><b>Долго хранится</b> (крупы, заморозка, сыр) — +' + f.reserve.long + '%: не испортится.</li>' +
          '<li><b>Соусы и нарезку</b> готовить партиями в течение дня.</li>' +
          '<li>Если всё же не хватило — блюдо уходит в <b>стоп-лист</b>, и гости видят это в меню на сайте.</li>' +
        '</ul>' +
      '</div>' +
    '</div>' +

    '<h3 class="a-h">Что заказать у поставщиков</h3>' +
    tableHtml(['Продукт', 'Нужно завтра', 'На складе', 'Запас', 'Заказать'],
      orderRows.map(function (r) {
        return [
          esc(r.name) + ' <span class="a-unit">' + (r.keep === 'fresh' ? 'свежее' : 'хранится') + '</span>',
          qtyText(r.name, r.need),
          qtyText(r.name, r.stock),
          '+' + r.reserve + '%',
          r.order > 0 ? '<b>' + qtyText(r.name, r.order) + '</b>' : tagHtml('ok', 'хватает')
        ];
      })) +
    noteHtml('В демо — продукты пяти блюд из техкарт. Когда подключим кассу и склад, прогноз будет по всему меню.');

  document.getElementById('adToggle').addEventListener('change', function (e) {
    adRunning = e.target.checked;
    renderForecast();
  });
}


/* ----------------------------------------------------------------------------
   7. ВКЛАДКИ И ПЕРЕСЧЁТ
   ---------------------------------------------------------------------------- */

var OWNER_TABS = [
  { id: 'overview',  title: 'Обзор' },
  { id: 'cost',      title: 'Себестоимость гостя' },
  { id: 'tech',      title: 'Техкарты' },
  { id: 'stock',     title: 'Склад' },
  { id: 'kitchen',   title: 'Кухня' },
  { id: 'marketing', title: 'Маркетинг' },
  { id: 'forecast',  title: 'Прогноз и закупка' }
];

function showOwnerTab(id) {
  if (!OWNER_TABS.some(function (t) { return t.id === id; })) id = 'overview';

  document.querySelectorAll('.owner-pane').forEach(function (pane) {
    pane.hidden = pane.getAttribute('data-pane') !== id;
  });
  document.querySelectorAll('#ownerTabs .filter-btn').forEach(function (b) {
    var on = b.getAttribute('data-tab') === id;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  /* Схема зала считает свой масштаб по ширине — пока вкладка была скрыта,
     ширина была нулевой. Просим пересчитать. */
  if (id === 'overview') window.dispatchEvent(new Event('resize'));

  /* Адрес вкладки в ссылке: owner.html#kitchen откроется сразу на кухне */
  if (history.replaceState) history.replaceState(null, '', id === 'overview' ? location.pathname + location.search : '#' + id);
}

function initOwnerAnalytics() {
  var tabs = document.getElementById('ownerTabs');
  tabs.innerHTML = OWNER_TABS.map(function (t) {
    return '<button type="button" class="filter-btn" role="tab" data-tab="' + t.id + '">' + esc(t.title) + '</button>';
  }).join('');

  tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tab]');
    if (!btn) return;
    showOwnerTab(btn.getAttribute('data-tab'));
    btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });

  renderCost();
  renderTech();
  renderStock();
  renderKitchen();
  renderMarketing();
  renderForecast();

  /* Любое поле ввода: записываем число в DEMO и пересчитываем то, что от него зависит */
  document.addEventListener('input', function (e) {
    var path = e.target.getAttribute && e.target.getAttribute('data-path');
    if (!path) return;
    var value = parseFloat(String(e.target.value).replace(',', '.'));
    if (!isFinite(value) || value < 0) return;   // пустое поле — ждём, пока допишут
    setByPath(path, value);

    var group = path.split('.')[0];
    if (group === 'funnel') { updateFunnel(); return; }

    if (group === 'products') {
      updateTech();          // поля цен не перерисовываем — курсор остаётся на месте
      renderStock();
      return;
    }

    /* Счётчики, расходники, расходы, гости — влияет на всё остальное */
    updateCost();
    updateTech();
    renderStock();
    renderMarketing();
    renderForecast();
  });

  /* Переключение блюда в техкартах */
  document.getElementById('paneTech').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tech]');
    if (!btn) return;
    techIndex = Number(btn.getAttribute('data-tech'));
    document.querySelectorAll('#techChips .filter-btn').forEach(function (b, i) {
      b.classList.toggle('active', i === techIndex);
    });
    updateTech();
  });

  showOwnerTab(location.hash.replace('#', '') || 'overview');
}

initOwnerAnalytics();
