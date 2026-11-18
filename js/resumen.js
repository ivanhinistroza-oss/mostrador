let summaryQ="", summarySort="nombre", summaryDir=1, summaryAlertsExpanded=false;
// Con variantes, el producto pide reposición si alguna talla o color llegó a su mínimo (igual que en Inventario).
function summaryState(p){const n=totalStock(p),vs=p.variantes||[];if(n<=0)return "Agotado";return (vs.length?vs.some(v=>n2(v.stock)<=n2(v.minimo??p.minimo)):n<=n2(p.minimo))?"Reponer":"OK";}
function renderHeatmap(ps){const items=ps.flatMap(p=>(p.variantes||[]).map(v=>v));if(!items.length)return "";const sizesOrder=["XXS","XS","S","M","L","XL","XXL","XXXL"],sizes=[...new Set(items.map(v=>String(v.talla||"Sin especificar").trim()||"Sin especificar"))].sort((a,b)=>{const x=sizesOrder.indexOf(a.toUpperCase()),y=sizesOrder.indexOf(b.toUpperCase());if(x>=0||y>=0)return(x<0?99:x)-(y<0?99:y);const n=Number(a),m=Number(b);return Number.isFinite(n)&&Number.isFinite(m)?n-m:a.localeCompare(b,"es",{sensitivity:"base"});}),colors=[...new Set(items.map(v=>String(v.color||"Sin especificar").trim()||"Sin especificar"))],matrix=new Map(),totals=new Map(colors.map(c=>[c,0]));items.forEach(v=>{const s=String(v.talla||"Sin especificar").trim()||"Sin especificar",c=String(v.color||"Sin especificar").trim()||"Sin especificar",k=s+"\u0000"+c,n=Math.max(0,n2(v.stock));matrix.set(k,(matrix.get(k)||0)+n);totals.set(c,totals.get(c)+n);});colors.sort((a,b)=>totals.get(b)-totals.get(a));const max=Math.max(1,...matrix.values()),grand=items.reduce((a,v)=>a+Math.max(0,n2(v.stock)),0),body=sizes.map(s=>{let sum=0;const cells=colors.map(c=>{const k=s+"\u0000"+c;if(!matrix.has(k))return `<td class="heat-missing">—</td>`;const n=matrix.get(k);sum+=n;if(!n)return `<td class="heat-cell heat-zero" title="${esc(s)} / ${esc(c)}: 0 und">0</td>`;const x=Math.round(12+n/max*73);return `<td class="heat-cell" style="background:color-mix(in srgb, var(--accent) ${x}%, var(--surface));color:${x>=52?"var(--accent-fg)":"var(--fg)"}" title="${esc(s)} / ${esc(c)}: ${qty(n)} und">${qty(n)}</td>`;}).join("");return `<tr><th>${esc(s)}</th>${cells}<td class="heat-cell heat-total">${qty(sum)}</td></tr>`;}).join("");return `<section class="dash-card dash-wide"><div class="dash-heading"><h2>Stock por talla y color</h2></div><div class="heat-wrap"><table class="heat-table"><thead><tr><th>Talla</th>${colors.map(c=>`<th>${esc(c)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${body}<tr><th class="heat-total">Total</th>${colors.map(c=>`<td class="heat-cell heat-total">${qty(totals.get(c))}</td>`).join("")}<td class="heat-cell heat-total">${qty(grand)}</td></tr></tbody></table></div><div class="heat-legend"><span>menos</span>${[12,30,48,66,85].map(x=>`<span class="heat-swatch" style="background:color-mix(in srgb, var(--accent) ${x}%, var(--surface))"></span>`).join("")}<span>más</span><span class="heat-swatch heat-zero"></span><span>0 = agotado</span></div></section>`;}
function summarySvg(title,subtitle,data,options={}){
  const max=Math.max(1,...data.map(d=>d.value));
  const rows=data.map((d,i)=>{const label=options.ranked?`<span class="rank">${i+1}.</span>${esc(d.label)}`:esc(d.label),pct=options.percent&&options.total?Math.round(d.value/options.total*100):null,detail=pct===null?`${qty(d.value)} und`:`${qty(d.value)} · ${pct} %`,tip=`${d.label}: ${qty(d.value)} und${pct===null?"":` (${pct} %)`}`;return `<div class="bar-row"><span class="bar-label" title="${esc(d.label)}">${label}</span><span class="bar-track"><span class="bar" style="width:calc((100% - 7.5em) * ${(Math.max(0,d.value)/max).toFixed(4)})" title="${esc(tip)}"></span><span class="bar-val num">${detail}</span></span></div>`;}).join("");
  return `<section class="dash-card"><div class="dash-heading"><h2>${esc(title)}</h2><span class="dash-subtitle">${esc(subtitle)}</span></div>${rows?`<div class="bars">${rows}</div>`:`<p class="muted">Sin datos para mostrar.</p>`}</section>`;
}
function renderResumen(){if(!exigir("estadisticas.ver","ver estadísticas"))return;const el=$("#v-resumen"),ps=S.products,units=ps.reduce((a,p)=>a+Math.max(0,totalStock(p)),0),value=ps.reduce((a,p)=>a+(p.variantes&&p.variantes.length?p.variantes.reduce((b,v)=>b+Math.max(0,n2(v.stock))*n2(v.precio??p.precio),0):Math.max(0,n2(p.stock))*n2(p.precio)),0),variants=ps.reduce((a,p)=>a+(p.variantes||[]).length,0),cats=new Map();ps.forEach(p=>{const k=(p.categoria||"").trim()||"Sin categoría";cats.set(k,(cats.get(k)||0)+Math.max(0,totalStock(p)));});const catData=[...cats].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value),top=[...ps].sort((a,b)=>totalStock(b)-totalStock(a)).slice(0,10).map(p=>({label:p.nombre,value:Math.max(0,totalStock(p))})),low=ps.filter(p=>summaryState(p)==="Reponer"),out=ps.filter(p=>summaryState(p)==="Agotado"),alerts=[];ps.forEach(p=>{const vs=p.variantes||[];if(vs.length)vs.forEach(v=>{const stock=Math.max(0,n2(v.stock)),minimum=n2(v.minimo??p.minimo),state=stock<=0?"Agotado":stock<=minimum?"Reponer":"OK";if(state!=="OK")alerts.push({p,v,stock,minimum,state,ratio:minimum?stock/minimum:0});});else if(summaryState(p)!=="OK")alerts.push({p,v:null,stock:Math.max(0,n2(p.stock)),minimum:n2(p.minimo),state:summaryState(p),ratio:n2(p.minimo)?n2(p.stock)/n2(p.minimo):0});});alerts.sort((a,b)=>(a.state==="Agotado"?0:1)-(b.state==="Agotado"?0:1)||a.ratio-b.ratio);const shown=(summaryAlertsExpanded?alerts:alerts.slice(0,8)).map(a=>`<div class="alert-row"><span class="chip ${a.state==="Agotado"?"out":"low"}">${a.state}</span><span class="alert-name">${esc(a.p.nombre)}${a.v?` – ${esc([a.v.talla,a.v.color].filter(Boolean).join(" / "))}`:""}</span><span class="alert-stock num">stock ${qty(a.stock)} / mín. ${qty(a.minimum)}</span></div>`).join("");const q=norm(summaryQ),rows=ps.filter(p=>!q||norm([p.nombre,p.categoria,p.codigo,...(p.variantes||[]).flatMap(v=>[v.talla,v.color,v.codigo])].join(" ")).includes(q));rows.sort((a,b)=>{let x,y;switch(summarySort){case"categoria":x=a.categoria||"";y=b.categoria||"";break;case"codigo":x=a.codigo||"";y=b.codigo||"";break;case"precio":x=n2(a.precio);y=n2(b.precio);break;case"stock":x=totalStock(a);y=totalStock(b);break;case"estado":x=summaryState(a);y=summaryState(b);break;default:x=a.nombre||"";y=b.nombre||"";}return(typeof x==="number"?x-y:String(x).localeCompare(String(y),"es"))*summaryDir;});const focus=document.activeElement&&document.activeElement.id,maxStock=Math.max(1,...ps.map(p=>totalStock(p)));el.innerHTML=`<div class="toolbar"><h1 style="margin-right:auto">Resumen</h1></div><div class="summary-stats"><div class="summary-stat"><span class="summary-stat-label">Productos</span><b class="summary-stat-value">${ps.length}</b><span class="summary-stat-context">${variants} variantes</span></div><div class="summary-stat"><span class="summary-stat-label">Unidades en stock</span><b class="summary-stat-value">${qty(units)}</b><span class="summary-stat-context">en ${new Set(ps.map(p=>p.categoria||"Sin categoría")).size} categorías</span></div><div class="summary-stat"><span class="summary-stat-label">Valor del inventario</span><b class="summary-stat-value">${money(value)}</b><span class="summary-stat-context">a precio de venta</span></div><div class="summary-stat ${low.length+out.length?"warn":""}"><span class="summary-stat-label">Por reponer</span><b class="summary-stat-value">${low.length+out.length}</b><span class="summary-stat-context" style="${out.length?"color:var(--bad)":""}">${out.length} agotados</span></div></div><section class="dash-card dash-wide"><div class="dash-heading"><h2>Alertas de stock</h2></div>${alerts.length?`<div class="summary-alerts">${shown}</div>${alerts.length>8?`<button class="btn ghost alert-more" id="summaryAlertsToggle">${summaryAlertsExpanded?"Ver menos":`Ver todas (${alerts.length})`}</button>`:""}`:`<p class="muted">Todo en orden: ningún producto por reponer.</p>`}</section><div class="dash-grid">${summarySvg("Stock por categoría","unidades",catData,{percent:true,total:units})}${summarySvg("Productos con más stock","top 10, unidades",top,{ranked:true})}</div>${renderHeatmap(ps)}<div class="toolbar"><h2 style="margin-right:auto">Todos los productos</h2><input class="grow" type="search" id="summarySearch" placeholder="Buscar por nombre, categoría, código o variante" value="${esc(summaryQ)}"></div>${rows.length>100?`<p class="muted">Se muestran 100 de ${rows.length} productos. Busca o usa los encabezados para ordenar.</p>`:""}<div class="summary-table-wrap"><table class="summary-table"><thead><tr>${[["nombre","Nombre"],["categoria","Categoría"],["codigo","Código"],["precio","Precio"],["stock","Stock total"],["estado","Estado"]].map(([k,t])=>`<th><button data-sort="${k}">${t}${summarySort===k?(summaryDir===1?" ↑":" ↓"):""}</button></th>`).join("")}</tr></thead><tbody>${rows.slice(0,100).map(p=>{const st=summaryState(p),vs=p.variantes||[],stock=Math.max(0,totalStock(p));return `<tr><td>${vs.length?`<details><summary>${esc(p.nombre)}</summary><div class="variant-detail">${vs.map(v=>`${esc([v.talla,v.color].filter(Boolean).join(" / ")||"Variante")}: <b>${qty(v.stock)}</b>`).join(" · ")}</div></details>`:esc(p.nombre)}</td><td>${esc(p.categoria||"—")}</td><td>${esc(p.codigo||"—")}</td><td class="num">${money(p.precio)}</td><td class="num"><span class="table-stock"><span>${qty(stock)} ${esc(p.unidad||"und")}</span><span class="table-stock-bar" style="width:${(stock/maxStock*60).toFixed(1)}px"></span></span></td><td><span class="chip ${st==="Agotado"?"out":st==="Reponer"?"low":""}">${st}</span></td></tr>`}).join("")||`<tr><td colspan="6" class="muted">${ps.length?"Ningún producto coincide.":"Aún no hay productos."}</td></tr>`}</tbody></table></div>`;if(focus==="summarySearch"){const i=$("#summarySearch");i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
$("#v-resumen").addEventListener("input",e=>{if(e.target.id==="summarySearch"){summaryQ=e.target.value;renderResumen();}});
$("#v-resumen").addEventListener("click",e=>{if(e.target.closest("#summaryAlertsToggle")){summaryAlertsExpanded=!summaryAlertsExpanded;return renderResumen();}const b=e.target.closest("[data-sort]");if(!b)return;if(summarySort===b.dataset.sort)summaryDir*=-1;else{summarySort=b.dataset.sort;summaryDir=1;}renderResumen();});

// ---- Resumen con diseño nuevo (solo en el Mostrador con Cimiento; lo agrega preparar.mjs) ----
// Reemplaza summarySvg y renderResumen del original. Usa los mismos datos, ids (summarySearch,
// summaryAlertsToggle) y data-sort, así que los eventos del original siguen funcionando.
const RS_ICON = {
  caja: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  pila: '<path d="M4 18h16"/><path d="M6 14h12"/><path d="M8 10h8"/><path d="M10 6h4"/>',
  plata: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5v5M17 9.5v5"/>',
  alerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
};
function rsIcon(n) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${RS_ICON[n]}</svg>`; }

function summarySvg(title, subtitle, data, options = {}) {
  const max = Math.max(1, ...data.map(d => d.value));
  const rows = data.map((d, i) => {
    const pct = options.percent && options.total ? Math.round(d.value / options.total * 100) : null;
    const detail = pct === null ? `${qty(d.value)} und` : `${qty(d.value)} · ${pct} %`;
    const w = (Math.max(0, d.value) / max * 100).toFixed(2);
    return `<div class="rs-bar-row" title="${esc(`${d.label}: ${detail}`)}">
      <span class="rs-bar-label">${options.ranked ? `<span class="rs-rank">${i + 1}</span>` : ""}<span class="rs-bar-name">${esc(d.label)}</span></span>
      <span class="rs-bar-val num">${detail}</span>
      <span class="rs-bar-track"><span class="rs-bar" style="width:${w}%"></span></span>
    </div>`;
  }).join("");
  return `<section class="dash-card rs-card"><div class="dash-heading"><h2>${esc(title)}</h2><span class="dash-subtitle">${esc(subtitle)}</span></div>${rows ? `<div class="rs-bars">${rows}</div>` : `<p class="muted">Sin datos para mostrar.</p>`}</section>`;
}

// Gráfico de anillo para las categorías: las 5 más grandes con su color y el resto junto en "Otras".
function rsDonut(data, total) {
  if (!total) return `<section class="dash-card rs-card"><div class="dash-heading"><h2>Stock por categoría</h2></div><p class="muted">Sin datos para mostrar.</p></section>`;
  const top = data.slice(0, 5), rest = data.slice(5).reduce((a, d) => a + d.value, 0);
  const parts = rest ? [...top, { label: "Otras", value: rest, otras: true }] : top;
  const colors = ["var(--rs-c1)", "var(--rs-c2)", "var(--rs-c3)", "var(--rs-c4)", "var(--rs-c5)", "var(--rs-c6)"];
  const R = 15.915, C = 100;
  let off = 0;
  const arcs = parts.map((d, i) => {
    const len = d.value / total * C, gap = parts.length > 1 && len > 1.2 ? 0.6 : 0;
    const arc = `<circle r="${R}" cx="21" cy="21" fill="none" stroke="${colors[i]}" stroke-width="6" stroke-dasharray="${(len - gap).toFixed(3)} ${(C - len + gap).toFixed(3)}" stroke-dashoffset="${(25 - off).toFixed(3)}"><title>${esc(d.label)}: ${qty(d.value)} und</title></circle>`;
    off += len;
    return arc;
  }).join("");
  const legend = parts.map((d, i) => `<li><i style="background:${colors[i]}"></i><span class="rs-leg-name">${esc(d.label)}</span><span class="rs-leg-val num">${qty(d.value)}</span><span class="rs-leg-pct num">${Math.round(d.value / total * 100)} %</span></li>`).join("");
  return `<section class="dash-card rs-card"><div class="dash-heading"><h2>Stock por categoría</h2><span class="dash-subtitle">unidades</span></div>
    <div class="rs-donut"><div class="rs-donut-chart"><svg viewBox="0 0 42 42"><circle r="${R}" cx="21" cy="21" fill="none" stroke="var(--surface-2)" stroke-width="6"/>${arcs}</svg><div class="rs-donut-center"><b class="num">${qty(total)}</b><span>unidades</span></div></div><ul class="rs-legend">${legend}</ul></div></section>`;
}

function renderResumen() {
  if (!exigir("estadisticas.ver", "ver estadísticas")) return;
  const el = $("#v-resumen"), ps = S.products;
  const units = ps.reduce((a, p) => a + Math.max(0, totalStock(p)), 0);
  const value = ps.reduce((a, p) => a + (p.variantes && p.variantes.length ? p.variantes.reduce((b, v) => b + Math.max(0, n2(v.stock)) * n2(v.precio ?? p.precio), 0) : Math.max(0, n2(p.stock)) * n2(p.precio)), 0);
  const variants = ps.reduce((a, p) => a + (p.variantes || []).length, 0);
  const cats = new Map();
  ps.forEach(p => { const k = (p.categoria || "").trim() || "Sin categoría"; cats.set(k, (cats.get(k) || 0) + Math.max(0, totalStock(p))); });
  const catData = [...cats].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const top = [...ps].sort((a, b) => totalStock(b) - totalStock(a)).slice(0, 10).map(p => ({ label: p.nombre, value: Math.max(0, totalStock(p)) }));
  const low = ps.filter(p => summaryState(p) === "Reponer"), out = ps.filter(p => summaryState(p) === "Agotado");
  const okCount = ps.length - low.length - out.length;
  const health = ps.length ? Math.round(okCount / ps.length * 100) : 100;

  const alerts = [];
  ps.forEach(p => {
    const vs = p.variantes || [];
    if (vs.length) vs.forEach(v => { const stock = Math.max(0, n2(v.stock)), minimum = n2(v.minimo ?? p.minimo), state = stock <= 0 ? "Agotado" : stock <= minimum ? "Reponer" : "OK"; if (state !== "OK") alerts.push({ p, v, stock, minimum, state, ratio: minimum ? stock / minimum : 0 }); });
    else if (summaryState(p) !== "OK") alerts.push({ p, v: null, stock: Math.max(0, n2(p.stock)), minimum: n2(p.minimo), state: summaryState(p), ratio: n2(p.minimo) ? n2(p.stock) / n2(p.minimo) : 0 });
  });
  alerts.sort((a, b) => (a.state === "Agotado" ? 0 : 1) - (b.state === "Agotado" ? 0 : 1) || a.ratio - b.ratio);
  const shown = (summaryAlertsExpanded ? alerts : alerts.slice(0, 8)).map(a => {
    const fill = a.minimum ? Math.min(100, a.stock / a.minimum * 100) : 0, cls = a.state === "Agotado" ? "out" : "low";
    return `<div class="rs-alert ${cls}">
      <span class="rs-alert-dot"></span>
      <span class="rs-alert-main"><span class="rs-alert-name">${esc(a.p.nombre)}</span>${a.v ? `<span class="rs-alert-var">${esc([a.v.talla, a.v.color].filter(Boolean).join(" / "))}</span>` : ""}</span>
      <span class="rs-alert-meter" title="Stock ${qty(a.stock)} de un mínimo de ${qty(a.minimum)}"><span style="width:${fill.toFixed(1)}%"></span></span>
      <span class="rs-alert-stock num"><b>${qty(a.stock)}</b> / mín. ${qty(a.minimum)}</span>
      <span class="chip ${cls}">${a.state}</span>
    </div>`;
  }).join("");

  const q = norm(summaryQ);
  const rows = ps.filter(p => !q || norm([p.nombre, p.categoria, p.codigo, ...(p.variantes || []).flatMap(v => [v.talla, v.color, v.codigo])].join(" ")).includes(q));
  rows.sort((a, b) => {
    let x, y;
    switch (summarySort) {
      case "categoria": x = a.categoria || ""; y = b.categoria || ""; break;
      case "codigo": x = a.codigo || ""; y = b.codigo || ""; break;
      case "precio": x = n2(a.precio); y = n2(b.precio); break;
      case "stock": x = totalStock(a); y = totalStock(b); break;
      case "estado": x = summaryState(a); y = summaryState(b); break;
      default: x = a.nombre || ""; y = b.nombre || "";
    }
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "es")) * summaryDir;
  });
  const focus = document.activeElement && document.activeElement.id;
  const maxStock = Math.max(1, ...ps.map(p => totalStock(p)));
  const nCats = new Set(ps.map(p => p.categoria || "Sin categoría")).size;
  const hoy = new Date().toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

  const stat = (cls, icon, label, val, ctx) => `<div class="summary-stat rs-stat ${cls}"><span class="rs-stat-icon">${rsIcon(icon)}</span><div class="rs-stat-body"><span class="summary-stat-label">${label}</span><b class="summary-stat-value">${val}</b><span class="summary-stat-context">${ctx}</span></div></div>`;
  const pend = low.length + out.length;

  el.innerHTML = `<div class="rs">
  <div class="rs-head"><div><h1>Resumen</h1><p class="rs-sub">Cómo está tu inventario · <span class="rs-date">${esc(hoy)}</span></p></div></div>
  <div class="summary-stats">
    ${stat("rs-a", "caja", "Productos", ps.length, `${variants} variantes`)}
    ${stat("rs-b", "pila", "Unidades en stock", qty(units), `en ${nCats} categorías`)}
    ${stat("rs-c", "plata", "Valor del inventario", money(value), "a precio de venta")}
    ${stat(pend ? "rs-d warn" : "rs-e", pend ? "alerta" : "ok", "Por reponer", pend, pend ? `<span class="rs-split"><span class="rs-split-out">${out.length} agotados</span> · ${low.length} bajo mínimo</span>` : "todo en orden")}
  </div>
  <section class="dash-card rs-health"><div class="rs-health-top"><span><b>${health} %</b> de tus productos tiene stock suficiente</span><span class="muted">${okCount} bien · ${low.length} bajo mínimo · ${out.length} agotados</span></div>
    <div class="rs-health-bar" role="img" aria-label="${okCount} bien, ${low.length} bajo mínimo, ${out.length} agotados">${ps.length ? `<span class="ok" style="flex:${okCount}"></span><span class="low" style="flex:${low.length}"></span><span class="out" style="flex:${out.length}"></span>` : `<span class="ok" style="flex:1"></span>`}</div></section>
  <section class="dash-card dash-wide rs-card"><div class="dash-heading rs-heading-row"><h2>Alertas de stock</h2>${alerts.length ? `<span class="rs-count">${alerts.length}</span>` : ""}</div>${alerts.length ? `<div class="rs-alerts">${shown}</div>${alerts.length > 8 ? `<button class="btn ghost alert-more" id="summaryAlertsToggle">${summaryAlertsExpanded ? "Ver menos" : `Ver todas (${alerts.length})`}</button>` : ""}` : `<div class="rs-empty">${rsIcon("ok")}<span>Todo en orden: ningún producto por reponer.</span></div>`}</section>
  <div class="dash-grid">${rsDonut(catData, units)}${summarySvg("Productos con más stock", "top 10, unidades", top, { ranked: true })}</div>
  ${renderHeatmap(ps)}
  <div class="toolbar rs-table-head"><h2 style="margin-right:auto">Todos los productos <span class="rs-count">${rows.length}</span></h2><input class="grow" type="search" id="summarySearch" placeholder="Buscar por nombre, categoría, código o variante" value="${esc(summaryQ)}"></div>
  ${rows.length > 100 ? `<p class="muted">Se muestran 100 de ${rows.length} productos. Busca o usa los encabezados para ordenar.</p>` : ""}
  <div class="summary-table-wrap"><table class="summary-table"><thead><tr>${[["nombre", "Nombre"], ["categoria", "Categoría"], ["codigo", "Código"], ["precio", "Precio"], ["stock", "Stock total"], ["estado", "Estado"]].map(([k, t]) => `<th class="${k === "precio" || k === "stock" ? "num" : ""}"><button data-sort="${k}" class="${summarySort === k ? "on" : ""}">${t}${summarySort === k ? (summaryDir === 1 ? " ↑" : " ↓") : ""}</button></th>`).join("")}</tr></thead><tbody>${rows.slice(0, 100).map(p => {
    const st = summaryState(p), vs = p.variantes || [], stock = Math.max(0, totalStock(p)), cls = st === "Agotado" ? "out" : st === "Reponer" ? "low" : "ok";
    return `<tr><td>${vs.length ? `<details><summary>${esc(p.nombre)} <span class="rs-var-n">${vs.length} var.</span></summary><div class="variant-detail">${vs.map(v => `${esc([v.talla, v.color].filter(Boolean).join(" / ") || "Variante")}: <b>${qty(v.stock)}</b>`).join(" · ")}</div></details>` : esc(p.nombre)}</td><td>${p.categoria ? `<span class="rs-cat">${esc(p.categoria)}</span>` : `<span class="muted">—</span>`}</td><td class="rs-code">${esc(p.codigo || "—")}</td><td class="num">${money(p.precio)}</td><td class="num"><span class="rs-stock"><span>${qty(stock)} ${esc(p.unidad || "und")}</span><span class="rs-stock-track"><span class="${cls}" style="width:${(stock / maxStock * 100).toFixed(1)}%"></span></span></span></td><td><span class="chip ${cls === "ok" ? "" : cls}">${st}</span></td></tr>`;
  }).join("") || `<tr><td colspan="6" class="muted">${ps.length ? "Ningún producto coincide." : "Aún no hay productos."}</td></tr>`}</tbody></table></div>
</div>`;
  if (focus === "summarySearch") { const i = $("#summarySearch"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
