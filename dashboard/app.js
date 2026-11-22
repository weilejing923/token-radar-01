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
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre-token', sort: 'rank', dir: 1, selected: null };

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
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0) return 'Split the deposit: keep 80% in the main ' + n + ' vault and put 20% in a second ' + n + ' vault on ' + chain + ', so usage spans more than one product';
    if (c.indexOf('rwa') >= 0) return 'Claim or compound the yield on the ' + n + ' asset once after the first distribution date instead of withdrawing it';
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
      { text: 'Every Sunday, check ' + p.name + "'s own points, rewards or governance page from the link inside its app, claim only there, never pay anyone to claim, and log wallet, dates and transaction hashes in a farm sheet", cost: 'nothing to check, never pay a claim fee', time: '10 minutes a week' }
    ].map(stepText);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
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
      peerText, '. Growth clamps the 7-day TVL change to -50%\u2026+100% at 0.55 weight. Maturity rewards years tracked with no token on record (3-year cap). Breadth adds at most +15% for multi-chain reach. No name is hard-coded; open any row to see its own maths.');
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name, slug, chain\u2026', value: state.q, 'aria-label': 'Search' });
    search.addEventListener('input', function () { state.q = search.value; render(false); });
    function select(id, values, current, onchange) {
      var s = el('select', { id: id, 'aria-label': id },
        el('option', { value: 'all', text: id === 'category' ? 'All categories' : 'All chains' }),
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
    var body = rows.slice(0, 120).map(function (r) {
      var growth = el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) });
      var tr = el('tr', { onclick: function () { state.selected = r.slug; render(true); } },
        el('td', { class: 'rank', text: '#' + r.rank }),
        el('td', null, el('span', { class: 'name', text: r.name }), r.on_watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null,
          el('div', { class: 'sub2', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains || []).slice(0, 3).join(', ') })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growth,
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      return tr;
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
  function detail() {
    if (!state.selected) return null;
    var r = null;
    DATA.rows.forEach(function (x) { if (x.slug === state.selected) r = x; });
    if (!r) return null;
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
      el('h3', { text: 'How to farm ' + r.name + ' (5 steps)' }),
      el('ol', { class: 'steps' }, steps),
      el('p', { class: 'peers', text: 'Safety: this radar records no token for ' + r.name + ' in the snapshot; that is DefiLlama\u2019s record, not proof none exists. Verify in the protocol\u2019s own app before depositing, and never pay anyone to claim an airdrop.' }));
  }
  function render(scrollDetail) {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    app.appendChild(header());
    app.appendChild(hero());
    app.appendChild(method());
    app.appendChild(controls());
    app.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    var d = detail();
    if (d) app.appendChild(d);
    app.appendChild(el('p', { class: 'foot', text: 'Data: ' + DATA.source + '. Board shows the first 120 rows of the current filter; the full ranked board (' + DATA.board_size + ' rows) is in board.json. Implied values are a model\u2019s claim about what a launch would be worth if the record stayed as it is.' }));
    if (scrollDetail && d) d.scrollIntoView({ block: 'start' });
  }
  (function initFromHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('p')) state.selected = p.get('p');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('watch')) state.watch = true;
    if (p.get('q')) state.q = p.get('q');
  })();
  render(false);
})();
