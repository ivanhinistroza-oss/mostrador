import { CIMIENTO_URL } from "../cimiento-sdk/config.js";
const root=document.querySelector("#portal"), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=s=>{const d=new Date(s);return isNaN(d)?"":d.toLocaleDateString("es-PE",{day:"2-digit",month:"long",year:"numeric"})};
const statusColor=s=>s==="Entregado"?"background:var(--accent-soft);color:var(--accent)":s==="Cancelado"||s==="Con incidencia"||s==="Retrasado"?"background:var(--bad-soft);color:var(--bad)":"";
async function sha256(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");}
function showError(){root.innerHTML=`<div class="portal-head"><span class="portal-mark">M</span><div><b>Mostrador</b><small>Seguimiento de pedidos</small></div></div><section class="portal-card portal-error"><h1>No encontramos este pedido</h1><p class="muted">Revisa que el enlace esté completo o solicita uno nuevo en la tienda.</p></section><p class="portal-foot">Mostrador · seguimiento privado</p>`;}
async function load(){
  const token=new URLSearchParams(location.hash.slice(1)).get("token");if(!token||token.length<35)return showError();
  try{
    const token_hash=await sha256(token),res=await fetch(`${CIMIENTO_URL}/rest/v1/rpc/pedido_publico`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token_hash})});
    if(!res.ok)throw new Error();const p=await res.json();if(!p||!p.codigo) return showError();
    const events=(p.eventos||[]).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
    const logo=/^(data:image\/|https:\/\/)/.test(p.logo||"")?`<img class="portal-logo" src="${esc(p.logo)}" alt="">`:`<span class="portal-mark">${esc((p.tienda||"M").trim().charAt(0).toUpperCase())}</span>`;
    if(p.tienda)document.title=`Seguimiento de pedido · ${p.tienda}`;
    root.innerHTML=`<div class="portal-head">${logo}<div><b>${esc(p.tienda||"Mostrador")}</b><small>Seguimiento de pedidos</small></div></div>
      <section class="portal-card"><div class="portal-title"><h1>Pedido ${esc(p.codigo)}</h1><span class="portal-status" style="${statusColor(p.estado)}">${esc(p.estado)}</span></div><div class="portal-meta"><div><small>Entrega estimada</small><b>${p.fechaEstimada?date(p.fechaEstimada+"T12:00:00"):"Pendiente de confirmar"}</b></div><div><small>Modalidad de entrega</small><b>${esc(p.modalidadEntrega||"Por coordinar")}</b></div></div></section>
      <section class="portal-card"><h2>Productos del pedido</h2><div class="portal-lines">${(p.items||[]).map(i=>`<div class="portal-line"><span><b>${esc(i.nombre)}</b><small>${esc([i.talla,i.color].filter(Boolean).join(" · ")||i.unidad||"")}</small></span><b>${esc(i.cant)} ${esc(i.unidad||"und")}</b></div>`).join("")||"<p class=muted>Sin productos registrados.</p>"}</div></section>
      <section class="portal-card"><h2>Etapas del pedido</h2><div class="portal-timeline">${events.map(e=>`<div class="portal-step"><i></i><div><b>${esc(e.estado||"Actualización")}</b><small>${esc(e.detalle||"")} · ${date(e.fecha)}${e.fecha?" · "+new Date(e.fecha).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}):""}</small></div></div>`).join("")||"<p class=muted>Aún no hay etapas registradas.</p>"}</div></section>
      <section class="portal-card"><h2>Fotos compartidas por la tienda</h2><div class="portal-photos">${(p.fotos||[]).map(f=>`<figure><img src="${esc(f.imagen)}" alt="${esc(f.titulo||"Foto del pedido")}"><figcaption>${esc(f.titulo||"Foto del pedido")}</figcaption></figure>`).join("")||"<p class=muted>La tienda todavía no ha publicado fotos.</p>"}</div></section><p class="portal-foot">El enlace de seguimiento es privado. Compártelo solo con quien corresponda.</p>`;
  }catch{showError();}
}
load();
