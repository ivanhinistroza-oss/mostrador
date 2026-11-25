const PEDIDO_ESTADOS = ["Recibido", "Confirmado", "En producción", "En preparación", "Control de calidad", "Con incidencia", "Retrasado", "Listo para entregar", "Enviado", "Entregado", "Cancelado"];
let pedidoQ = "", pedidoEstadoFiltro = "", pedidoFechaFiltro = "", pedidoSeleccionado = null, pedidoEventos = [], pedidoFotos = [], pedidoLineasDraft = [];
let pedidoRelacionToken = 0, pedidosBlocked = false;
const estadoClase = e => e === "Entregado" ? "ok" : e === "Cancelado" || e === "Con incidencia" || e === "Retrasado" ? "bad" : e === "Listo para entregar" || e === "En preparación" || e === "En producción" || e === "Control de calidad" ? "info" : "warn";
const pedidoTelefonoWhatsApp = value => { const digits=String(value||"").replace(/\D/g,""); return digits.length===9?"51"+digits:digits; };
const pedidoPortalUrl = p => new URL("./pedido.html#token=" + encodeURIComponent(p.token || ""), location.href).href;
function pedidoHtmlSafe(texto) { return esc(texto); }
function pedidosFiltrados() {
  const q = norm(pedidoQ), palabras = palabrasDe(q);
  return [...S.pedidos].filter(p => {
    const t = norm([p.codigo, p.cliente, p.celular].join(" "));
    return tieneTodas(t, palabras) && (!pedidoEstadoFiltro || p.estado === pedidoEstadoFiltro) &&
      (!pedidoFechaFiltro || String(p.creadoEn || "").slice(0, 10) === pedidoFechaFiltro);
  }).sort((a, b) => String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")));
}
function renderPedidos() {
  const root = $("#v-pedidos"); if (!root) return;
  const rows = pedidosFiltrados();
  const count = estado => S.pedidos.filter(p => p.estado === estado).length;
  const pending = count("Recibido") + count("Confirmado");
  root.innerHTML = `<div class="rv pedidos-view">
    <div class="rv-head"><div><h1>Pedidos</h1><p class="rv-sub">Seguimiento de pedidos y entregas de la tienda</p></div><button class="btn primary" id="pedido-nuevo">＋ Nuevo pedido</button></div>
    <div class="summary-stats pedidos-stats">
      <article class="summary-stat"><span class="summary-stat-label">Total de pedidos</span><b class="summary-stat-value">${S.pedidos.length}</b><span class="summary-stat-context">Registrados en la tienda</span></article>
      <article class="summary-stat warn"><span class="summary-stat-label">Pendientes</span><b class="summary-stat-value">${pending}</b><span class="summary-stat-context">Recibidos o por confirmar</span></article>
      <article class="summary-stat pedido-stat-blue"><span class="summary-stat-label">En preparación</span><b class="summary-stat-value">${count("En preparación") + count("En producción") + count("Control de calidad")}</b><span class="summary-stat-context">En proceso de armado</span></article>
      <article class="summary-stat pedido-stat-green"><span class="summary-stat-label">Listos para entregar</span><b class="summary-stat-value">${count("Listo para entregar")}</b><span class="summary-stat-context">A la espera del cliente</span></article>
    </div>
    <div class="dash-card pedidos-toolbar"><label class="pedido-search"><span class="sr-only">Buscar pedido por código o cliente</span><input id="pedido-q" type="search" value="${esc(pedidoQ)}" placeholder="Buscar por código o cliente…" autocomplete="off"></label>
      <select id="pedido-f-estado" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${PEDIDO_ESTADOS.map(e => `<option ${pedidoEstadoFiltro === e ? "selected" : ""}>${e}</option>`).join("")}</select>
      <label class="pedido-date"><span>Fecha</span><input id="pedido-f-fecha" type="date" value="${esc(pedidoFechaFiltro)}"></label>
    </div>
    ${pedidosBlocked ? `<div class="dash-card pedidos-empty"><b>Falta habilitar Pedidos en Cimiento</b><p>Aplica la migración <code>002_pedidos.sql</code> para habilitar el guardado seguro y el seguimiento público.</p></div>` : ""}
    <div class="summary-table-wrap pedidos-table-wrap"><table class="summary-table sales-table pedidos-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Productos</th><th>Entrega</th><th>Fecha estimada</th><th>Estado</th><th></th></tr></thead><tbody>
      ${rows.length ? rows.map(p => `<tr data-pedido-open="${esc(p.id)}"><td><b>${esc(p.codigo)}</b><small class="pedido-created">${fmtDate(p.creadoEn)}</small></td><td>${esc(p.cliente)}<small class="pedido-created">${esc(p.celular)}</small></td><td>${(p.items || []).length} ${(p.items || []).length === 1 ? "producto" : "productos"}</td><td>${esc(p.modalidadEntrega || "—")}</td><td>${p.fechaEstimada ? new Date(p.fechaEstimada + "T12:00:00").toLocaleDateString("es-PE") : "—"}</td><td><span class="pedido-status ${estadoClase(p.estado)}">${esc(p.estado)}</span></td><td><button class="btn ghost pedido-open-btn" data-pedido-open="${esc(p.id)}">Ver</button></td></tr>`).join("") : `<tr><td colspan="7"><div class="pedidos-empty">${S.pedidos.length ? "No hay pedidos que coincidan con estos filtros." : "Todavía no hay pedidos. Registra el primero para empezar a seguirlo."}</div></td></tr>`}
    </tbody></table></div>
  </div>`;
  $("#pedido-nuevo").onclick = () => abrirNuevoPedido();
  $("#pedido-q").oninput = e => { pedidoQ = e.target.value; const pos=e.target.selectionStart; renderPedidos(); $("#pedido-q").focus(); $("#pedido-q").setSelectionRange(pos,pos); };
  $("#pedido-f-estado").onchange = e => { pedidoEstadoFiltro = e.target.value; renderPedidos(); };
  $("#pedido-f-fecha").onchange = e => { pedidoFechaFiltro = e.target.value; renderPedidos(); };
  root.onclick = e => { const b=e.target.closest("[data-pedido-open]"); if (b) verPedido(b.dataset.pedidoOpen); };
}
function pedidoDialogo(id, titulo, html, clase = "") {
  let d = document.getElementById(id);
  if (!d) { d = document.createElement("dialog"); d.id=id; d.className="pedido-dialog"; document.body.append(d); }
  d.className = "pedido-dialog " + clase;
  d.innerHTML = `<div class="pedido-dialog-head"><h2>${titulo}</h2><button type="button" class="btn ghost" data-pedido-close aria-label="Cerrar">✕</button></div>${html}`;
  d.querySelector("[data-pedido-close]").onclick = () => d.close();
  d.onclick = e => { if (e.target === d) d.close(); };
  if (!d.open) d.showModal();
  return d;
}
const pedidoCodigo = () => "PED-" + new Date().toISOString().slice(2,10).replaceAll("-", "") + "-" + uid().toUpperCase().slice(-5);
function abrirNuevoPedido(edit = null) {
  if (edit ? !exigir("pedido.editar", "editar pedidos") : !exigir("pedido.crear", "crear pedidos")) return;
  pedidoLineasDraft = edit ? (edit.items || []).map(x => ({ ...x })) : [];
  const val = k => esc(edit?.[k] || "");
  const modalidades = ["Recojo en tienda", "Envío a domicilio", "Recojo coordinado"];
  if (edit?.modalidadEntrega && !modalidades.includes(edit.modalidadEntrega)) modalidades.push(edit.modalidadEntrega);
  const products = [...S.products].sort((a,b) => ordenEs.compare(a.nombre,b.nombre));
  const options = products.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}${p.variantes?.length ? " · con tallas y colores" : ""}</option>`).join("");
  const d = pedidoDialogo("pedido-nuevo-dialog", edit ? `Editar pedido ${esc(edit.codigo)}` : "Nuevo pedido", `<form id="pedido-form" class="pedido-form">
    <div class="pedido-form-grid"><label class="f"><span>Nombre del cliente</span><input name="cliente" autocomplete="name" required maxlength="120" placeholder="Nombre y apellido" value="${val("cliente")}"></label><label class="f"><span>Celular / WhatsApp</span><input name="celular" type="tel" autocomplete="tel" required maxlength="24" placeholder="Ej. 987 654 321" value="${val("celular")}"></label></div>
    <div class="pedido-product-picker"><label class="f"><span>Producto</span><select id="pedido-producto"><option value="">Selecciona un producto</option>${options}</select></label><label class="f"><span>Talla y color</span><select id="pedido-variante" disabled><option value="">Selecciona una combinación</option></select></label><label class="f pedido-cantidad"><span>Cantidad</span><input id="pedido-cantidad" type="number" min="1" step="1" value="1" inputmode="numeric"></label><button type="button" id="pedido-agregar-linea" class="btn">Agregar</button></div>
    <div id="pedido-lineas" class="pedido-lines"><p class="muted">Agrega uno o varios productos al pedido.</p></div>
    <div class="pedido-form-grid"><label class="f"><span>Modalidad de entrega</span><select name="modalidadEntrega">${modalidades.map(m => `<option ${edit?.modalidadEntrega === m ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></label><label class="f"><span>Fecha estimada de entrega</span><input name="fechaEstimada" type="date" required ${edit ? `value="${val("fechaEstimada")}"` : `min="${new Date().toISOString().slice(0,10)}"`}></label></div>
    <label class="f"><span>Observaciones</span><textarea name="observaciones" rows="3" maxlength="800" placeholder="Indicaciones del pedido">${val("observaciones")}</textarea></label><p class="warnline" id="pedido-form-error" role="alert" hidden></p>
    <div class="pedido-dialog-actions"><button type="button" class="btn ghost" data-pedido-close>Cancelar</button><button class="btn primary" type="submit">${edit ? "Guardar cambios" : "Guardar pedido"}</button></div>
  </form>`);
  d.querySelector('[data-pedido-close]:not(.pedido-dialog-head *)')?.addEventListener("click", () => d.close());
  const form = $("#pedido-form", d), productSel = $("#pedido-producto",d), variantSel=$("#pedido-variante",d);
  const renderLines = () => { $("#pedido-lineas",d).innerHTML = pedidoLineasDraft.length ? pedidoLineasDraft.map((x,i)=>`<div class="pedido-line"><span><b>${esc(x.nombre)}</b><small>${esc([x.talla,x.color].filter(Boolean).join(" · ") || x.unidad)}</small></span><label>Cant. <input type="number" min="1" step="1" value="${x.cant}" data-pedido-line-qty="${i}" aria-label="Cantidad para ${esc(x.nombre)}"></label><button type="button" class="btn ghost danger-text" data-pedido-line-remove="${i}">Quitar</button></div>`).join("") : `<p class="muted">Agrega uno o varios productos al pedido.</p>`; };
  productSel.onchange = () => {
    const p=S.products.find(x=>x.id===productSel.value); const variants=p?.variantes||[];
    variantSel.innerHTML = variants.length ? `<option value="">Selecciona talla y color</option>${variants.map(v=>`<option value="${esc(v.id)}">${esc([v.talla,v.color].filter(Boolean).join(" / ") || "Variante")} · stock ${qty(v.stock)}</option>`).join("")}` : `<option value="">Producto completo</option>`;
    variantSel.disabled = !variants.length;
  };
  $("#pedido-agregar-linea",d).onclick = () => {
    const p=S.products.find(x=>x.id===productSel.value); if(!p) return toast("Selecciona un producto.");
    const v=p.variantes?.length ? p.variantes.find(x=>x.id===variantSel.value) : null; if(p.variantes?.length&&!v) return toast("Selecciona la talla y el color.");
    const n=Math.max(1,Math.floor(n2($("#pedido-cantidad",d).value))); const item=itemFromProduct(p,v); item.cant=n;
    const ex=pedidoLineasDraft.find(x=>x.productId===item.productId&&x.variantId===item.variantId);
    if(ex) ex.cant+=n; else pedidoLineasDraft.push(item);
    $("#pedido-cantidad",d).value="1"; renderLines();
  };
  $("#pedido-lineas",d).onclick = e => { const b=e.target.closest("[data-pedido-line-remove]"); if(b){pedidoLineasDraft.splice(+b.dataset.pedidoLineRemove,1);renderLines();} };
  $("#pedido-lineas",d).onchange = e => { if(e.target.matches("[data-pedido-line-qty]")) pedidoLineasDraft[+e.target.dataset.pedidoLineQty].cant=Math.max(1,Math.floor(n2(e.target.value))); };
  form.onsubmit = async e => {
    e.preventDefault(); const err=$("#pedido-form-error",d); err.hidden=true;
    if(!(db&&fb?.F&&fb.negocioId)){err.textContent="Para guardar pedidos y activar el enlace privado, abre Mostrador conectado a Cimiento.";err.hidden=false;return;}
    if(!pedidoLineasDraft.length){err.textContent="Agrega al menos un producto.";err.hidden=false;return;}
    const fd=new FormData(form), save=form.querySelector('[type="submit"]'); save.disabled=true;
    if (edit) {
      try {
        const patch={cliente:String(fd.get("cliente")).trim(),celular:String(fd.get("celular")).trim(),items:pedidoLineasDraft.map(x=>({...x})),modalidadEntrega:String(fd.get("modalidadEntrega")),fechaEstimada:String(fd.get("fechaEstimada")),observaciones:String(fd.get("observaciones")||"").trim()};
        const ok=await pedidoEventoGuardar(edit,"Pedido editado",patch);
        if(ok){d.close();toast("Cambios guardados.");verPedido(edit.id);} else save.disabled=false;
      } catch(ex){ err.textContent=ex.message||"No se pudieron guardar los cambios.";err.hidden=false;save.disabled=false; }
      return;
    }
    try {
      const token=pedidoTokenNuevo(), now=new Date().toISOString(), id=uid()+uid();
      const actor=usuarioActual(), pedido={codigo:pedidoCodigo(),cliente:String(fd.get("cliente")).trim(),celular:String(fd.get("celular")).trim(),items:pedidoLineasDraft.map(x=>({...x})),modalidadEntrega:String(fd.get("modalidadEntrega")),fechaEstimada:String(fd.get("fechaEstimada")),observaciones:String(fd.get("observaciones")||"").trim(),estado:"Recibido",creadoEn:now,vendedorId:actor?.id||sessionId||"local",vendedorNombre:actor?.nombre||"Equipo",token,tokenHash:await pedidoSha256(token)};
      const evId=uid()+uid(), evento={pedidoId:id,codigo:pedido.codigo,estado:"Recibido",detalle:"Pedido recibido en tienda",fecha:now,actorId:pedido.vendedorId,actorNombre:pedido.vendedorNombre};
      if(db&&fb?.F&&fb.negocioId){
        const F=fb.F, batch=F.writeBatch(fb.fs), pref=F.doc(fb.fs,`negocios/${fb.negocioId}/pedidos/${id}`), eref=F.doc(fb.fs,`negocios/${fb.negocioId}/pedido_eventos/${evId}`);
        batch.set(pref,pedido); batch.set(eref,evento); await batch.commit();
      } else { const created={id,...pedido}; mem.pedidos.set(id,created); S.pedidos=[...mem.pedidos.values()]; syncMem(); S.pedidos=[...mem.pedidos.values()]; }
      d.close(); pedidoSeleccionado={id,...pedido}; pedidoEventos=[{id:evId,...evento}]; pedidoFotos=[]; renderPedidos(); verPedido(id); toast("Pedido guardado.");
    } catch(ex){ err.textContent=ex.message||"No se pudo guardar el pedido.";err.hidden=false;save.disabled=false; }
  };
}
function pedidoTokenNuevo(){const a=new Uint8Array(32);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");}
async function pedidoSha256(text){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function pedidoEventoGuardar(p, detalle, patch = {}) {
  if(!exigir("pedido.actualizar","actualizar pedidos")) return false;
  const now=new Date().toISOString(), user=usuarioActual(), eid=uid()+uid(), actorId=user?.id||sessionId||"local";
  const ev={pedidoId:p.id,codigo:p.codigo,estado:patch.estado||p.estado,detalle,fecha:now,actorId,actorNombre:user?.nombre||"Equipo"};
  if(db&&fb?.F&&fb.negocioId){const F=fb.F,b=F.writeBatch(fb.fs),pref=F.doc(fb.fs,`negocios/${fb.negocioId}/pedidos/${p.id}`),eref=F.doc(fb.fs,`negocios/${fb.negocioId}/pedido_eventos/${eid}`);b.update(pref,{...patch,modificadoEn:now,modificadoPorId:actorId,modificadoPorNombre:ev.actorNombre});b.set(eref,ev);await b.commit();}
  else {const updated={...p,...patch,modificadoEn:now};mem.pedidos.set(p.id,updated);S.pedidos=[...mem.pedidos.values()];syncMem();S.pedidos=[...mem.pedidos.values()];pedidoEventos.push({id:eid,...ev});}
  return true;
}
async function verPedido(id) {
  const p=S.pedidos.find(x=>x.id===id)||pedidoSeleccionado; if(!p)return;
  pedidoSeleccionado=p; const stamp=++pedidoRelacionToken; pedidoEventos=[];pedidoFotos=[];
  const d=pedidoDialogo("pedido-detalle-dialog",`${esc(p.codigo)} <span class="pedido-status ${estadoClase(p.estado)}">${esc(p.estado)}</span>`,`<div class="pedido-detail"><div class="pedido-detail-top"><div><span class="summary-stat-label">Cliente</span><b>${esc(p.cliente)}</b><a href="https://wa.me/${pedidoTelefonoWhatsApp(p.celular)}" target="_blank" rel="noreferrer">${esc(p.celular)}</a></div><div><span class="summary-stat-label">Entrega estimada</span><b>${p.fechaEstimada?new Date(p.fechaEstimada+"T12:00:00").toLocaleDateString("es-PE"):"Sin fecha"}</b><span>${esc(p.modalidadEntrega||"")}</span></div></div>
    <div class="pedido-detail-block"><h3>Productos</h3><div class="pedido-detail-lines">${(p.items||[]).map(x=>`<div><span><b>${esc(x.nombre)}</b><small>${esc([x.talla,x.color].filter(Boolean).join(" · ")||x.unidad)}</small></span><span class="pedido-qty">${qty(x.cant)} ${esc(x.unidad||"und")}</span></div>`).join("")}</div></div>
    ${p.observaciones?`<div class="pedido-detail-block"><h3>Observaciones</h3><p>${esc(p.observaciones)}</p></div>`:""}
    <div class="pedido-detail-block"><div class="pedido-section-heading"><h3>Avance del pedido</h3><span>${(pedidoEventos||[]).length} cambios</span></div><div id="pedido-historial" class="pedido-history"><span class="muted">Cargando historial…</span></div></div>
    <div class="pedido-detail-block"><div class="pedido-section-heading"><h3>Fotografías</h3><label class="btn pedido-photo-pick">＋ Agregar foto<input id="pedido-foto-file" type="file" accept="image/*" hidden></label></div><div id="pedido-fotos" class="pedido-photos"><span class="muted">Cargando fotos…</span></div></div>
    <div class="pedido-share"><a class="btn" target="_blank" rel="noreferrer" href="https://wa.me/${pedidoTelefonoWhatsApp(p.celular)}?text=${encodeURIComponent(`Hola ${p.cliente}, sigue tu pedido ${p.codigo} aquí: ${pedidoPortalUrl(p)}`)}">Compartir por WhatsApp</a><button class="btn ghost" id="pedido-link-copy">Copiar enlace</button><div id="pedido-qr" class="pedido-qr"><span class="muted">Generando QR…</span></div></div>
    <div class="pedido-detail-actions"><label class="f"><span>Actualizar estado</span><select id="pedido-next-state">${PEDIDO_ESTADOS.map(x=>`<option ${x===p.estado?"selected":""}>${x}</option>`).join("")}</select></label><button class="btn primary" id="pedido-save-state">Guardar estado</button></div><div class="pedido-detail-actions"><label class="f"><span>Fecha estimada de entrega</span><input id="pedido-next-date" type="date" value="${esc(p.fechaEstimada||"")}"></label><button class="btn" id="pedido-save-date">Actualizar fecha</button></div>
    ${puede("pedido.editar")||puede("pedido.eliminar")?`<div class="pedido-dialog-actions pedido-admin-actions">${puede("pedido.eliminar")?`<button class="btn danger" id="pedido-eliminar">Eliminar pedido</button>`:""}${puede("pedido.editar")?`<button class="btn" id="pedido-editar">Editar pedido</button>`:""}</div>`:""}</div>`,`pedido-detail-dialog`);
  const editBtn=$("#pedido-editar",d), delBtn=$("#pedido-eliminar",d);
  if(editBtn) editBtn.onclick=()=>{d.close();abrirNuevoPedido(p);};
  if(delBtn) delBtn.onclick=()=>pedidoEliminar(p,d);
  $("#pedido-link-copy",d).onclick=async()=>{try{await navigator.clipboard.writeText(pedidoPortalUrl(p));toast("Enlace copiado.");}catch{toast("No se pudo copiar el enlace.");}};
  $("#pedido-save-state",d).onclick=async()=>{const next=$("#pedido-next-state",d).value;if(next===p.estado)return toast("El pedido ya tiene ese estado.");try{const ok=await pedidoEventoGuardar(p,`Estado actualizado: ${p.estado} → ${next}`,{estado:next});if(ok){d.close();toast("Estado actualizado.");verPedido(id);}}catch(e){toast(e.message||"No se pudo guardar el cambio.");}};
  $("#pedido-save-date",d).onclick=async()=>{const next=$("#pedido-next-date",d).value;if(!next)return toast("Elige una fecha estimada.");if(next===p.fechaEstimada)return toast("La fecha estimada no ha cambiado.");try{const ok=await pedidoEventoGuardar(p,`Fecha estimada actualizada: ${next}`,{fechaEstimada:next});if(ok){d.close();toast("Fecha de entrega actualizada.");verPedido(id);}}catch(e){toast(e.message||"No se pudo actualizar la fecha.");}};
  $("#pedido-foto-file",d).onchange=async e=>{const file=e.target.files?.[0];if(file)await pedidoSubirFoto(p,file,d);};
  const history=$("#pedido-historial",d), photos=$("#pedido-fotos",d);
  if(db?.pedidosRelacionados){try{const [ev,ph]=await Promise.all([db.pedidosRelacionados("pedido_eventos",id),db.pedidosRelacionados("pedidos_fotos",id)]);if(stamp!==pedidoRelacionToken)return;pedidoEventos=ev.map(x=>({id:x.id,...x.data()})).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));pedidoFotos=ph.map(x=>({id:x.id,...x.data()}));}catch{pedidoEventos=[];pedidoFotos=[];}}
  if(stamp!==pedidoRelacionToken||!d.open)return;
  history.innerHTML=pedidoEventos.length?pedidoEventos.map(ev=>`<div class="pedido-event"><i></i><div><b>${esc(ev.estado||"Actualización")}</b><span>${esc(ev.detalle||"")}</span><small>${fmtDate(ev.fecha)} · ${esc(ev.actorNombre||"Equipo")}</small></div></div>`).join(""):`<p class="muted">No hay cambios en el historial todavía.</p>`;
  photos.innerHTML=pedidoFotos.length?pedidoFotos.map(ph=>`<figure class="pedido-photo"><img src="${esc(ph.imagen)}" alt="${esc(ph.titulo||"Foto del pedido")}"><figcaption>${esc(ph.titulo||"Foto del pedido")} <span class="pedido-status ${ph.publicada?"ok":"warn"}">${ph.publicada?"Visible al cliente":"Solo equipo"}</span><button class="btn ghost" data-foto-publicar="${esc(ph.id)}" data-publicada="${ph.publicada?"true":"false"}">${ph.publicada?"Ocultar":"Publicar"}</button></figcaption></figure>`).join(""):`<p class="muted">No se han subido fotos para este pedido.</p>`;
  photos.onclick=async e=>{const b=e.target.closest("[data-foto-publicar]");if(!b)return;const photo=pedidoFotos.find(x=>x.id===b.dataset.fotoPublicar);if(!photo)return;try{const published=b.dataset.publicada!=="true";await pedidoFotoVisibilidad(p,photo,published);verPedido(id);}catch(ex){toast(ex.message||"No se pudo actualizar la foto.");}};
  await pedidoQr(p, $("#pedido-qr",d));
}
async function pedidoEliminar(p,d){
  if(!exigir("pedido.eliminar","eliminar pedidos"))return;
  if(!confirm(`¿Eliminar el pedido ${p.codigo} de ${p.cliente}?\n\nSe borran también su historial y sus fotos, y el enlace del cliente deja de funcionar. No se puede deshacer.`))return;
  const btn=$("#pedido-eliminar",d); if(btn) btn.disabled=true;
  try{
    if(db&&fb?.F&&fb.negocioId){
      const F=fb.F, base=`negocios/${fb.negocioId}/`;
      const [ev,ph]=db.pedidosRelacionados?await Promise.all([db.pedidosRelacionados("pedido_eventos",p.id),db.pedidosRelacionados("pedidos_fotos",p.id)]):[[],[]];
      const b=F.writeBatch(fb.fs);
      ph.forEach(x=>b.delete(F.doc(fb.fs,base+"pedidos_fotos/"+x.id)));
      ev.forEach(x=>b.delete(F.doc(fb.fs,base+"pedido_eventos/"+x.id)));
      b.delete(F.doc(fb.fs,base+"pedidos/"+p.id));
      await b.commit();
    } else { mem.pedidos.delete(p.id); syncMem(); }
    S.pedidos=S.pedidos.filter(x=>x.id!==p.id); pedidoSeleccionado=null;
    d.close(); renderPedidos(); toast("Pedido eliminado.");
  }catch(ex){ toast(ex.message||"No se pudo eliminar el pedido."); if(btn) btn.disabled=false; }
}
async function pedidoFotoVisibilidad(p,photo,publicada){
  if(!exigir("pedido.foto","publicar fotos de pedidos"))return;
  const now=new Date().toISOString(),user=usuarioActual(),actorId=user?.id||sessionId||"local",actorNombre=user?.nombre||"Equipo",eid=uid()+uid();
  const ev={pedidoId:p.id,codigo:p.codigo,estado:p.estado,detalle:publicada?"Se publicó una fotografía para el cliente":"Se ocultó una fotografía del portal",fecha:now,actorId,actorNombre};
  if(db&&fb?.F&&fb.negocioId){const F=fb.F,b=F.writeBatch(fb.fs);b.update(F.doc(fb.fs,`negocios/${fb.negocioId}/pedidos_fotos/${photo.id}`),{publicada});b.update(F.doc(fb.fs,`negocios/${fb.negocioId}/pedidos/${p.id}`),{modificadoEn:now,modificadoPorId:actorId,modificadoPorNombre:actorNombre});b.set(F.doc(fb.fs,`negocios/${fb.negocioId}/pedido_eventos/${eid}`),ev);await b.commit();}
  else{photo.publicada=publicada;pedidoEventos.push({id:eid,...ev});}
  toast(publicada?"Foto publicada en el portal.":"Foto oculta del portal.");
}
async function pedidoSubirFoto(p,file,d) {
  if(!exigir("pedido.foto","subir fotos de pedidos"))return;
  const input=$("#pedido-foto-file",d);input.disabled=true;
  try{
    const data=await new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const scale=Math.min(1,1000/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);let quality=.78,out=canvas.toDataURL("image/webp",quality);while(out.length>250000&&quality>.35){quality-=.08;out=canvas.toDataURL("image/webp",quality);}if(out.length>280000)reject(new Error("La foto es demasiado grande. Prueba con otra imagen."));else resolve(out);};img.onerror=()=>reject(new Error("No se pudo leer la imagen."));img.src=url;});
    const user=usuarioActual(), now=new Date().toISOString(), id=uid()+uid(), photo={pedidoId:p.id,codigo:p.codigo,imagen:data,titulo:"Foto del pedido",publicada:false,creadaEn:now,subidoPorId:user?.id||sessionId||"local",subidoPorNombre:user?.nombre||"Equipo"}, evId=uid()+uid(), ev={pedidoId:p.id,codigo:p.codigo,estado:p.estado,detalle:"Se agregó una fotografía al pedido",fecha:now,actorId:photo.subidoPorId,actorNombre:photo.subidoPorNombre};
    if(db&&fb?.F&&fb.negocioId){const F=fb.F,b=F.writeBatch(fb.fs);b.set(F.doc(fb.fs,`negocios/${fb.negocioId}/pedidos_fotos/${id}`),photo);b.set(F.doc(fb.fs,`negocios/${fb.negocioId}/pedido_eventos/${evId}`),ev);await b.commit();}else{pedidoFotos.push({id,...photo});pedidoEventos.push({id:evId,...ev});}
    toast("Foto guardada como privada. Publícala para que el cliente pueda verla.");await verPedido(p.id);
  }catch(ex){toast(ex.message||"No se pudo guardar la foto.");}finally{if(input)input.disabled=false;}
}
async function cargarLibreriaQr(){
  if(window.QRCode)return window.QRCode;
  if(!window._pedidoQrPromise)window._pedidoQrPromise=new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";s.onload=()=>resolve(window.QRCode);s.onerror=()=>reject(new Error("No se pudo cargar el generador QR."));document.head.append(s);});
  return window._pedidoQrPromise;
}
async function pedidoQr(p, root){
  if(!root)return;
  try{const qr=await cargarLibreriaQr();if(!qr)throw new Error();const canvas=document.createElement("canvas");await qr.toCanvas(canvas,pedidoPortalUrl(p),{width:184,margin:1,errorCorrectionLevel:"M",color:{dark:"#17231f",light:"#ffffff"}});root.replaceChildren(canvas, Object.assign(document.createElement("small"),{textContent:"Escanea para consultar el pedido"}));}
  catch{root.innerHTML=`<span class="muted">${navigator.onLine?"Conéctate para generar el QR":"El QR necesita cargar una vez con conexión"}</span>`;}
}
