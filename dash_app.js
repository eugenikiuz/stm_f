// ============================================================
//  ЛОГИКА ДАШБОРДА  (данные приходят из DATA — см. data_inline.js)
// ============================================================
const M = DATA.months;
const S = DATA.site, B = DATA.business, D = DATA.direct;

// Старт графиков с февраля`25 (индекс 1) — январь неполный
const START = 1;
const mLabels = M.slice(START);
const slice = arr => arr ? arr.slice(START) : [];

// ---------- helpers ----------
const C = {teal:"#1f7a8c",amber:"#d98a29",navy:"#2b4a6f",plum:"#7a5a8c",
  green:"#3d9970",red:"#c65340",grey:"#c4cfda",greyL:"#dde4ec",ink:"#14202e",soft:"#5a6b7d"};
const fmt = n => n==null?"—":Math.round(n).toLocaleString("ru-RU");
const money = n => n==null?"—":Math.round(n).toLocaleString("ru-RU")+" ₽";
const pct1 = n => n==null?"—":(n*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%";
const mmss = sec => { if(sec==null) return "—"; const m=Math.floor(sec/60),s=sec%60; return m+":"+String(s).padStart(2,"0"); };

// mode: "good_up" (рост=хорошо), "good_down" (снижение=хорошо), "neutral" (без оценки, серый)
// Возвращает бейдж, где ЦВЕТ = оценка для бизнеса, а СТРЕЛКА = направление.
function deltaBadge(cur, prev, mode="good_up"){
  if(cur==null||prev==null||prev===0) return "";
  const rel = Math.round((cur-prev)/Math.abs(prev)*100);
  const arrow = rel>0?"▲":rel<0?"▼":"→";
  const sign = rel>0?"+":"";
  let cls;
  if(rel===0) cls="flat";
  else if(mode==="neutral") cls="flat";
  else {
    const good = mode==="good_down" ? rel<0 : rel>0;
    cls = good ? "up" : "down"; // "up"=зелёный, "down"=красный (см. CSS)
  }
  return `<span class="k-delta ${cls}">${arrow} ${sign}${rel}%</span>`;
}
// последнее ненулевое значение и предыдущее
function lastPair(arr){
  const idx = arr.map((v,i)=>v!=null?i:-1).filter(i=>i>=0);
  const li = idx[idx.length-1], pi = idx[idx.length-2];
  return {cur:arr[li], prev:arr[pi], curM:M[li], prevM:M[pi]};
}

Chart.defaults.font.family="-apple-system,Segoe UI,Roboto,sans-serif";
Chart.defaults.font.size=11.5;
Chart.defaults.color=C.soft;
const gridOpt = {color:"#eef2f6",drawTicks:false};
function baseScales(extra){
  return Object.assign({x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:12}}}, extra);
}
function legendBottom(){return {position:"bottom",labels:{usePointStyle:true,pointStyle:"circle",boxWidth:7,padding:15,font:{size:12}}};}
function tip(){return {backgroundColor:"#14202e",padding:11,cornerRadius:8,titleFont:{size:12.5},bodyFont:{size:12},displayColors:true,boxPadding:3};}

// ============================================================
//  БЛОК 1 — Трафик по источникам + ЦД + конверсия
// ============================================================
function block1(){
  const vt = slice(S.visitors_total);
  const vb = slice(S.visitors_business).map(x=>x||0);
  const vc = slice(S.visitors_context).map(x=>x||0);
  // "Прочий" трафик = всего − Я.Бизнес − контекст
  const vother = vt.map((t,i)=> Math.max(0,(t||0)-vb[i]-vc[i]) );
  const cd = slice(S.cd_total);

  new Chart(document.getElementById("ch1"),{
    type:"bar",
    data:{labels:mLabels, datasets:[
      {type:"bar",label:"Прочий трафик",data:vother,backgroundColor:C.greyL,stack:"v",order:3,borderRadius:2},
      {type:"bar",label:"Яндекс Бизнес",data:vb,backgroundColor:C.plum,stack:"v",order:3,borderRadius:2},
      {type:"bar",label:"Контекст (Директ)",data:vc,backgroundColor:C.navy,stack:"v",order:3,borderRadius:{topLeft:3,topRight:3}},
      {type:"line",label:"Целевые действия",data:cd,borderColor:C.teal,backgroundColor:C.teal,
        borderWidth:2.5,tension:.35,pointRadius:2.5,pointHoverRadius:5,yAxisID:"y1",order:1},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      plugins:{legend:legendBottom(),tooltip:Object.assign(tip(),{callbacks:{
        label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw)}`}})},
      scales:baseScales({
        x:{grid:{display:false},ticks:{autoSkip:false,maxRotation:60,minRotation:60,font:{size:10}}},
        y:{stacked:true,position:"left",grid:gridOpt,title:{display:true,text:"посетители"}},
        y1:{position:"right",grid:{drawOnChartArea:false},title:{display:true,text:"ЦД"}}
      })}
  });
}

// ============================================================
//  БЛОК 2 — Поведение сайта (3 мини-карточки со спарклайнами)
// ============================================================
function spark(canvasId, data, color, fmtFn, invert){
  // invert: рост = плохо (для отказов) → цвет заливки красноватый если растёт
  new Chart(document.getElementById(canvasId),{
    type:"line",
    data:{labels:mLabels,datasets:[{data,borderColor:color,borderWidth:2,tension:.4,
      pointRadius:0,pointHoverRadius:4,
      fill:true,backgroundColor:(ctx)=>{
        const c=ctx.chart.ctx,g=c.createLinearGradient(0,0,0,60);
        g.addColorStop(0,color+"33");g.addColorStop(1,color+"00");return g;}
    }]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:Object.assign(tip(),{callbacks:{
        title:items=>mLabels[items[0].dataIndex],
        label:ctx=>" "+fmtFn(ctx.raw)}})},
      scales:{x:{display:false},y:{display:false,grace:"12%"}}}
  });
}
function block2(){
  // полные массивы — для «текущего значения» и дельты (метки берутся из полного M)
  const depthF=S.depth, bounceF=S.bounce, timeF=S.time_sec;
  // обрезанные (с февраля) — только для спарклайна
  const depth=slice(depthF), bounce=slice(bounceF), time=slice(timeF);
  // карточки
  const cards=[
    {id:"sp-depth",label:"Глубина просмотра",arr:depthF,spark:depth,color:C.teal,unit:" стр.",mode:"good_up",
     hint:"Сколько страниц смотрит один посетитель"},
    {id:"sp-bounce",label:"Отказы",arr:bounceF,spark:bounce,color:C.red,unit:"",mode:"good_down",
     hint:"Доля тех, кто ушёл сразу. Ниже — лучше"},
    {id:"sp-time",label:"Время на сайте",arr:timeF,spark:time,color:C.amber,unit:"",mode:"good_up",
     hint:"Средняя длительность визита"},
  ];
  document.getElementById("behave").innerHTML = cards.map(c=>{
    const lp=lastPair(c.arr);
    const badge = deltaBadge(lp.cur,lp.prev,c.mode).replace('class="k-delta','class="b-delta k-delta');
    const valTxt = c.id==="sp-time"?mmss(lp.cur):(c.id==="sp-depth"?lp.cur.toLocaleString("ru-RU",{maximumFractionDigits:2}):pct1(lp.cur));
    return `<div class="bcard">
      <div class="b-top"><span class="b-label">${c.label}</span>
        ${badge}</div>
      <div class="b-val" style="color:${c.color}">${valTxt}<span style="font-size:.5em;color:var(--ink-faint);font-weight:600">${c.unit}</span></div>
      <div class="b-spark"><canvas id="${c.id}"></canvas></div>
      <div class="b-hint">${c.hint} · ${lp.curM} vs ${lp.prevM}</div>
    </div>`;
  }).join("");
  spark("sp-depth",depth,C.teal,v=>v.toLocaleString("ru-RU",{maximumFractionDigits:2})+" стр.");
  spark("sp-bounce",bounce,C.red,v=>pct1(v));
  spark("sp-time",time,C.amber,v=>mmss(v));
}

// ============================================================
//  БЛОК 3 — Яндекс Бизнес
// ============================================================
function block3(){
  // KPI по последнему доступному месяцу
  const K=[
    {arr:B.cpa,label:"Стоимость целевого действия",cls:"kpi amber",f:money,mode:"good_down"},
    {arr:B.t_actions,label:"Целевые действия",cls:"kpi teal",f:fmt,mode:"good_up"},
    {arr:B.cpl,label:"Стоимость целевого клиента",cls:"kpi amber",f:money,mode:"good_down"},
    {arr:B.t_clients,label:"Целевые клиенты",cls:"kpi teal",f:fmt,mode:"good_up"},
    {arr:B.spend_vat,label:"Расход с НДС",cls:"kpi plum",f:money,mode:"neutral"},
    {arr:B.cr,label:"Конверсия в клиента",cls:"kpi teal",f:pct1,mode:"good_up"},
  ];
  document.getElementById("biz-kpis").innerHTML = K.map(k=>{
    const lp=lastPair(k.arr);
    return `<div class="${k.cls}"><span class="bar"></span>
      <div class="k-label">${k.label}</div>
      <div class="k-val tnum">${k.f(lp.cur)}</div>
      ${deltaBadge(lp.cur,lp.prev,k.mode)}
      <div class="k-sub">${lp.curM} · сравнение с ${lp.prevM}</div>
    </div>`;
  }).join("");
  const lp=lastPair(B.cpa);
  document.getElementById("biz-note").textContent = `${lp.curM} · стрелки — динамика к ${lp.prevM}`;

  // График: объём действий + стоимость действия
  const ta=slice(B.t_actions), cpa=slice(B.cpa);
  new Chart(document.getElementById("ch-biz"),{
    type:"bar",
    data:{labels:mLabels,datasets:[
      {type:"bar",label:"Целевые действия",data:ta,backgroundColor:C.plum,borderRadius:4,yAxisID:"y",order:2},
      {type:"line",label:"Стоимость действия, ₽",data:cpa,borderColor:C.amber,backgroundColor:C.amber,
        borderWidth:2.5,tension:.35,pointRadius:2.5,pointHoverRadius:5,yAxisID:"y1",order:1},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      plugins:{legend:legendBottom(),tooltip:Object.assign(tip(),{callbacks:{
        label:ctx=>ctx.dataset.label.includes("Стоимость")?` ${ctx.dataset.label}: ${money(ctx.raw)}`:` ${ctx.dataset.label}: ${fmt(ctx.raw)}`}})},
      scales:baseScales({
        y:{position:"left",grid:gridOpt,title:{display:true,text:"действия"},beginAtZero:true},
        y1:{position:"right",grid:{drawOnChartArea:false},ticks:{callback:v=>v+" ₽"},title:{display:true,text:"₽"}}
      })}
  });

  // График CTR + конверсия
  const ctr=slice(B.ctr), cr=slice(B.cr);
  new Chart(document.getElementById("ch-biz2"),{
    type:"line",
    data:{labels:mLabels,datasets:[
      {label:"CTR",data:ctr,borderColor:C.teal,backgroundColor:C.teal,borderWidth:2.5,tension:.35,pointRadius:2,pointHoverRadius:4},
      {label:"Конверсия в клиента",data:cr,borderColor:C.navy,backgroundColor:C.navy,borderWidth:2.5,tension:.35,pointRadius:2,pointHoverRadius:4},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      plugins:{legend:legendBottom(),tooltip:Object.assign(tip(),{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${pct1(ctx.raw)}`}})},
      scales:baseScales({y:{grid:gridOpt,ticks:{callback:v=>(v*100).toFixed(0)+"%"},beginAtZero:true}})}
  });

  // Звонки — нейтрально, со сноской
  const ok=slice(B.calls_ok), no=slice(B.calls_no);
  new Chart(document.getElementById("ch-calls"),{
    type:"bar",
    data:{labels:mLabels,datasets:[
      {label:"Принятые",data:ok,backgroundColor:C.green,borderRadius:3,stack:"c"},
      {label:"Непринятые",data:no,backgroundColor:C.grey,borderRadius:3,stack:"c"},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      plugins:{legend:legendBottom(),tooltip:tip()},
      scales:baseScales({x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:gridOpt,beginAtZero:true}})}
  });
}

// ============================================================
//  БЛОК 4 — Контекст (Директ)
// ============================================================
let directMonth = "Июль";
function svcKey(t){const s=t.toLowerCase();
  if(s.includes("бренд"))return "Брендовые запросы";
  if(s.includes("ретаргет")&&s.includes("сне"))return "Ретаргет · лечение во сне";
  if(s.includes("ретаргет"))return "Ретаргет · имплантация";
  if(s.includes("сне"))return "Лечение во сне";
  if(s.includes("имплант"))return "Имплантация";
  return "Прочее";}
const typeCls = t=> t==="Поиск"?"poisk":t==="РСЯ"?"rsya":"org";

function directTotals(month){
  const rows=D.filter(c=>c.month===month);
  const sum=k=>rows.reduce((a,c)=>a+(c[k]||0),0);
  const shows=sum("shows"),clicks=sum("clicks"),vis=sum("visitors"),cd=sum("total_cd"),
    budv=sum("budget_vat"),phone=sum("phone"),msg=sum("msg"),form=sum("form");
  return {shows,clicks,visitors:vis,total_cd:cd,budget_vat:budv,phone,msg,form,
    ctr:shows?clicks/shows:0, cr:clicks?cd/clicks:0, cpa:cd?budv/cd:0, cpc:clicks?budv/clicks:0};
}

function renderDirect(){
  const rows=D.filter(c=>c.month===directMonth);
  const t=directTotals(directMonth);
  const prevMonth = directMonth==="Июль" ? "Июнь" : null; // у июня нет предыдущего в данных
  document.getElementById("direct-note").textContent =
    `${rows.length} кампаний · ${directMonth} 2026` + (prevMonth?` · динамика к ${prevMonth}`:` · первый месяц, динамики нет`);

  // KPI сверху
  const kpis=[
    {label:"Посетители с рекламы",val:fmt(t.visitors),cls:"kpi navy"},
    {label:"CTR",val:pct1(t.ctr),cls:"kpi teal"},
    {label:"Конверсия в ЦД",val:pct1(t.cr),cls:"kpi teal"},
    {label:"Всего ЦД",val:fmt(t.total_cd),cls:"kpi navy"},
    {label:"Стоимость ЦД (с НДС)",val:money(t.cpa),cls:"kpi cost amber"},
    {label:"Расход с НДС",val:money(t.budget_vat),cls:"kpi amber"},
  ];
  document.getElementById("direct-kpis").innerHTML=kpis.map(k=>`
    <div class="${k.cls}"><span class="bar"></span>
      <div class="k-label">${k.label}</div>
      <div class="k-val tnum">${k.val}</div></div>`).join("");

  // Донат типов ЦД
  drawDonut(t);

  // Подпись динамики к прошлому месяцу. mode: good_up / good_down / neutral.
  // Цвет = оценка для бизнеса, стрелка = направление.
  function trend(cur, prev, mode="good_up"){
    if(prev==null || prev===0 || cur==null) return "";
    const rel = Math.round((cur-prev)/Math.abs(prev)*100);
    if(rel===0) return `<span class="cm-trend flat">→ 0%</span>`;
    const arrow = rel>0?"▲":"▼";
    if(mode==="neutral") return `<span class="cm-trend flat">${arrow} ${rel>0?"+":""}${rel}%</span>`;
    const good = mode==="good_down" ? rel<0 : rel>0;
    return `<span class="cm-trend ${good?"good":"bad"}">${arrow} ${rel>0?"+":""}${rel}%</span>`;
  }

  // Карточки кампаний, сгруппированные по услуге
  const groups={};
  rows.forEach(c=>{const k=svcKey(c.target);(groups[k]=groups[k]||[]).push(c);});
  const order=Object.keys(groups).sort((a,b)=>
    groups[b].reduce((s,c)=>s+(c.total_cd||0),0)-groups[a].reduce((s,c)=>s+(c.total_cd||0),0));

  document.getElementById("camp-groups").innerHTML = order.map(svc=>{
    const cs=groups[svc].sort((a,b)=>(b.total_cd||0)-(a.total_cd||0));
    const gcd=cs.reduce((s,c)=>s+(c.total_cd||0),0);
    const cards=cs.map(c=>{
      const on=c.status==="Активна";
      // ищем ту же кампанию в предыдущем месяце
      const p = prevMonth ? D.find(x=>x.month===prevMonth && x.name===c.name) : null;
      const tr = (cur,prev,mode)=> p ? trend(cur,prev,mode) : "";
      return `<div class="camp ${on?"":"off"}">
        <div class="c-head">
          <span class="c-type ${typeCls(c.type)}">${c.type}</span>
          <span class="c-status ${on?"on":""}">${on?"● активна":"○ отключена"}</span>
        </div>
        <div class="c-name">${c.name}</div>
        <div class="c-metrics">
          <div class="cm"><span class="cm-label">Всего ЦД</span><span class="cm-val big" style="color:var(--navy)">${fmt(c.total_cd)}</span>${tr(c.total_cd,p?.total_cd,"good_up")}</div>
          <div class="cm"><span class="cm-label">Стоимость ЦД</span><span class="cm-val" style="color:var(--amber)">${money(c.cpl_vat)}</span>${tr(c.cpl_vat,p?.cpl_vat,"good_down")}</div>
          <div class="cm"><span class="cm-label">Посетители</span><span class="cm-val">${fmt(c.visitors)}</span>${tr(c.visitors,p?.visitors,"good_up")}</div>
          <div class="cm"><span class="cm-label">CR в ЦД</span><span class="cm-val">${pct1(c.cr_cd)}</span>${tr(c.cr_cd,p?.cr_cd,"good_up")}</div>
          <div class="cm"><span class="cm-label">CTR</span><span class="cm-val">${pct1(c.ctr)} <small>CPC ${money(c.cpc)}</small></span>${tr(c.ctr,p?.ctr,"good_up")}</div>
          <div class="cm"><span class="cm-label">Бюджет с НДС</span><span class="cm-val">${money(c.budget_vat)}</span>${tr(c.budget_vat,p?.budget_vat,"neutral")}</div>
        </div>
      </div>`;
    }).join("");
    return `<div class="svc-group">
      <div class="svc-title">${svc} <span class="cnt">${cs.length} камп. · ${gcd} ЦД</span></div>
      <div class="camp-grid">${cards}</div>
    </div>`;
  }).join("");
}

let donutChart;
function drawDonut(t){
  donutChart?.destroy();
  donutChart=new Chart(document.getElementById("ch-donut"),{
    type:"doughnut",
    data:{labels:["Клик по телефону","Переход в мессенджер","Отправка формы"],
      datasets:[{data:[t.phone,t.msg,t.form],
        backgroundColor:[C.teal,C.amber,C.navy],borderWidth:2,borderColor:"#fff"}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:"62%",
      plugins:{legend:legendBottom(),tooltip:Object.assign(tip(),{callbacks:{
        label:ctx=>{const s=ctx.dataset.data.reduce((a,b)=>a+b,0);
          return ` ${ctx.label}: ${ctx.raw} (${s?Math.round(ctx.raw/s*100):0}%)`;}}})}}
  });
}

// сравнение июнь → июль (стрелки)
function directCompare(){
  const jun=directTotals("Июнь"), jul=directTotals("Июль");
  const rows=[
    {label:"Всего ЦД",a:jun.total_cd,b:jul.total_cd,f:fmt,mode:"good_up"},
    {label:"Стоимость ЦД",a:jun.cpa,b:jul.cpa,f:money,mode:"good_down"},
    {label:"Конверсия в ЦД",a:jun.cr,b:jul.cr,f:pct1,mode:"good_up"},
    {label:"CTR",a:jun.ctr,b:jul.ctr,f:pct1,mode:"good_up"},
    {label:"Расход с НДС",a:jun.budget_vat,b:jul.budget_vat,f:money,mode:"neutral"},
  ];
  document.getElementById("direct-compare").innerHTML = rows.map(r=>{
    const rel=r.a?Math.round((r.b-r.a)/Math.abs(r.a)*100):0;
    const arrow=rel>0?"▲":rel<0?"▼":"→";
    let cls;
    if(rel===0||r.mode==="neutral") cls="flat";
    else cls = (r.mode==="good_down" ? rel<0 : rel>0) ? "up" : "down";
    return `<div class="kpi navy"><span class="bar"></span>
      <div class="k-label">${r.label}</div>
      <div class="k-val tnum" style="font-size:20px">${r.f(r.b)}</div>
      <span class="k-delta ${cls}">${arrow} ${rel>0?"+":""}${rel}% <span style="font-weight:600;opacity:.7">к июню</span></span>
      <div class="k-sub">июнь: ${r.f(r.a)}</div>
    </div>`;
  }).join("");
}

function bindDirectPeriod(){
  document.querySelectorAll("#direct-seg button").forEach(b=>{
    b.onclick=()=>{
      directMonth=b.dataset.m;
      document.querySelectorAll("#direct-seg button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.m===directMonth));
      renderDirect();
    };
  });
}

// ============================================================
//  Выводы (заполняются вручную)
// ============================================================
const NOTES=[
  "В июле получили рост ×2 по количеству целевых действий по сравнению со средними показателями до подключения контекстной рекламы (среднее только с Яндекс Бизнесом = 306 ЦД, в июле получили 627 ЦД с сайта, лендинга и карт).",
  "Трафик сайта (включая лендинг имплантации) немного снизился по сравнению с июнем (посетители 5138 → 4846), но целевые действия почти удвоились: 332 → 576. На сайт пришла более целевая аудитория — при меньшем объёме трафика обращений кратно больше.",
  "Поведенческие метрики улучшились по мере оптимизации контекста: глубина просмотра выросла (2,16 → 2,33), отказы снизились (25% → 20%). Это подтверждает, что трафик нового канала становится качественнее.",
  "Яндекс Бизнес показал снижение стоимости привлечения: стоимость целевого действия 101 → 86 ₽ по сравнению с июнем, стоимость клиента 118 → 101 ₽ по сравнению с июнем. При этом действий больше (308 → 373), а конверсия в клиента выросла до 29,8%. Конверсия в целевого клиента из перехода с Яндекс Бизнеса показывает постоянную динамику к росту, что говорит об успешной оптимизации рекламы. Приём звонков в июле также заметно улучшился по сравнению с предыдущими месяцами — возможно, повлияли изменения в настройках телефонии на стороне клиники.",
  "Контекст: имплантация (РСЯ) — драйвер месяца: целевых действий втрое больше по сравнению с июнем (51 → 153) при стоимости заявки вдвое ниже (562 → 208 ₽). «Лечение во сне» на поиске выправилось — заявки стали на 41% дешевле, конверсия выросла вдвое. Брендовые запросы стабильно дают самый недорогой лид.",
];
function renderNotes(){
  document.getElementById("notes-list").innerHTML=NOTES.map(n=>`<li>${n}</li>`).join("");
}

// ---------- init ----------
document.addEventListener("DOMContentLoaded",()=>{
  block1(); block2(); block3();
  bindDirectPeriod(); renderDirect(); directCompare(); renderNotes();
});
