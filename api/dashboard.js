const TOKEN = '0x9ca1cc0c90d97b4f36c5e2232d4fbd705a73c65d';
const TA_BASE = 'https://ta.fund';

const strip = (s = '') => s
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const num = (s) => {
  const n = Number(String(s ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const months = {January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11};
function parseDate(s) {
  const m = String(s).match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/);
  return m ? new Date(Date.UTC(+m[3], months[m[1]], +m[2], 12)) : null;
}
const dayKey = d => d.toISOString().slice(0,10);
function rangeStart(days) {
  const d = new Date();
  d.setUTCHours(0,0,0,0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}
function buildSeries(records, days) {
  const out = [];
  const start = rangeStart(days);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const xs = records.filter(x => dayKey(x.date) === dayKey(d));
    out.push({
      label: d.toLocaleDateString('en-US', {timeZone:'UTC', month:'short', day:'numeric'}),
      amount: xs.reduce((a,x) => a + x.amount, 0),
      count: xs.length
    });
  }
  return out;
}
function sumDays(records, days) {
  const start = rangeStart(days).getTime();
  const xs = records.filter(x => x.date.getTime() >= start);
  return {donations: xs.reduce((a,x) => a + x.amount, 0), donationCount: xs.length};
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url) {
  const r = await fetchWithTimeout(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; TAMetrics/1.0; +https://ta.fund)',
      'accept': 'text/html,application/xhtml+xml'
    }
  });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.text();
}

async function getMarket() {
  const urls = [
    `https://api.dexscreener.com/tokens/v1/robinhood/${TOKEN}`,
    `https://api.dexscreener.com/latest/dex/search?q=${TOKEN}`
  ];
  let lastError;
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, {headers:{accept:'application/json'}});
      if (!r.ok) throw new Error(`DEX Screener returned ${r.status}`);
      const json = await r.json();
      const all = Array.isArray(json) ? json : (Array.isArray(json?.pairs) ? json.pairs : []);
      const pairs = all.filter(p =>
        String(p?.baseToken?.address || '').toLowerCase() === TOKEN ||
        String(p?.quoteToken?.address || '').toLowerCase() === TOKEN
      );
      if (!pairs.length) throw new Error('No TA pairs returned');
      return {
        volume24h: pairs.reduce((a,p) => a + (Number(p?.volume?.h24) || 0), 0),
        marketPairs: pairs.length,
        ok: true
      };
    } catch (e) {
      lastError = e;
    }
  }
  return {volume24h:null, marketPairs:0, ok:false, error:String(lastError?.message || lastError)};
}

async function getFund() {
  let transparency = '';
  let contributions = '';
  const errors = [];
  try { transparency = strip(await getText(`${TA_BASE}/transparency`)); }
  catch (e) { errors.push(`transparency: ${String(e.message || e)}`); }
  try { contributions = strip(await getText(`${TA_BASE}/contributions`)); }
  catch (e) { errors.push(`contributions: ${String(e.message || e)}`); }

  const treasuryMatch = transparency.match(/Current Treasury\s*\$([\d,.]+)/i);
  const totalMatch = transparency.match(/Total contributed\s*\$([\d,.]+)/i) || transparency.match(/\$([\d,.]+)\s*Total contributed/i);
  const accountsMatch = transparency.match(/Accounts funded\s*(\d+)/i) || transparency.match(/(\d+)\s*Accounts funded/i);

  const records = [];
  const re = /\$([\d,.]+)[\s\S]{0,220}?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})/g;
  let m;
  while ((m = re.exec(contributions))) {
    const date = parseDate(m[2]);
    const amount = num(m[1]);
    if (date && amount && amount > 0) records.push({amount,date});
  }

  return {
    treasury:num(treasuryMatch?.[1]),
    totalContributed:num(totalMatch?.[1]),
    accountsFunded:Number(accountsMatch?.[1] || 0) || null,
    records,
    ok:Boolean(transparency || contributions),
    errors
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});

  try {
    const [market, fund] = await Promise.all([getMarket(), getFund()]);
    const r24 = sumDays(fund.records, 1);
    const r7 = sumDays(fund.records, 7);
    const r30 = sumDays(fund.records, 30);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      ok: true,
      treasury: fund.treasury,
      totalContributed: fund.totalContributed,
      accountsFunded: fund.accountsFunded,
      marketPairs: market.marketPairs,
      ranges: {
        '24h': {volume:market.volume24h,volumeAvailable:market.ok,volumeNote:market.ok?null:'Live market source unavailable',...r24,series:buildSeries(fund.records,1)},
        '7d': {volume:null,volumeAvailable:false,volumeNote:'7D volume requires historical snapshots',...r7,series:buildSeries(fund.records,7)},
        '30d': {volume:null,volumeAvailable:false,volumeNote:'30D volume requires historical snapshots',...r30,series:buildSeries(fund.records,30)}
      },
      sourceStatus:{market:market.ok,fund:fund.ok,marketError:market.error||null,fundErrors:fund.errors},
      updatedAt:new Date().toISOString()
    });
  } catch (e) {
    console.error('dashboard fatal error', e);
    return res.status(500).json({ok:false,error:String(e?.message || e)});
  }
};
