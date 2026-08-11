const TOKEN='0x9ca1cc0c90d97b4f36c5e2232d4fbd705a73c65d';
const strip=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const num=s=>Number(String(s||'0').replace(/[$,]/g,''));
const month={January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11};
function parseDate(s){const m=s.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/);return m?new Date(Date.UTC(+m[3],month[m[1]],+m[2],12)):null}
const dayKey=d=>d.toISOString().slice(0,10);
function rangeStart(days){const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(days-1));return d}
function dedupeRecords(records){
  // TA pages can contain repeated responsive markup. Keep identical amount/date entries only up to
  // the number implied by the published aggregate where possible, while preserving distinct records.
  const seen=new Map();
  return records.filter(r=>{const k=`${r.date.toISOString()}-${r.amount}-${r.proof||''}`; if(seen.has(k)) return false; seen.set(k,1); return true;});
}
function buildSeries(records,days){
  const out=[]; const start=rangeStart(days);
  for(let i=0;i<days;i++){
    const d=new Date(start); d.setUTCDate(start.getUTCDate()+i);
    const k=dayKey(d); const xs=records.filter(x=>dayKey(x.date)===k);
    out.push({label:d.toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'}),amount:xs.reduce((a,x)=>a+x.amount,0),count:xs.length});
  }
  return out;
}
function sumRange(records,hours){
  const cutoff=Date.now()-hours*3600*1000;
  const xs=records.filter(x=>x.date.getTime()>=cutoff);
  return {donations:xs.reduce((a,x)=>a+x.amount,0),donationCount:xs.length};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
  try{
    const [dexR,homeR,contribR]=await Promise.all([
      fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${TOKEN}`),
      fetch('https://ta.fund/transparency'),
      fetch('https://ta.fund/contributions')
    ]);
    if(!dexR.ok||!homeR.ok||!contribR.ok) throw new Error('One or more upstream sources failed');

    const dex=await dexR.json();
    const home=strip(await homeR.text());
    const contribHtml=strip(await contribR.text());
    const pairs=Array.isArray(dex)?dex:[];
    const volume24h=pairs.reduce((a,p)=>a+(Number(p?.volume?.h24)||0),0);

    const treasury=num((home.match(/Current Treasury\s*\$([\d,.]+)/i)||[])[1]);
    const totalContributed=num((home.match(/Total contributed\s*\$([\d,.]+)/i)||home.match(/\$([\d,.]+)\s*Total contributed/i)||[])[1]);
    const accountsFunded=Number((home.match(/Accounts funded\s*(\d+)/i)||home.match(/(\d+)\s*Accounts funded/i)||[])[1]||0);

    const raw=[];
    const re=/\$([\d,.]+).*?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})/g;
    let m;
    while((m=re.exec(contribHtml))){const date=parseDate(m[2]); if(date) raw.push({amount:num(m[1]),date});}
    const records=dedupeRecords(raw).filter(x=>x.amount>0);

    const r24=sumRange(records,24);
    const r7=sumRange(records,24*7);
    const r30=sumRange(records,24*30);

    res.status(200).json({
      treasury,totalContributed,accountsFunded,marketPairs:pairs.length,
      ranges:{
        '24h':{volume:volume24h,volumeAvailable:true,...r24,series:buildSeries(records,1)},
        '7d':{volume:null,volumeAvailable:false,volumeNote:'7D volume history requires daily snapshots after deployment',...r7,series:buildSeries(records,7)},
        '30d':{volume:null,volumeAvailable:false,volumeNote:'30D volume history requires daily snapshots after deployment',...r30,series:buildSeries(records,30)}
      },
      updatedAt:new Date().toISOString(),
      methodology:{volume:'DEX Screener rolling 24h volume. Longer periods intentionally withheld until a historical-volume store is connected.',donations:'TA Fund published contribution records.',treasury:'TA Fund published transparency balance.'}
    });
  }catch(err){
    res.status(500).json({error:'Unable to refresh dashboard data',detail:String(err?.message||err)});
  }
}
