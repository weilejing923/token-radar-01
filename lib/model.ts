// Token Launch Radar — model v2 (peer-multiple model)
//
// One sealed DefiLlama snapshot in, one ranked board out. No protocol name is
// ever special-cased: every figure below is derived from the snapshot itself.
//
// Implied value, in words the dashboard repeats verbatim:
//   implied = TVL x peerMultiple x growthMult x maturityMult x breadthMult
// - peerMultiple: for the protocol's own category, the median market-cap / TVL
//   ratio of the snapshot's live-token protocols in that category (clamped to
//   0.12..1.50). A category with fewer than 3 live peers falls back to the
//   global live median. This prices a Dex like a Dex and a lender like a
//   lender, instead of applying one flat multiple to everything.
// - growthMult: 1 + clamp(change_7d, -50, +100)/100 x 0.55. One hot or cold
//   week tilts the value, it never decides it.
// - maturityMult: 0.65 + min(ageDays, 1095)/1095 x 0.35, where ageDays is how
//   long DefiLlama has tracked the protocol with no token on record. Unknown
//   listing dates use a neutral 300 days; future listing dates clamp to 0.
// - breadthMult: 1 + min(chains-1, 5) x 0.03. Multi-chain reach is a small
//   bonus, capped so it can never outrank TVL itself.
//
// The board covers every watchlist slug (the floor) plus every other
// rankable pre-token protocol in the snapshot (the radar's early finds).
// Rankable means: records no token, is not a CEX, not a bridge / liquid
// staking / restaking wrapper of a token that already trades, not a
// versioned pool (a name ending in V2 / 2.0 and the like), not a name
// carrying the whole word wrapped / staked / staking, and not a name that
// begins with an exchange's name. Live-token protocols are never ranked:
// they are listed separately at the market's own value.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  peer_floor: number;
  peer_cap: number;
  peer_min_peers: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  peer_floor: 0.12,
  peer_cap: 1.5,
  peer_min_peers: 3,
  growth_weight: 0.55,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 300,
  breadth_per_chain: 0.03,
  breadth_max_chains: 5,
};

export const MODEL_VERSION = 'radar-peer-2';

export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peer_peers: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  peer_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

export interface PeerInfo {
  category: string;
  multiple: number;
  peers: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_tvl_usd: number;
  peers: PeerInfo[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPER_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPER_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Peer multiples per category, computed once from the snapshot's live set. */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Map<string, PeerInfo> {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const globalMedian = median(all);
  const clampPeer = (v: number): number => Math.min(model.peer_cap, Math.max(model.peer_floor, v));
  const out = new Map<string, PeerInfo>();
  for (const [category, ratios] of byCategory) {
    const useOwn = ratios.length >= model.peer_min_peers;
    // When a category has too few live peers to trust, the multiple is the
    // global live median and the peer count says so: it names the global set.
    out.set(category, {
      category,
      multiple: round4(clampPeer(useOwn ? median(ratios) : globalMedian)),
      peers: useOwn ? ratios.length : all.length,
    });
  }
  out.set('__global__', { category: '__global__', multiple: round4(clampPeer(globalMedian)), peers: all.length });
  return out;
}

export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  peers: Map<string, PeerInfo>,
  model: ModelConstants = MODEL,
): { implied: number; peer: PeerInfo; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const peer = peers.get(protocol.category ?? 'Other') ?? peers.get('__global__')!;
  const rawGrowth = typeof protocol.change_7d === 'number' && Number.isFinite(protocol.change_7d) ? protocol.change_7d : 0;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains) * model.breadth_per_chain;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * peer.multiple * growthMult * maturityMult * breadthMult));
  return { implied, peer, growthPct, growthMult, maturityMult, breadthMult, age };
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 540) return 45;
  return 30;
}

function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain}, then borrow a small amount against it and repay once, so both sides of the market are used`;
  if (c.includes('dex') || c.includes('derivative') || c.includes('perpetual')) return `Trade $${capital} of volume on ${n} on ${chain}: open and close two small spot or hedge positions instead of one large trade`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `Deposit $${capital} of USDC into a ${n} vault on ${chain} and keep the vault shares in the same wallet`;
  if (c.includes('rwa')) return `Mint $${capital} of ${n}'s yield asset on ${chain} through its own app and hold the asset, do not flip it the same day`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${n}, then make one real transaction on the far side so the trip is not empty`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain asset through ${n} on ${chain} and keep the staking receipt token in the wallet`;
  if (c.includes('prediction')) return `Fund $${capital} on ${n} and place two small positions in different markets, then let one settle`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} for a position you actually hold and keep the policy to expiry`;
  if (c.includes('payments')) return `Route one real payment of about $${capital} through ${n} and keep the receiving wallet active afterwards`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} through its own app and keep the position open and visible`;
}

function secondAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Set a health-factor alert for the ${n} position and add $25 of collateral once, so the account shows risk management, not a single deposit`;
  if (c.includes('dex')) return `Provide $50 of liquidity to one ${n} pool on ${chain} for at least 7 days, separate from the trading wallet activity above`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `Split the deposit: keep 80% in the main ${n} vault and put 20% in a second ${n} vault on ${chain}, so usage spans more than one product`;
  if (c.includes('rwa')) return `Claim or compound the yield on the ${n} asset once after the first distribution date instead of withdrawing it`;
  return `Use one second ${n} feature on ${chain} (a vote, a claim page visit with a signed message, or a small repeat deposit) so the wallet is not a one-transaction account`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page weekly.`;
  return s;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = chain === 'Ethereum' ? 12 : 3;
  return [
    {
      text: `Prepare one fresh wallet for ${p.name} only, fund it with $${capital + 30} on ${chain}, and keep the seed phrase offline; never farm from a wallet that holds other assets`,
      cost: `about $${gas} of gas to fund and approve`,
      time: '10 minutes once',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `$${capital} of capital plus about $${gas} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: secondAction(p, chain),
      cost: 'about $25-$50 of extra capital and $2 of gas',
      time: '15 minutes once',
    },
    {
      text: `Repeat one small qualifying action on ${p.name} every week and hold the main position at least ${hold} days, so activity spans several weekly snapshots instead of a single day`,
      cost: `about $2 of gas a week, $${capital} stays locked in the position`,
      time: `10 minutes a week for ${hold} days`,
    },
    {
      text: `Every Sunday, check ${p.name}'s own points, rewards or governance page from the link inside its app, claim only there, never pay anyone to claim, and log wallet, dates and transaction hashes in a farm sheet`,
      cost: 'nothing to check, never pay a claim fee',
      time: '10 minutes a week',
    },
  ];
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const peers = peerMultiples(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) {
    if (watch.has(p.slug)) chosen.set(p.slug, p);
    else if (isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, peers, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      peer_multiple: s.peer.multiple,
      peer_peers: s.peer.peers,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerMultiples(snapshot, model);
  // The dashboard's methodology panel lists only categories whose multiple
  // is genuinely their own (enough live peers), never a fallback category.
  const liveCounts = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const key = p.category ?? 'Other';
    liveCounts.set(key, (liveCounts.get(key) ?? 0) + 1);
  }
  const peerList: PeerInfo[] = [...peers.values()]
    .filter((x) => x.category !== '__global__' && (liveCounts.get(x.category) ?? 0) >= model.peer_min_peers)
    .map((x) => ({ ...x, peers: liveCounts.get(x.category)! }))
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1))
    .slice(0, 12);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    total_tvl_usd: board.reduce((sum, r) => sum + r.tvl_usd, 0),
    peers: peerList,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      on_watchlist: r.on_watchlist,
      implied_value_usd: r.implied_value_usd,
      peer_multiple: r.model.peer_multiple,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
    })),
    live,
  };
  return { board, radar };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows, needs 100..4000`;
  const seen = new Set<string>();
  for (const [i, row] of board.entries()) {
    if (row.rank !== i + 1) return `row ${row.slug} rank ${row.rank} is not ${i + 1}`;
    if (seen.has(row.slug)) return `duplicate slug ${row.slug}`;
    seen.add(row.slug);
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `row ${row.slug} implied value is not a positive whole number`;
    if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) return `implied value rises at rank ${row.rank}`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} farm step is ${len} characters`;
    }
  }
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  if (board.length >= 2 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) return 'every implied value is the same';
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug as string,
      name: p.name as string,
      category: typeof p.category === 'string' ? (p.category as string) : null,
      chains: Array.isArray(p.chains) ? (p.chains as unknown[]).filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd as number,
      change_7d: typeof p.change_7d === 'number' ? (p.change_7d as number) : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? (p.mcap_usd as number) : null,
      listed_at: typeof p.listed_at === 'string' ? (p.listed_at as string) : null,
      gecko_id: typeof p.gecko_id === 'string' ? (p.gecko_id as string) : null,
      symbol: typeof p.symbol === 'string' ? (p.symbol as string) : null,
    } satisfies SnapshotProtocol;
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}
