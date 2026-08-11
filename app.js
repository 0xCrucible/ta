const money=(n,compact=false)=>{
  if(n==null||!Number.isFinite(+n)) return '—';
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:compact?'compact':'standard',maximumFractionDigits:compact?2:0}).format(+n)
};
const el=id=>document.getElementById(id);
let DATA=null;
let RANGE='24h';

const RANGE_COPY={
  '24h':{label:'24H',title:'Last 24 hours'},
  '7d':{label:'7D',title:'Last 7 days'},
  '30d':{label:'30D',title:'Last 30 days'}
};

function renderRange(){
  if(!DATA) return;
  const meta=RANGE_COPY[RANGE];
  const r=DATA.ranges[RANGE];
  el('volumePeriod').textContent=meta.label;
  el('donationPeriod').textContent=meta.label;
  el('chartTitle').textContent=meta.title;

  el('volume').textContent=money(r.volume,true);
  if(r.volumeAvailable){
    el('volumeSub').textContent=`${DATA.marketPairs||0} tracked TA market pair${DATA.marketPairs===1?'':'s'} · public DEX data`;
  }else{
    el('volumeSub').textContent=r.volumeNote || 'Historical market volume not available yet';
  }

  el('donations').textContent=money(r.donations);
  el('donationsSub').textContent=`${r.donationCount||0} published donation${r.donationCount===1?'':'s'} in this period`;
  draw(r.series||[]);
  el('chartNote').textContent=`Published donation activity · ${meta.title.toLowerCase()}.`;
}

function render(d){
  DATA=d;
  el('treasury').textContent=money(d.treasury);
  el('allTimeDonations').textContent=money(d.totalContributed);
  el('accountsFunded').textContent=d.accountsFunded??'—';
  el('marketPairs').textContent=d.marketPairs??'—';
  el('status').textContent='UPDATED '+new Date(d.updatedAt||Date.now()).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  renderRange();
}

function draw(rows){
  const chart=el('chart'); chart.innerHTML='';
  if(!rows.length){ chart.innerHTML='<div class="empty">No published donations in this period.</div>'; return; }
  const max=Math.max(1,...rows.map(x=>x.amount||0));
  rows.forEach(r=>{
    const c=document.createElement('div'); c.className='bar-col';
    const h=Math.max(2,Math.round(((r.amount||0)/max)*190));
    c.innerHTML=`<span class="bar-val">${r.amount?money(r.amount,true):''}</span><div class="bar" style="height:${h}px"></div><span class="bar-label">${r.label}</span>`;
    chart.appendChild(c);
  });
}

document.querySelectorAll('.period-btn').forEach(btn=>btn.addEventListener('click',()=>{
  RANGE=btn.dataset.range;
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.toggle('active',b===btn));
  renderRange();
}));

async function load(){
  try{
    const r=await fetch('/api/dashboard',{cache:'no-store'});
    if(!r.ok) throw Error('API');
    render(await r.json());
  }catch(e){
    el('status').textContent='DATA UNAVAILABLE';
    document.body.classList.add('error');
  }
}
load(); setInterval(load,60000);
