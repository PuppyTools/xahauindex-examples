/* XahauIndex token platform.
   Static page for https://xahauindex.dev. No API key.
   One request per page, pair, or period. Results stay in memory for this tab.
   The public node allows 60 calls a minute; this page stays under that. */
(function () {
  'use strict';

  var API = 'https://xahauindex.dev';
  var PAGE_SIZE = 12;
  var TAPE_PAGE_SIZE = 250;
  var MAX_CALLS = 50;
  var CANDLE_LIMIT = { '1h': 72, '24h': 90, '7d': 52 };
  var SORTS = { holder_count: 'Holders', trust_count: 'Trust lines', first_ledger: 'First ledger' };

  var cache = new Map();
  var callTimes = [];
  var queue = Promise.resolve();
  var renderGen = 0;
  var lastList = '#/';

  function enqueue(task) {
    var run = queue.then(task, task);
    queue = run.then(
      function () {},
      function () {},
    );
    return run;
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function throttle() {
    for (;;) {
      var now = Date.now();
      while (callTimes.length && now - callTimes[0] >= 60000) callTimes.shift();
      if (callTimes.length < MAX_CALLS) {
        callTimes.push(now);
        return;
      }
      await wait(60000 - (now - callTimes[0]) + 40);
    }
  }

  function apiGet(path) {
    var hit = cache.get(path);
    if (hit) return Promise.resolve(hit);
    return enqueue(async function () {
      var again = cache.get(path);
      if (again) return again;
      await throttle();
      var response = await fetch(API + path, { headers: { Accept: 'application/json' } });
      var body = null;
      try {
        body = await response.json();
      } catch (error) {
        body = null;
      }
      if (!response.ok) {
        var message = body && body.error && body.error.message ? body.error.message : 'HTTP ' + response.status;
        throw new Error(message);
      }
      cache.set(path, body);
      return body;
    });
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeHttpUrl(raw) {
    if (!raw) return '';
    try {
      var url = new URL(raw);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch (error) {
      return '';
    }
    return '';
  }

  function iconUrl(raw) {
    if (!raw) return '';
    if (raw.indexOf('ipfs://') === 0) {
      var path = raw.slice(7).replace(/^ipfs\//, '');
      if (!path || /[\s#?]/.test(path)) return '';
      return 'https://ipfs.io/ipfs/' + path;
    }
    return safeHttpUrl(raw);
  }

  function siteHost(raw) {
    var safe = safeHttpUrl(raw);
    if (!safe) return '';
    try {
      return new URL(safe).host;
    } catch (error) {
      return '';
    }
  }

  function domainHref(domain) {
    if (!domain) return '';
    var direct = safeHttpUrl(domain);
    if (direct) return direct;
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return 'https://' + domain;
    return '';
  }

  function letter(currency) {
    var text = String(currency || '?').replace(/[^A-Za-z0-9]/g, '');
    return (text || '?').slice(0, 2).toUpperCase();
  }

  function avatarHtml(currency, icon) {
    var mark = letter(currency);
    var src = iconUrl(icon);
    if (!src) return '<span class="avatar" aria-hidden="true">' + esc(mark) + '</span>';
    return (
      '<span class="avatar" data-letter="' +
      esc(mark) +
      '" aria-hidden="true"><img alt="" src="' +
      esc(src) +
      '" /></span>'
    );
  }

  function shortAccount(account) {
    if (!account || account.length <= 14) return account || '';
    return account.slice(0, 6) + '…' + account.slice(-4);
  }

  function formatAmount(raw, places) {
    if (raw == null || raw === '') return '—';
    var text = String(raw);
    if (/e/i.test(text)) return text;
    var negative = text.charAt(0) === '-';
    var unsigned = negative ? text.slice(1) : text;
    var parts = unsigned.split('.');
    if (!/^\d+$/.test(parts[0] || '')) return text;
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var limit = places == null ? 4 : places;
    var frac = (parts[1] || '').slice(0, limit).replace(/0+$/, '');
    var body = frac ? whole + '.' + frac : whole;
    return negative ? '-' + body : body;
  }

  function formatCount(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return number.toLocaleString('en-US');
  }

  function formatPrice(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    var abs = Math.abs(value);
    var digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 8;
    return value.toLocaleString('en-US', {
      maximumFractionDigits: digits,
      minimumFractionDigits: Math.min(2, digits),
    });
  }

  function formatChange(ratio) {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return { text: '—', dir: 'flat' };
    var pct = ratio * 100;
    var dir = pct > 0.0005 ? 'up' : pct < -0.0005 ? 'down' : 'flat';
    var sign = pct > 0 ? '+' : '';
    return { text: sign + pct.toFixed(2) + '%', dir: dir };
  }

  function formatCandleTime(unix, period) {
    var date = new Date(unix * 1000);
    if (Number.isNaN(date.getTime())) return '';
    if (period === '1h') {
      return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function transferLabel(rate) {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return '';
    if (rate >= 1000000000) {
      var pct = ((rate - 1000000000) / 1000000000) * 100;
      var text = pct.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
      return text + '% fee';
    }
    return String(rate);
  }

  function sideKey(side) {
    return side.currency + '\0' + (side.issuer || '');
  }

  // Stored order is a string compare of currency and issuer. The smaller side is base.
  // Price is how much counter you get for 1 base, including the token detail XAH pair.
  function canonicalPair(a, b) {
    if (sideKey(a) > sideKey(b)) return { base: b, counter: a };
    return { base: a, counter: b };
  }

  function isNativeXah(side) {
    return side.currency === 'XAH' && !side.issuer;
  }

  function isXahPair(pair) {
    return isNativeXah(pair.base) || isNativeXah(pair.counter);
  }

  function pairFromTrade(trade) {
    return {
      base: { currency: trade.base_currency, issuer: trade.base_issuer || null },
      counter: { currency: trade.counter_currency, issuer: trade.counter_issuer || null },
    };
  }

  function pairId(pair) {
    return [pair.base.currency, pair.base.issuer || '', pair.counter.currency, pair.counter.issuer || ''].join('|');
  }

  function sideLabel(side) {
    if (!side.issuer) return side.currency;
    return side.currency + ' · ' + shortAccount(side.issuer);
  }

  function pairHeading(pair) {
    return pair.base.currency + '/' + pair.counter.currency;
  }

  function priceCaption(pair) {
    var text = pair.counter.currency + ' per 1 ' + pair.base.currency;
    var notes = [];
    if (pair.base.issuer) notes.push(pair.base.currency + ' ' + shortAccount(pair.base.issuer));
    if (pair.counter.issuer) notes.push(pair.counter.currency + ' ' + shortAccount(pair.counter.issuer));
    if (notes.length) text += ' · ' + notes.join(' · ');
    return text;
  }

  function otherSide(pair, token) {
    var baseMatch = pair.base.currency === token.currency && (pair.base.issuer || '') === (token.issuer || '');
    return baseMatch ? pair.counter : pair.base;
  }

  function decodePart(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function parseRoute() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw || raw === '/') raw = '/';
    if (raw.charAt(0) !== '/') raw = '/' + raw;
    var splitAt = raw.indexOf('?');
    var path = splitAt === -1 ? raw : raw.slice(0, splitAt);
    var query = splitAt === -1 ? '' : raw.slice(splitAt + 1);
    var params = new URLSearchParams(query);
    var parts = path.split('/').filter(Boolean);
    if (parts[0] === 'token' && parts[1] && parts[2]) {
      return { name: 'token', currency: decodePart(parts[1]), issuer: decodePart(parts[2]) };
    }
    var page = Number.parseInt(params.get('page') || '1', 10);
    var sort = params.get('sort') || 'holder_count';
    if (!SORTS[sort]) sort = 'holder_count';
    return {
      name: 'list',
      page: Number.isInteger(page) && page > 0 ? page : 1,
      q: (params.get('q') || '').trim().slice(0, 64),
      verified: params.get('verified') === '1',
      sort: sort,
    };
  }

  function listHash(state) {
    var params = new URLSearchParams();
    if (state.page > 1) params.set('page', String(state.page));
    if (state.q) params.set('q', state.q);
    if (state.verified) params.set('verified', '1');
    if (state.sort && state.sort !== 'holder_count') params.set('sort', state.sort);
    var qs = params.toString();
    return '#/' + (qs ? '?' + qs : '');
  }

  function tokenHash(currency, issuer) {
    return '#/token/' + encodeURIComponent(currency) + '/' + encodeURIComponent(issuer);
  }

  function navigate(hash) {
    if ((location.hash || '#/') === hash) return;
    location.hash = hash;
  }

  function tokenListPath(route) {
    var params = new URLSearchParams();
    params.set('page', String(route.page));
    params.set('per_page', String(PAGE_SIZE));
    params.set('sort', route.sort);
    if (route.q) params.set('q', route.q);
    if (route.verified) params.set('domain_verified', 'true');
    return '/v1/tokens?' + params.toString();
  }

  function tokenPath(currency, issuer) {
    return '/v1/tokens/' + encodeURIComponent(currency) + '/' + encodeURIComponent(issuer);
  }

  function tradesPath(currency, issuer, page) {
    var params = new URLSearchParams();
    params.set('issuer', issuer);
    // per_page is applied only when page is set.
    params.set('page', String(page));
    params.set('per_page', String(TAPE_PAGE_SIZE));
    return '/v1/trades/' + encodeURIComponent(currency) + '?' + params.toString();
  }

  function candlesPath(pair, period) {
    var params = new URLSearchParams();
    params.set('period', period);
    params.set('limit', String(CANDLE_LIMIT[period] || 72));
    if (pair.base.issuer) params.set('base_issuer', pair.base.issuer);
    if (pair.counter.issuer) params.set('counter_issuer', pair.counter.issuer);
    return (
      '/v1/prices/' +
      encodeURIComponent(pair.base.currency) +
      '/' +
      encodeURIComponent(pair.counter.currency) +
      '?' +
      params.toString()
    );
  }

  function sortOptions(selected) {
    return Object.keys(SORTS)
      .map(function (key) {
        return (
          '<option value="' +
          esc(key) +
          '"' +
          (key === selected ? ' selected' : '') +
          '>' +
          esc(SORTS[key]) +
          '</option>'
        );
      })
      .join('');
  }

  function pagerHtml(route, meta, rowCount) {
    var page = meta.page || route.page;
    var perPage = meta.per_page || PAGE_SIZE;
    var hasCount = typeof meta.count === 'number';
    var count = hasCount ? meta.count : rowCount;
    var pageCount = Math.max(1, Math.ceil(count / perPage) || 1);
    var from = count === 0 || rowCount === 0 ? 0 : (page - 1) * perPage + 1;
    var to = rowCount === 0 ? 0 : Math.min(hasCount ? count : (page - 1) * perPage + rowCount, (page - 1) * perPage + rowCount);
    var nextOff = hasCount ? page >= pageCount : rowCount < perPage;
    var status = count === 0 ? '0 tokens' : from + '–' + to + ' of ' + formatCount(count);
    return (
      '<div class="pager">' +
      (page <= 1
        ? '<span class="btn" aria-disabled="true">Previous</span>'
        : '<a class="btn" href="' + esc(listHash(Object.assign({}, route, { page: page - 1 }))) + '">Previous</a>') +
      '<span class="pager-status">' + esc(status) + '</span>' +
      (nextOff
        ? '<span class="btn" aria-disabled="true">Next</span>'
        : '<a class="btn" href="' + esc(listHash(Object.assign({}, route, { page: page + 1 }))) + '">Next</a>') +
      '</div>'
    );
  }

  function renderList(route, gen) {
    lastList = location.hash || '#/';
    document.title = 'XahauIndex — Token platform';
    var main = document.getElementById('main');
    main.innerHTML =
      '<section class="hero">' +
      '<p class="kicker">Token directory</p>' +
      '<h2>Tokens</h2>' +
      '<p class="lede">IOUs from the public XahauIndex API. Each page is a separate request.</p>' +
      '</section>' +
      '<form class="filters" id="filters">' +
      '<label>Search<input type="search" name="q" value="' +
      esc(route.q) +
      '" placeholder="Name or currency" autocomplete="off" /></label>' +
      '<label>Sort<select name="sort">' +
      sortOptions(route.sort) +
      '</select></label>' +
      '<label class="check"><input type="checkbox" name="verified"' +
      (route.verified ? ' checked' : '') +
      ' />Verified domain</label>' +
      '<button class="primary" type="submit">Search</button>' +
      '</form>' +
      '<div id="results" aria-live="polite"><p class="message">Loading tokens…</p></div>';

    var form = document.getElementById('filters');
    function applyFilters() {
      var data = new FormData(form);
      navigate(
        listHash({
          page: 1,
          q: String(data.get('q') || '').trim(),
          verified: data.get('verified') === 'on',
          sort: String(data.get('sort') || 'holder_count'),
        }),
      );
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      applyFilters();
    });
    form.querySelector('select').addEventListener('change', applyFilters);
    form.querySelector('input[type="checkbox"]').addEventListener('change', applyFilters);

    apiGet(tokenListPath(route))
      .then(function (env) {
        if (gen !== renderGen) return;
        paintTokens(route, env || {});
      })
      .catch(function (error) {
        if (gen !== renderGen) return;
        var results = document.getElementById('results');
        if (results) results.innerHTML = '<p class="message error">' + esc(error.message) + '</p>';
      });
  }

  function paintTokens(route, env) {
    var results = document.getElementById('results');
    if (!results) return;
    var rows = Array.isArray(env.data) ? env.data : [];
    var meta = env.meta || {};
    var cards = rows
      .map(function (token) {
        var title = token.name || token.currency;
        var subtitle = token.name ? token.currency : siteHost(token.website_url) || shortAccount(token.issuer);
        var pills = '';
        if (token.domain_verified) pills += '<span class="pill ok">Verified</span>';
        if (token.blackholed) pills += '<span class="pill">Blackholed</span>';
        return (
          '<a class="token" href="' +
          esc(tokenHash(token.currency, token.issuer)) +
          '">' +
          avatarHtml(token.currency, token.icon_url) +
          '<span class="who"><strong>' +
          esc(title) +
          '</strong><small>' +
          esc(subtitle) +
          '</small>' +
          (pills ? '<span class="pills">' + pills + '</span>' : '') +
          '</span><span class="holders"><strong>' +
          esc(formatCount(token.holder_count)) +
          '</strong><small>holders</small></span></a>'
        );
      })
      .join('');
    var empty = rows.length
      ? ''
      : '<p class="message">' +
        (route.page > 1 ? 'No tokens on this page.' : 'No tokens match this search.') +
        '</p>';
    var pager = pagerHtml(route, meta, rows.length);
    results.innerHTML = pager + empty + '<div class="grid">' + cards + '</div>' + (rows.length ? pager : '');
  }

  function linkList(token) {
    var seen = new Set();
    var links = [];
    function add(url, title) {
      var safe = safeHttpUrl(url);
      if (!safe || seen.has(safe)) return;
      seen.add(safe);
      links.push({ url: safe, title: title || siteHost(safe) || 'Link' });
    }
    add(token.website_url, 'Website');
    (token.toml_links || []).forEach(function (link) {
      add(link.url, link.title || link.type || 'Link');
    });
    var profile = token.issuer_profile;
    if (profile) {
      (profile.toml_links || []).forEach(function (link) {
        add(link.url, link.title || link.type || 'Link');
      });
    }
    return links;
  }

  function statHtml(label, value, extraClass) {
    return (
      '<div class="stat' +
      (extraClass ? ' ' + extraClass : '') +
      '"><span>' +
      esc(label) +
      '</span><strong>' +
      value +
      '</strong></div>'
    );
  }

  function renderDetail(route, gen) {
    document.title = route.currency + ' — XahauIndex';
    var main = document.getElementById('main');
    var view = {
      pairs: [],
      seen: new Map(),
      tapePage: 0,
      tapeCount: 0,
      activeId: '',
      period: '1h',
      currency: route.currency,
      issuer: route.issuer,
      chartSeq: 0,
    };

    main.innerHTML =
      '<a class="back" href="' +
      esc(lastList) +
      '">← Tokens</a>' +
      '<div id="head"><p class="message">Loading token…</p></div>' +
      '<div id="market" class="market" aria-live="polite"></div>';

    var market = document.getElementById('market');
    market.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var tab = target.closest('[data-pair]');
      if (tab) {
        var id = tab.getAttribute('data-pair');
        if (id && id !== view.activeId) {
          view.activeId = id;
          syncTabs();
          updateHeading();
          loadCandles();
        }
        return;
      }
      var periodBtn = target.closest('[data-period]');
      if (periodBtn) {
        var period = periodBtn.getAttribute('data-period');
        if (period && period !== view.period && CANDLE_LIMIT[period]) {
          view.period = period;
          syncPeriods();
          loadCandles();
        }
        return;
      }
      if (target.closest('#more-pairs')) {
        var button = target.closest('#more-pairs');
        button.disabled = true;
        loadTape(view.tapePage + 1);
      }
    });

    apiGet(tokenPath(route.currency, route.issuer))
      .then(function (env) {
        if (gen !== renderGen) return;
        paintHead((env && env.data) || {});
        var note = document.getElementById('market');
        if (note && !note.querySelector('.chart-card')) {
          note.innerHTML = '<p class="message">Loading traded pairs…</p>';
        }
        return loadTape(1);
      })
      .catch(function (error) {
        if (gen !== renderGen) return;
        main.innerHTML =
          '<a class="back" href="' +
          esc(lastList) +
          '">← Tokens</a><p class="message error">' +
          esc(error.message) +
          '</p>';
      });

    function paintHead(token) {
      var head = document.getElementById('head');
      if (!head) return;
      var profile = token.issuer_profile || null;
      var named = token.name || (profile && profile.toml_name) || '';
      var blurb = token.description || (profile && profile.toml_description) || '';
      var domain = profile && profile.domain ? profile.domain : '';
      var domainUrl = domainHref(domain);
      var pills = '';
      if (token.domain_verified) pills += '<span class="pill ok">Verified</span>';
      if (token.blackholed) pills += '<span class="pill">Blackholed</span>';
      var links = linkList(token)
        .map(function (link) {
          return (
            '<a href="' +
            esc(link.url) +
            '" target="_blank" rel="noreferrer">' +
            esc(link.title) +
            '</a>'
          );
        })
        .join('');
      var stored = canonicalPair(
        { currency: token.currency, issuer: token.issuer },
        { currency: 'XAH', issuer: null },
      );
      var price = token.price || null;
      var change = formatChange(price ? price.change_24h : null);
      var stats = '';
      if (price) {
        stats += statHtml('Price', esc(formatPrice(price.price)));
        stats += statHtml('24h change', '<span class="' + change.dir + '">' + esc(change.text) + '</span>');
        stats += statHtml('24h high', esc(formatPrice(price.high_24h)));
        stats += statHtml('24h low', esc(formatPrice(price.low_24h)));
        stats += statHtml('24h volume · ' + stored.base.currency, esc(formatAmount(price.volume_24h)));
      } else {
        stats += statHtml('Price', 'No trades');
      }
      stats += statHtml('Holders', esc(formatCount(token.holder_count)));
      stats += statHtml('Trust lines', esc(formatCount(token.trust_count)));
      stats += statHtml('Supply', esc(formatAmount(token.supply, 2)), 'wide');
      var fee = profile ? transferLabel(profile.transfer_rate) : '';
      if (fee) stats += statHtml('Transfer rate', esc(fee));
      var remarks = token.remarks || {};
      var remarkKeys = Object.keys(remarks).sort();
      var remarkHtml = '';
      if (remarkKeys.length) {
        remarkHtml =
          '<dl class="remarks">' +
          remarkKeys
            .map(function (key) {
              return '<div><dt>' + esc(key) + '</dt><dd>' + esc(remarks[key]) + '</dd></div>';
            })
            .join('') +
          '</dl>';
      }
      head.className = '';
      head.innerHTML =
        '<div class="identity">' +
        avatarHtml(token.currency, token.icon_url || (profile && profile.toml_icon_url)) +
        '<div><p class="kicker">' +
        esc(named ? token.currency : 'Token') +
        '</p><h2>' +
        esc(named || token.currency) +
        '</h2><p class="issuer"><code>' +
        esc(token.issuer || route.issuer) +
        '</code></p>' +
        (domain
          ? '<p class="sub">' +
            (domainUrl
              ? '<a href="' + esc(domainUrl) + '" target="_blank" rel="noreferrer">' + esc(domain) + '</a>'
              : esc(domain)) +
            '</p>'
          : '') +
        (blurb ? '<p class="blurb">' + esc(blurb) + '</p>' : '') +
        (pills ? '<p class="pills">' + pills + '</p>' : '') +
        (links ? '<div class="links">' + links + '</div>' : '') +
        '</div></div>' +
        '<div class="xah-block"><p class="section-label">XAH pair</p><p class="sub">' +
        esc(priceCaption(stored)) +
        '</p><div class="stats">' +
        stats +
        '</div></div>' +
        remarkHtml;
    }

    function activePair() {
      return view.seen.get(view.activeId) || null;
    }

    function tapeNote() {
      var checked = Math.min(view.tapeCount, view.tapePage * TAPE_PAGE_SIZE);
      if (!view.tapeCount) return 'No trades checked yet';
      if (view.tapeCount > checked) {
        return formatCount(checked) + ' of ' + formatCount(view.tapeCount) + ' recent trades checked';
      }
      return formatCount(view.tapeCount) + ' trades checked';
    }

    function moreHtml() {
      var checked = view.tapePage * TAPE_PAGE_SIZE;
      if (view.tapeCount <= checked) return '';
      return '<button type="button" class="ghost" id="more-pairs">Check older trades</button>';
    }

    function tabsHtml() {
      var token = { currency: view.currency, issuer: view.issuer };
      var buttons = view.pairs
        .map(function (pair) {
          var id = pairId(pair);
          var other = otherSide(pair, token);
          return (
            '<button type="button" role="tab" data-pair="' +
            esc(id) +
            '" aria-selected="' +
            (id === view.activeId ? 'true' : 'false') +
            '" title="' +
            esc(pairHeading(pair)) +
            '">' +
            esc(sideLabel(other)) +
            '</button>'
          );
        })
        .join('');
      return (
        '<div class="tabs" id="tabs" role="tablist">' +
        buttons +
        '</div><p class="tape-note" id="tape-note">' +
        esc(tapeNote()) +
        '</p>' +
        moreHtml()
      );
    }

    function chartHtml() {
      return (
        '<section class="chart-card">' +
        '<div class="chart-head"><div><h3 id="chart-title">Chart</h3><p class="sub" id="chart-caption"></p></div>' +
        '<div class="periods" role="group" aria-label="Candle period">' +
        periodButton('1h', '1 hour') +
        periodButton('24h', '1 day') +
        periodButton('7d', '1 week') +
        '</div></div>' +
        '<p class="readout" id="readout"></p>' +
        '<div id="chart"><p class="empty">Loading candles…</p></div>' +
        '</section>'
      );
    }

    function periodButton(period, label) {
      return (
        '<button type="button" data-period="' +
        period +
        '" aria-label="' +
        label +
        ' candles" aria-selected="' +
        (view.period === period ? 'true' : 'false') +
        '">' +
        period +
        '</button>'
      );
    }

    function syncTabs() {
      var tabs = document.getElementById('tabs');
      if (!tabs) return;
      var buttons = tabs.querySelectorAll('[data-pair]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-selected', buttons[i].getAttribute('data-pair') === view.activeId ? 'true' : 'false');
      }
    }

    function syncPeriods() {
      var buttons = document.querySelectorAll('.periods [data-period]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-selected', buttons[i].getAttribute('data-period') === view.period ? 'true' : 'false');
      }
    }

    function updateHeading() {
      var pair = activePair();
      var title = document.getElementById('chart-title');
      var caption = document.getElementById('chart-caption');
      if (!pair || !title || !caption) return;
      title.textContent = pairHeading(pair);
      caption.textContent = priceCaption(pair);
    }

    function rememberTrades(trades) {
      var added = false;
      (trades || []).forEach(function (trade) {
        var pair = pairFromTrade(trade);
        var id = pairId(pair);
        if (!view.seen.has(id)) {
          view.seen.set(id, pair);
          added = true;
        }
      });
      if (!added && view.pairs.length) return;
      view.pairs = Array.from(view.seen.values());
      view.pairs.sort(function (a, b) {
        return Number(isXahPair(b)) - Number(isXahPair(a));
      });
    }

    function paintTape(firstPaint) {
      var host = document.getElementById('market');
      if (!host) return;
      if (!view.pairs.length) {
        host.innerHTML = '<p class="message">No trades indexed for this token yet.</p>' + moreHtml();
        return;
      }
      if (!view.activeId) {
        var preferred = null;
        for (var i = 0; i < view.pairs.length; i++) {
          if (isXahPair(view.pairs[i])) {
            preferred = view.pairs[i];
            break;
          }
        }
        view.activeId = pairId(preferred || view.pairs[0]);
      }
      if (!document.getElementById('chart')) {
        host.innerHTML = tabsHtml() + chartHtml();
        updateHeading();
        if (firstPaint) loadCandles();
        return;
      }
      var tabs = document.getElementById('tabs');
      var note = document.getElementById('tape-note');
      var existingMore = document.getElementById('more-pairs');
      if (tabs) {
        var token = { currency: view.currency, issuer: view.issuer };
        tabs.innerHTML = view.pairs
          .map(function (pair) {
            var id = pairId(pair);
            return (
              '<button type="button" role="tab" data-pair="' +
              esc(id) +
              '" aria-selected="' +
              (id === view.activeId ? 'true' : 'false') +
              '" title="' +
              esc(pairHeading(pair)) +
              '">' +
              esc(sideLabel(otherSide(pair, token))) +
              '</button>'
            );
          })
          .join('');
      }
      if (note) note.textContent = tapeNote();
      if (existingMore) existingMore.remove();
      var html = moreHtml();
      if (html && note) note.insertAdjacentHTML('afterend', html);
    }

    function loadTape(page) {
      return apiGet(tradesPath(view.currency, view.issuer, page))
        .then(function (env) {
          if (gen !== renderGen) return;
          var meta = (env && env.meta) || {};
          view.tapePage = page;
          view.tapeCount = typeof meta.count === 'number' ? meta.count : (env.data || []).length;
          rememberTrades(env.data || []);
          paintTape(page === 1);
        })
        .catch(function (error) {
          if (gen !== renderGen) return;
          var host = document.getElementById('market');
          if (!host) return;
          if (!document.getElementById('chart')) {
            host.innerHTML = '<p class="message error">' + esc(error.message) + '</p>';
            return;
          }
          var note = document.getElementById('tape-note');
          if (note) note.textContent = error.message;
          var button = document.getElementById('more-pairs');
          if (button) button.disabled = false;
        });
    }

    function setChartMessage(message) {
      var host = document.getElementById('chart');
      var readout = document.getElementById('readout');
      if (readout) readout.textContent = '';
      if (!host) return;
      host.innerHTML = '<p class="empty">' + esc(message) + '</p>';
    }

    function loadCandles() {
      var pair = activePair();
      if (!pair) return;
      var seq = ++view.chartSeq;
      var period = view.period;
      var path = candlesPath(pair, period);
      if (!cache.has(path)) setChartMessage('Loading candles…');
      apiGet(path)
        .then(function (env) {
          if (gen !== renderGen || seq !== view.chartSeq) return;
          drawChart(document.getElementById('chart'), (env && env.data) || [], period);
        })
        .catch(function (error) {
          if (gen !== renderGen || seq !== view.chartSeq) return;
          setChartMessage(error.message);
        });
    }
  }

  function paintReadout(candle, period) {
    var el = document.getElementById('readout');
    if (!el || !candle) return;
    el.textContent = [
      formatCandleTime(candle.open_time, period),
      'O ' + formatPrice(candle.open),
      'H ' + formatPrice(candle.high),
      'L ' + formatPrice(candle.low),
      'C ' + formatPrice(candle.close),
      'Vol ' + formatAmount(candle.volume),
      formatCount(candle.trade_count) + ' trades',
    ].join('   ·   ');
  }

  function drawChart(host, candles, period) {
    if (!host) return;
    host.replaceChildren();
    var rows = (candles || [])
      .filter(function (candle) {
        return (
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close)
        );
      })
      .slice()
      .sort(function (a, b) {
        return a.open_time - b.open_time;
      });
    if (!rows.length) {
      host.innerHTML = '<p class="empty">No candles for this pair and period.</p>';
      var emptyReadout = document.getElementById('readout');
      if (emptyReadout) emptyReadout.textContent = '';
      return;
    }

    var width = 800;
    var height = 390;
    var pad = { l: 88, r: 16, t: 16, b: 32 };
    var volumeH = 64;
    var gap = 14;
    var priceH = height - pad.t - pad.b - volumeH - gap;
    var min = Infinity;
    var max = -Infinity;
    var maxVol = 0;
    rows.forEach(function (candle) {
      min = Math.min(min, candle.low, candle.open, candle.close);
      max = Math.max(max, candle.high, candle.open, candle.close);
      var vol = Number(candle.volume);
      if (Number.isFinite(vol)) maxVol = Math.max(maxVol, vol);
    });
    if (min === max) {
      var bump = min === 0 ? 1 : Math.abs(min) * 0.08;
      min -= bump;
      max += bump;
    } else {
      var yPad = (max - min) * 0.08;
      min -= yPad;
      max += yPad;
    }

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Open, high, low, close, and volume');

    function yPrice(value) {
      return pad.t + ((max - value) / (max - min)) * priceH;
    }
    function yVol(value) {
      var top = pad.t + priceH + gap + volumeH;
      if (maxVol <= 0) return top;
      return top - (value / maxVol) * volumeH;
    }

    var plotW = width - pad.l - pad.r;
    var slot = rows.length === 1 ? 36 : plotW / rows.length;
    var origin = rows.length === 1 ? pad.l + (plotW - slot) / 2 : pad.l;
    var bodyW = Math.max(3, Math.min(16, slot * 0.62));

    for (var tick = 0; tick < 4; tick++) {
      var value = max - ((max - min) * tick) / 3;
      var y = yPrice(value);
      var grid = document.createElementNS(svgNS, 'line');
      grid.setAttribute('x1', String(pad.l));
      grid.setAttribute('x2', String(width - pad.r));
      grid.setAttribute('y1', String(y));
      grid.setAttribute('y2', String(y));
      grid.setAttribute('stroke', 'rgba(46, 230, 166, 0.14)');
      svg.appendChild(grid);
      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', String(pad.l - 8));
      label.setAttribute('y', String(y + 4));
      label.setAttribute('text-anchor', 'end');
      label.textContent = formatPrice(value);
      svg.appendChild(label);
    }

    var volumeBase = pad.t + priceH + gap + volumeH;
    var baseLine = document.createElementNS(svgNS, 'line');
    baseLine.setAttribute('x1', String(pad.l));
    baseLine.setAttribute('x2', String(width - pad.r));
    baseLine.setAttribute('y1', String(volumeBase));
    baseLine.setAttribute('y2', String(volumeBase));
    baseLine.setAttribute('stroke', 'rgba(46, 230, 166, 0.14)');
    svg.appendChild(baseLine);

    var guide = document.createElementNS(svgNS, 'line');
    guide.setAttribute('y1', String(pad.t));
    guide.setAttribute('y2', String(volumeBase));
    guide.setAttribute('stroke', 'rgba(232, 247, 240, 0.35)');
    guide.setAttribute('visibility', 'hidden');
    svg.appendChild(guide);

    rows.forEach(function (candle, index) {
      var cx = origin + slot * index + slot / 2;
      var up = candle.close >= candle.open;
      var color = up ? '#2ee6a6' : '#ff7a88';
      var wick = document.createElementNS(svgNS, 'line');
      wick.setAttribute('x1', String(cx));
      wick.setAttribute('x2', String(cx));
      wick.setAttribute('y1', String(yPrice(candle.high)));
      wick.setAttribute('y2', String(yPrice(candle.low)));
      wick.setAttribute('stroke', color);
      wick.setAttribute('stroke-width', '1.5');
      svg.appendChild(wick);
      var openY = yPrice(candle.open);
      var closeY = yPrice(candle.close);
      var bodyH = Math.max(4, Math.abs(closeY - openY));
      var body = document.createElementNS(svgNS, 'rect');
      body.setAttribute('x', String(cx - bodyW / 2));
      body.setAttribute('y', String((openY + closeY) / 2 - bodyH / 2));
      body.setAttribute('width', String(bodyW));
      body.setAttribute('height', String(bodyH));
      body.setAttribute('fill', color);
      body.setAttribute('rx', '1');
      svg.appendChild(body);
      var vol = Number(candle.volume);
      if (Number.isFinite(vol) && vol > 0) {
        var vy = yVol(vol);
        var bar = document.createElementNS(svgNS, 'rect');
        bar.setAttribute('x', String(cx - bodyW / 2));
        bar.setAttribute('y', String(vy));
        bar.setAttribute('width', String(bodyW));
        bar.setAttribute('height', String(Math.max(1, volumeBase - vy)));
        bar.setAttribute('fill', color);
        bar.setAttribute('opacity', '0.45');
        svg.appendChild(bar);
      }
    });

    var labelAt = {};
    [0, Math.floor((rows.length - 1) / 2), rows.length - 1].forEach(function (index) {
      labelAt[index] = true;
    });
    Object.keys(labelAt).forEach(function (key) {
      var index = Number(key);
      var cx = origin + slot * index + slot / 2;
      var text = document.createElementNS(svgNS, 'text');
      text.setAttribute('y', String(height - 8));
      text.textContent = formatCandleTime(rows[index].open_time, period);
      if (index === 0) {
        text.setAttribute('x', String(Math.max(pad.l, cx - bodyW)));
        text.setAttribute('text-anchor', 'start');
      } else if (index === rows.length - 1 && rows.length > 1) {
        text.setAttribute('x', String(Math.min(width - pad.r, cx + bodyW)));
        text.setAttribute('text-anchor', 'end');
      } else {
        text.setAttribute('x', String(cx));
        text.setAttribute('text-anchor', 'middle');
      }
      svg.appendChild(text);
    });

    host.appendChild(svg);
    function show(index) {
      var candle = rows[Math.max(0, Math.min(rows.length - 1, index))];
      paintReadout(candle, period);
      var cx = origin + slot * index + slot / 2;
      guide.setAttribute('x1', String(cx));
      guide.setAttribute('x2', String(cx));
    }
    show(rows.length - 1);
    guide.setAttribute('visibility', 'hidden');
    svg.addEventListener('pointermove', function (event) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      var x = ((event.clientX - rect.left) / rect.width) * width;
      var index = Math.floor((x - origin) / slot);
      if (index < 0 || index >= rows.length) return;
      guide.setAttribute('visibility', 'visible');
      show(index);
    });
    svg.addEventListener('pointerleave', function () {
      guide.setAttribute('visibility', 'hidden');
      show(rows.length - 1);
    });
  }

  document.addEventListener(
    'error',
    function (event) {
      var img = event.target;
      if (!img || img.tagName !== 'IMG') return;
      var frame = img.parentElement;
      if (!frame || !frame.classList.contains('avatar')) return;
      frame.textContent = frame.getAttribute('data-letter') || '?';
    },
    true,
  );

  function render() {
    var route = parseRoute();
    var gen = ++renderGen;
    if (route.name === 'token') renderDetail(route, gen);
    else renderList(route, gen);
  }

  window.addEventListener('hashchange', render);
  render();
})();
