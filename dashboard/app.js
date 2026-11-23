// Token Launch Radar dashboard. Reads window.RADAR (written by main.ts as
// data.js beside dashboard/) and renders: the ranked board, filters, a live
// token tab, and a detail view per protocol with the model maths and the
// farm plan. No network, no framework: every byte shown is in data.js.
// The farm plan below is the same derivation lib/model.ts writes into
// board.json (category, first chain, TVL tier and age decide every step).
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre-token', sort: 'rank', dir: 1, selected: null, view: 'board', conf: 'all' };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown age';
    if (d >= 365) return (d / 365).toFixed(1) + 'y no token';
    return d + 'd no token';
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500;
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 2.5e8) return 150;
    if (p.tvl_usd >= 5e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 540) return 45;
    return 30;
  }
  function coreAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ', then borrow a small amount against it and repay once, so both sides of the market are used';
    if (c.indexOf('dex') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Trade $' + capital + ' of volume on ' + n + ' on ' + chain + ': open and close two small spot or hedge positions instead of one large trade';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + n + ' vault on ' + chain + ' and keep the vault shares in the same wallet';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of " + n + "'s yield asset on " + chain + ' through its own app and hold the asset, do not flip it the same day';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + n + ', then make one real transaction on the far side so the trip is not empty';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain asset through ' + n + ' on ' + chain + ' and keep the staking receipt token in the wallet';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + n + ' and place two small positions in different markets, then let one settle';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ' for a position you actually hold and keep the policy to expiry';
    if (c.indexOf('payments') >= 0) return 'Route one real payment of about $' + capital + ' through ' + n + ' and keep the receiving wallet active afterwards';
    return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ' through its own app and keep the position open and visible';
  }
  function secondAction(p, chain) {
    var c = (p.category || '').toLowerCase(), n = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Set a health-factor alert for the ' + n + ' position and add $25 of collateral once, so the account shows risk management, not a single deposit';
    if (c.indexOf('dex') >= 0) return 'Provide $50 of liquidity to one ' + n + ' pool on ' + chain + ' for at least 7 days, separate from the trading wallet activity above';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'Check the funding rate on ' + n + ' before each weekly repeat and only trade when it is near neutral, so the farm does not bleed funding fees';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0) return 'Split the deposit: keep 80% in the main ' + n + ' vault and put 20% in a second ' + n + ' vault on ' + chain + ', so usage spans more than one product';
    if (c.indexOf('rwa') >= 0) return 'Claim or compound the yield on the ' + n + ' asset once after the first distribution date instead of withdrawing it';
    if (c.indexOf('index') >= 0) return 'Hold the ' + n + ' index position through one rebalance date instead of selling early, so the wallet records a full index cycle';
    if (c.indexOf('privacy') >= 0) return 'Run one full shield-and-unshield cycle on ' + n + ' a week apart, keeping both transaction hashes, so usage is a round trip and not a single deposit';
    if (c.indexOf('prediction') >= 0) return 'Let one ' + n + ' position settle and claim the outcome in the app instead of selling early, so the account shows a completed market cycle';
    if (c.indexOf('payments') >= 0) return 'Make a second, smaller payment through ' + n + ' to a different recipient a week later, so the wallet shows repeat use, not a one-off transfer';
    if (c.indexOf('insurance') >= 0) return 'Renew or extend the ' + n + ' cover once before it lapses, so the policy history shows continuity rather than a single purchase';
    return 'Use one second ' + n + ' feature on ' + chain + ' (a vote, a claim page visit with a signed message, or a small repeat deposit) so the wallet is not a one-transaction account';
  }
  function stepText(s) {
    var out = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
    return out.length > 600 ? out.slice(0, 596) + '...' : out;
  }
  function farmSteps(p) {
    var chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(p.age_days);
    var gas = chain === 'Ethereum' ? 12 : 3;
    return [
      { text: 'Prepare one fresh wallet for ' + p.name + ' only, fund it with $' + (capital + 30) + ' on ' + chain + ', and keep the seed phrase offline; never farm from a wallet that holds other assets', cost: 'about $' + gas + ' of gas to fund and approve', time: '10 minutes once' },
      { text: coreAction(p, capital, chain), cost: '$' + capital + ' of capital plus about $' + gas + ' of gas', time: '20 minutes to set up' },
      { text: secondAction(p, chain), cost: 'about $25-$50 of extra capital and $2 of gas', time: '15 minutes once' },
      { text: 'Repeat one small qualifying action on ' + p.name + ' every week and hold the main position at least ' + hold + ' days, so activity spans several weekly snapshots instead of a single day', cost: 'about $2 of gas a week, $' + capital + ' stays locked in the position', time: '10 minutes a week for ' + hold + ' days' },
      { text: 'Every Sunday, check ' + p.name + "'s own points, rewards or governance page from the link inside its app, claim only there, never pay anyone to claim, and log wallet, dates and transaction hashes in a farm sheet. " + p.name + ' has been tracked with no token since ' + (p.listed_at || 'an unrecorded date') + ' across ' + (p.chains || []).length + ' chain' + ((p.chains || []).length === 1 ? '' : 's') + ', so also re-check its listing monthly in case a token record appears and this farm changes', cost: 'nothing to check, never pay a claim fee', time: '10 minutes a week' }
    ].map(stepText);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.conf !== 'all' && r.confidence !== state.conf) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -1e9 : a.change_7d; bv = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Source: DefiLlama protocol index' }),
        el('span', { text: 'Model ' + DATA.model_version })));
  }
  function hero() {
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by what a launch would be worth' }),
        el('p', { html: '' },
          'Every protocol on the ', el('b', { text: DATA.watchlist_size + '-strong watchlist' }),
          ' is here, plus ', el('b', { text: DATA.early_size + ' early finds' }),
          ' below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor. Live-token protocols are never ranked: they sit on their own tab at market value. Implied value is this board\u2019s model claim, not a promise and not a launch prediction.')),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Board rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Board TVL tracked' }), el('b', { text: fmtUsd(DATA.total_tvl_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live set aside' }), el('b', { text: String(DATA.live_size) }))));
  }
  function method() {
    var peerText = DATA.peers.slice(0, 5).map(function (p) { return p.category + ' ' + p.multiple.toFixed(2) + 'x (' + p.peers + ' peers)'; }).join(' \u00b7 ');
    return el('section', { class: 'method' },
      el('b', { text: 'How the ranking works: ' }),
      ' ', el('code', { text: 'implied = TVL \u00d7 peer multiple \u00d7 growth \u00d7 maturity \u00d7 breadth' }),
      ' Peer multiple is the median market-cap/TVL of live protocols in the same category, from this snapshot itself \u2014 ',
      peerText, '. The peer pool holds ' + DATA.peer_pool_size + ' live operating protocols only: exchanges, bridges and staking wrappers never price anyone, the same classes this board refuses to rank. A category with too few live peers falls back to the pool median, and each row says which basis priced it and how much to trust it (confidence: high from 8+ own-category peers, medium from 3\u20137, fallback from the pool median). Growth clamps the 7-day TVL change to -50%\u2026+100% at 0.55 weight. Maturity rewards years tracked with no token on record (3-year cap). Breadth adds at most +15% for multi-chain reach. No name is hard-coded; open any row to see its own maths.');
  }
  function viewTabs() {
    function btn(id, label) {
      return el('button', { type: 'button', 'aria-pressed': state.view === id ? 'true' : 'false', text: label, onclick: function () { state.view = id; render(false); } });
    }
    return el('nav', { class: 'views', 'aria-label': 'Views' },
      btn('board', 'Ranked board'), btn('movers', 'Movers \u00b7 7d TVL'), btn('airdrop', 'Airdrop shortlist \u00b7 top 20'));
  }
  function jumpTo(slug) {
    state.view = 'board'; state.tab = 'pre-token';
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.conf = 'all';
    state.sort = 'rank'; state.dir = 1; state.selected = slug;
    render(false);
  }
  function categoryStrip() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!byCat[c]) byCat[c] = { cat: c, count: 0, tvl: 0, top: r };
      byCat[c].count += 1;
      byCat[c].tvl += r.tvl_usd;
      if (r.implied_value_usd > byCat[c].top.implied_value_usd) byCat[c].top = r;
    });
    var list = Object.keys(byCat).map(function (k) { return byCat[k]; })
      .sort(function (a, b) { return b.tvl - a.tvl; }).slice(0, 8);
    return el('div', { class: 'catstrip', 'aria-label': 'Board by category' },
      list.map(function (c) {
        return el('button', { type: 'button', class: 'catchip', 'aria-pressed': state.category === c.cat ? 'true' : 'false', onclick: function () {
          state.category = state.category === c.cat ? 'all' : c.cat; render(false);
        } },
          el('b', { text: c.cat }),
          el('span', { text: c.count + ' protocols \u00b7 ' + fmtUsd(c.tvl) + ' TVL' }),
          el('span', { text: 'Top: ' + c.top.name + ' ' + fmtUsd(c.top.implied_value_usd) }));
      }));
  }
  function moverPanel(title, note, list) {
    var body = list.map(function (r) {
      return el('tr', { onclick: function () { jumpTo(r.slug); } },
        el('td', { class: 'rank', text: '#' + r.rank }),
        el('td', null, el('span', { class: 'name', text: r.name }), r.on_watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null,
          el('div', { class: 'sub2', text: (r.category || 'Other') })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
    });
    return el('section', { class: 'mpanel' },
      el('h2', { text: title }),
      el('p', { text: note }),
      el('table', null,
        el('thead', null, el('tr', null, el('th', { text: 'Board rank' }), el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'Implied' }))),
        el('tbody', null, body)));
  }
  function moversView() {
    var withChg = DATA.rows.filter(function (r) { return r.change_7d !== null; });
    var gainers = withChg.slice().sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 12);
    var losers = withChg.slice().sort(function (a, b) { return a.change_7d - b.change_7d; }).slice(0, 12);
    return el('div', null,
      el('p', { class: 'intro', text: 'The same ranked board, re-sorted by the snapshot\u2019s 7-day TVL move. Fast inflow into a protocol that still has no token on record is the radar\u2019s core early signal; fast outflow is the warning side. Click any row to open it on the board with its full maths and farm plan.' }),
      el('div', { class: 'cols' },
        moverPanel('Fastest TVL growth \u00b7 7 days', 'Pre-token protocols gaining TVL fastest in the snapshot window.', gainers),
        moverPanel('Fastest TVL outflow \u00b7 7 days', 'Pre-token protocols losing TVL fastest \u2014 check the farm thesis before adding capital.', losers)));
  }
  function airdropView() {
    var body = [];
    DATA.rows.slice(0, 20).forEach(function (r) {
      var tags = [];
      if (r.age_days !== null && r.age_days >= 365) tags.push(el('span', { class: 'tag2 tag2-seasoned', text: 'SEASONED \u00b7 NO TOKEN' }));
      if (r.change_7d !== null && r.change_7d >= 10) tags.push(el('span', { class: 'tag2 tag2-hot', text: 'FAST GROWTH' }));
      var tr = el('tr', { onclick: function () { state.selected = state.selected === r.slug ? null : r.slug; render(false); } },
        el('td', { class: 'rank', text: '#' + r.rank }),
        el('td', null, el('span', { class: 'name', text: r.name }), r.on_watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null,
          el('span', { class: 'conf conf-' + r.confidence, text: r.confidence === 'high' ? 'CONF HIGH' : r.confidence === 'medium' ? 'CONF MED' : 'CONF FALLBACK' }), tags,
          el('div', { class: 'sub2', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains || []).slice(0, 3).join(', ') })),
        el('td', { class: 'num' }, fmtUsd(r.tvl_usd)),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      body.push(tr);
      if (state.selected === r.slug) {
        var cell = el('td', { colspan: '6', class: 'detail-cell' });
        cell.appendChild(detailNode(r));
        body.push(el('tr', { class: 'detail-row' }, cell));
      }
    });
    return el('section', null,
      el('p', { class: 'intro', text: 'The working shortlist: the board\u2019s top 20 by implied value, tagged for the two patterns that matter most \u2014 seasoned protocols that have run for a year or more with no token on record, and names whose TVL is growing fast right now. Open any row for the full five-step farm plan with capital, gas and time.' }),
      el('table', null,
        el('thead', null, el('tr', null, el('th', { text: 'Rank' }), el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'No-token age' }), el('th', { class: 'num', text: 'Implied value' }))),
        el('tbody', null, body)));
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name, slug, chain\u2026', value: state.q, 'aria-label': 'Search' });
    search.addEventListener('input', function () { state.q = search.value; render(false); });
    function select(id, values, current, onchange) {
      var s = el('select', { id: id, 'aria-label': id },
        el('option', { value: 'all', text: id === 'category' ? 'All categories' : id === 'confidence' ? 'All confidence' : 'All chains' }),
        values.map(function (v) { var o = el('option', { value: v, text: v }); if (v === current) o.setAttribute('selected', 'selected'); return o; }));
      s.addEventListener('change', function () { onchange(s.value); render(false); });
      return s;
    }
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; render(false); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (not ranked)', onclick: function () { state.tab = 'live'; render(false); } });
    var watch = el('label', { class: 'check' }, el('span', { text: 'Watchlist only' }));
    var box = document.createElement('input');
    box.type = 'checkbox'; box.checked = state.watch;
    box.addEventListener('change', function () { state.watch = box.checked; render(false); });
    watch.insertBefore(box, watch.firstChild);
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { text: 'Category' }), select('category', cats, state.category, function (v) { state.category = v; })),
      el('div', { class: 'field' }, el('label', { text: 'Chain' }), select('chain', chains, state.chain, function (v) { state.chain = v; })),
      el('div', { class: 'field' }, el('label', { text: 'Confidence' }), select('confidence', ['high', 'medium', 'fallback'], state.conf, function (v) { state.conf = v; })),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Board' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Filter' }), watch),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filtered().length + ' rows shown' : DATA.live.length + ' live protocols' }));
  }
  function sortTh(key, label, num) {
    var th = el('th', num ? { class: 'num', scope: 'col' } : { scope: 'col' },
      el('button', { type: 'button', text: label + (state.sort === key ? (state.dir === 1 ? ' \u25b2' : ' \u25bc') : ''), onclick: function () {
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; if (key === 'rank') state.dir = 1; }
        render(false);
      } }));
    return th;
  }
  function boardTable() {
    var rows = sorted(filtered());
    var maxTvl = DATA.rows.reduce(function (m, r) { return Math.max(m, r.tvl_usd); }, 0);
    var body = [];
    rows.slice(0, 120).forEach(function (r) {
      var growth = el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) });
      var bar = el('div', { class: 'bar' }, el('i', null));
      bar.firstChild.style.width = Math.max(2, Math.round((r.tvl_usd / maxTvl) * 100)) + '%';
      var tr = el('tr', { onclick: function () { state.selected = state.selected === r.slug ? null : r.slug; render(false); } },
        el('td', { class: 'rank', text: '#' + r.rank }),
        el('td', null, el('span', { class: 'name', text: r.name }), r.on_watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null,
          el('span', { class: 'conf conf-' + r.confidence, text: r.confidence === 'high' ? 'CONF HIGH' : r.confidence === 'medium' ? 'CONF MED' : 'CONF FALLBACK' }),
          el('div', { class: 'sub2', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains || []).slice(0, 3).join(', ') })),
        el('td', { class: 'num' }, fmtUsd(r.tvl_usd), bar),
        growth,
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      body.push(tr);
      if (state.selected === r.slug) {
        var cell = el('td', { colspan: '6', class: 'detail-cell' });
        cell.appendChild(detailNode(r));
        body.push(el('tr', { class: 'detail-row' }, cell));
      }
    });
    return el('table', null,
      el('thead', null, el('tr', null, sortTh('rank', 'Rank'), sortTh('name', 'Protocol'), sortTh('tvl', 'TVL', true), sortTh('growth', '7d', true), sortTh('age', 'No-token age', true), sortTh('implied', 'Implied value', true))),
      el('tbody', null, body));
  }
  function liveTable() {
    var body = DATA.live.map(function (r) {
      return el('tr', null,
        el('td', null, el('span', { class: 'name', text: r.name }), el('div', { class: 'sub2', text: (r.category || 'Other') + ' \u00b7 ' + (r.symbol || '') })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
    });
    return el('table', null,
      el('thead', null, el('tr', null, el('th', { text: 'Live-token protocol (market value, never ranked)' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: '7d' }), el('th', { class: 'num', text: 'Market cap' }))),
      el('tbody', null, body));
  }
  function whyLine(r) {
    var basis = r.peer_basis === 'category'
      ? 'the ' + r.peer_multiple.toFixed(2) + 'x median of ' + r.peer_peers + ' live ' + (r.category || 'Other') + ' peers in this snapshot'
      : 'the ' + r.peer_multiple.toFixed(2) + 'x median of all ' + r.peer_peers + ' live operating protocols in the pool, because ' + (r.category || 'its category') + ' has too few live peers of its own';
    return 'Why #' + r.rank + ': ' + fmtUsd(r.tvl_usd) + ' of TVL priced at ' + basis +
      ', then adjusted \u00d7' + r.growth_multiplier.toFixed(2) + ' for its 7-day move, \u00d7' + r.maturity_multiplier.toFixed(2) +
      ' for ' + fmtAge(r.age_days).replace(' no token', '') + ' tracked with no token, and \u00d7' + r.breadth_multiplier.toFixed(2) +
      ' for reach across ' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + '.';
  }
  function detail() {
    if (!state.selected) return null;
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === state.selected) r = x; });
    if (!r) return null;
    // When the selected row is on screen, its detail expands inline under
    // that row (see boardTable) and the page never scrolls; the standalone
    // section below is only for a selection that is not in the table view
    // (for example a #p= link to a row the current filter hides).
    var shown = state.tab === 'pre-token' && sorted(filtered()).slice(0, 120).some(function (x) { return x.slug === r.slug; });
    if (shown) return null;
    return detailNode(r);
  }
  function detailNode(r) {
    var steps = farmSteps(r).map(function (s) { return el('li', { text: s }); });
    return el('section', { class: 'detail', id: 'detail' },
      el('h2', { text: '#' + r.rank + ' ' + r.name }),
      el('div', { class: 'meta', text: (r.category || 'Other') + ' \u00b7 Chains: ' + (r.chains || []).join(', ') + ' \u00b7 Tracked since ' + (r.listed_at || 'unknown') + ' \u00b7 ' + fmtAge(r.age_days) + (r.on_watchlist ? ' \u00b7 On the house watchlist' : ' \u00b7 Early find below the watchlist floor') }),
      el('div', { class: 'math' },
        el('span', null, el('small', { text: 'TVL' }), fmtUsd(r.tvl_usd)),
        el('span', { class: 'op', text: '\u00d7' }),
        el('span', null, el('small', { text: 'Peer multiple' }), r.peer_multiple.toFixed(2) + 'x'),
        el('span', { class: 'op', text: '\u00d7' }),
        el('span', null, el('small', { text: 'Growth' }), r.growth_multiplier.toFixed(2) + 'x'),
        el('span', { class: 'op', text: '\u00d7' }),
        el('span', null, el('small', { text: 'Maturity' }), r.maturity_multiplier.toFixed(2) + 'x'),
        el('span', { class: 'op', text: '\u00d7' }),
        el('span', null, el('small', { text: 'Breadth' }), r.breadth_multiplier.toFixed(2) + 'x'),
        el('span', { class: 'op', text: '=' }),
        el('span', { class: 'res', text: fmtUsd(r.implied_value_usd) })),
      el('p', { class: 'peers', text: whyLine(r) }),
      el('p', { class: 'peers', text: 'Pricing confidence: ' + r.confidence + (r.confidence === 'fallback'
        ? ' \u2014 this row is priced from the pool median because its category has too few live peers of its own, so treat the figure as rougher than a category-priced row.'
        : ' \u2014 this row\u2019s multiple is the median of ' + r.peer_peers + ' live peers in its own category.') }),
      el('h3', { text: 'How to farm ' + r.name + ' (5 steps)' }),
      el('ol', { class: 'steps' }, steps),
      el('p', { class: 'peers', text: 'Safety: this radar records no token for ' + r.name + ' in the snapshot; that is DefiLlama\u2019s record, not proof none exists. Verify in the protocol\u2019s own app before depositing, and never pay anyone to claim an airdrop.' }));
  }
  function render(scrollDetail) {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    app.appendChild(header());
    app.appendChild(hero());
    app.appendChild(viewTabs());
    var d = null;
    if (state.view === 'movers') {
      app.appendChild(moversView());
    } else if (state.view === 'airdrop') {
      app.appendChild(airdropView());
    } else {
      app.appendChild(method());
      app.appendChild(categoryStrip());
      app.appendChild(controls());
      app.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
      d = detail();
      if (d) app.appendChild(d);
    }
    app.appendChild(el('p', { class: 'foot', text: 'Data: ' + DATA.source + '. Board shows the first 120 rows of the current filter; the full ranked board (' + DATA.board_size + ' rows) is in board.json. Implied values are a model\u2019s claim about what a launch would be worth if the record stayed as it is.' }));
    if (scrollDetail && d) d.scrollIntoView({ block: 'start' });
  }
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
      var s = document.querySelector('input[type="search"]');
      if (s) { e.preventDefault(); s.focus(); }
    }
    if (e.key === 'Escape' && state.selected) { state.selected = null; render(false); }
  });
  (function initFromHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('view')) state.view = p.get('view');
    if (p.get('conf')) state.conf = p.get('conf');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('watch')) state.watch = true;
    if (p.get('q')) state.q = p.get('q');
  })();
  render(false);
})();
