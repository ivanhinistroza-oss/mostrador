// ---------- nueva venta ----------
// medio de pago de cada venta: solo se anota, Mostrador no cobra ni confirma el pago
const MEDIOS_PAGO = ["Efectivo", "Yape", "Plin", "Tarjeta", "Transferencia"];
const PAGO_INICIAL = MEDIOS_PAGO[0];
const PAGO_SIN_DATO = "Sin registrar"; // notas emitidas antes de existir este dato
function pagoResumen(notes) {
  const totals = new Map();
  notes.filter(n => n.estado !== "anulada").forEach(n => {
    const label = n.pago || PAGO_SIN_DATO, d = totals.get(label) || { label, count: 0, total: 0 };
    d.count++;
    d.total = round2(d.total + n2(n.total));
    totals.set(label, d);
  });
  return [...totals.values()].sort((a, b) => b.total - a.total);
}
const blankDraft = () => ({ cliente: "", doc: "", obs: "", pago: PAGO_INICIAL, recibido: "", items: [] });
let draft = store.get("mostrador.draft") || blankDraft();
let pickQ = "", pickTimer = 0, saleCategory = "", salePickProductId = null, saleShowAll = false;
const saveDraft = () => store.set("mostrador.draft", draft);
const nextFolio = () => S.notes.reduce((m, n) => Math.max(m, n2(n.folio)), notasFolioMax) + 1;
const draftTotal = () => draft.items.reduce((a, i) => a + n2(i.cant) * n2(i.precio), 0);
function saleColorHex(color) {
  const c = norm(color);
  const colors = [["negro","#252525"],["blanco","#fff"],["rojo","#d3483e"],["azul","#3978c5"],["marino","#243b68"],["celeste","#72b8dd"],["verde","#31845b"],["oliva","#788640"],["amarillo","#e4c13d"],["mostaza","#c99b27"],["naranja","#e47a36"],["rosado","#e889a5"],["rosa","#e889a5"],["fucsia","#c53982"],["morado","#8059a5"],["violeta","#8059a5"],["lila","#ae91d0"],["beige","#d7c4a0"],["crema","#f1e7cc"],["marron","#805837"],["cafe","#805837"],["camel","#b88758"],["gris","#92999b"]];
  return colors.find(([name])=>c.includes(name))?.[1] || "var(--accent)";
}
function salePickerHtml(products, quickLabel) {
  const fotos = anyFoto();
  if (!products.length) return `<div class="sale-catalog-empty">${pickQ ? `<span>No encontramos ese producto.</span> <button type="button" class="btn ghost" data-quickadd="1">${quickLabel}</button>` : S.products.length ? "No hay productos en esta categoría." : "Agrega productos desde Inventario para comenzar."}</div>`;
  return `<div class="sale-products-grid">${products.map(p=>{
    const variants = p.variantes || [];
    const prices = variants.map(v=>n2(v.precio ?? p.precio));
    const price = prices.length ? Math.min(...prices) : n2(p.precio);
    const action = variants.length ? `data-sale-product="${esc(p.id)}"` : `data-addline="${esc(p.id)}"`;
    const sub = variants.length ? `${variants.length} colores o tallas · stock ${qty(totalStock(p))}` : `${esc(p.categoria || p.unidad || "Producto")} · stock ${qty(p.stock)}`;
    return `<button type="button" class="sale-product-card" ${action}>${fotos ? thumbHtml(p,"md") : `<span class="sale-product-placeholder">${esc((p.nombre||"?").trim().charAt(0))}</span>`}<span class="sale-product-copy"><b>${esc(p.nombre)}</b><small>${sub}</small><strong>${variants.length ? "Desde " : ""}${money(price)}</strong></span><span class="sale-product-add">${variants.length ? "›" : "+"}</span></button>`;
  }).join("")}</div>`;
}
function saleVariantPickerHtml(p) {
  const variants = p.variantes || [];
  return `<div class="sale-variant-picker"><div class="sale-variant-head"><div><b>${esc(p.nombre)}</b><small>Elige el color o la talla para agregarla.</small></div><button type="button" class="btn ghost" data-sale-variants-close>Cerrar</button></div><div class="sale-variants">${variants.map(v=>{
    const label=[v.color,v.talla].filter(Boolean).join(" / ")||"Opción";
    const dot=v.color?`<i class="sale-color-dot" style="--swatch:${saleColorHex(v.color)}" aria-hidden="true"></i>`:"<i class="sale-color-dot neutral" aria-hidden="true">·</i>";
    return `<button type="button" class="sale-variant-option" data-addline="${esc(p.id)}" data-variant="${esc(v.id)}">${dot}<span><b>${esc(label)}</b><small>Stock ${qty(v.stock)}</small></span><strong>${money(v.precio ?? p.precio)}</strong><span class="sale-variant-plus">+</span></button>`;
  }).join("")}</div></div>`;
}

function renderVenta() {
  const el = $("#v-venta");
  const focusId = document.activeElement && document.activeElement.id;
  const caret = focusId && document.activeElement.selectionStart;
  const q = norm(pickQ);
  const total = draftTotal();
  const esEfectivo = (draft.pago || PAGO_INICIAL) === PAGO_INICIAL;
  const recibidoTxt = String(draft.recibido || "").trim().replace(",", ".");
  const recibido = /^\d+(\.\d{1,2})?$/.test(recibidoTxt) ? Number(recibidoTxt) : NaN;
  const recibidoValido = Number.isFinite(recibido);
  const vuelto = recibidoValido ? round2(recibido - total) : null;
  const pagoInvalido = esEfectivo && (!recibidoValido || vuelto < 0);
  const opened = cajaAbierta();
  const variantProduct = salePickProductId && S.products.find(p => p.id === salePickProductId);
  const categories = [...new Set(S.products.map(p => String(p.categoria || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
  const categoryProducts = saleCategory ? S.products.filter(p => p.categoria === saleCategory) : S.products;
  const products = q ? productMatches(pickQ).map(x=>x.p) : saleShowAll ? categoryProducts : categoryProducts.slice(0,12);
  el.innerHTML = `
    <div class="sale-heading"><div><span class="sale-eyebrow">PUNTO DE VENTA</span><h1>Nueva venta</h1><p>Busca tus productos, revisa el cobro y emite la nota.</p></div><div class="sale-heading-meta"><span class="sale-folio">${folioTxt(nextFolio())}</span><span class="sale-cash-status ${opened ? "is-open" : "is-closed"}"><i></i>${opened ? "Caja abierta" : S.cajas.length ? "Caja cerrada" : "Caja no configurada"}</span><small>${esc(usuarioActual()?.nombre || "")}</small></div></div>
    ${S.cajas.length && !opened ? `<div class="banner venta-caja"><span>La caja está cerrada: esta venta no entrará en ningún cierre.</span><button class="btn" data-view="caja">Abrir caja</button></div>` : ""}
    <div class="sale">
      <section class="panel sale-catalog">
        <div class="sale-section-head"><span class="sale-section-icon">▦</span><div><h2>Productos</h2><p>Busca por nombre o código, o elige una categoría.</p></div></div>
        <div class="sale-category-chips"><button type="button" data-sale-category="" aria-pressed="${!saleCategory}">Todos</button>${categories.map(c=>`<button type="button" data-sale-category="${esc(c)}" aria-pressed="${saleCategory===c}">${esc(c)}</button>`).join("")}</div>
        <div class="picker">
          <div class="scan-row"><label class="f"><span>Buscar producto</span><input type="search" id="d-pick" value="${esc(pickQ)}" placeholder="${S.products.length ? "Nombre, código o categoría" : "Primero agrega productos en Inventario"}" autocomplete="off"></label><button type="button" class="btn" id="d-scan"><svg class="bc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M8 9v6M11 9v6M14 9v6M17 9v6"/></svg>Escanear</button></div>
          ${salePickerHtml(products, `Crear «${esc(pickQ)}»`)}
          ${!q && !saleShowAll && categoryProducts.length > products.length ? `<button type="button" class="btn ghost sale-more-products" data-sale-more>Ver todos los productos (${categoryProducts.length})</button>` : ""}
          ${variantProduct ? saleVariantPickerHtml(variantProduct) : ""}
        </div>
      </section>
      <section class="panel sale-checkout">
        <div class="sale-section-head"><span class="sale-section-icon sale-cart-icon">▤</span><div><h2>Tu venta</h2><p>${draft.items.length ? `${draft.items.length} ${draft.items.length === 1 ? "producto" : "productos"} en esta nota` : "Agrega productos para comenzar"}</p></div></div>
        <details class="sale-customer" ${focusId === "d-cliente" || focusId === "d-doc" || draft.cliente || draft.doc ? "open" : ""}><summary>Datos del cliente <small>${esc(draft.cliente || "Público en general")}</small></summary><div class="grid2">
          <label class="f"><span>Cliente</span><input type="text" id="d-cliente" value="${esc(draft.cliente)}" placeholder="Público en general" autocomplete="off"></label>
          <label class="f"><span>DNI / RUC / documento</span><input type="text" id="d-doc" value="${esc(draft.doc)}" placeholder="Opcional" autocomplete="off">${docHint(draft.doc)}</label>
        </div></details>
        <div class="sale-cart-lines">
          ${draft.items.length ? `<div class="line line-head"><span>Producto</span><span style="text-align:right">Cant.</span><span style="text-align:right">Precio</span><span class="sub">Importe</span><span></span></div>` : ""}
          ${draft.items.map((i, k) => {
            const p = S.products.find(x => x.id === i.productId);
            const pv = p && i.variantId && p.variantes ? p.variantes.find(v=>v.id===i.variantId) : null;
            const available = pv ? n2(pv.stock) : p && totalStock(p);
            const over = p && n2(i.cant) > available;
            return `<div class="line">
              <div class="nm">${esc(i.nombre)}<small>${p ? `stock ${qty(available)} ${esc(p.unidad || "und")}` : i.productId ? "producto eliminado" : "no descuenta stock"}</small>${over ? `<small class="warnline">Supera el stock disponible</small>` : ""}</div>
              <input type="number" id="l-cant-${k}" data-cant="${k}" value="${i.cant}" min="0" step="1" inputmode="decimal" aria-label="Cantidad">
              <input type="number" id="l-precio-${k}" data-precio="${k}" value="${i.precio}" min="0" step="0.01" inputmode="decimal" aria-label="Precio unitario">
              <span class="sub">${money(n2(i.cant) * n2(i.precio))}</span>
              <button class="x" data-rmline="${k}" aria-label="Quitar ${esc(i.nombre)}">×</button>
            </div>`;
          }).join("") || `<p class="muted" style="margin:4px 0">Busca un producto arriba para agregarlo a la nota.</p>`}
        </div>
        ${draft.items.length ? `<div class="sale-payment"><div class="sale-section-head compact"><span class="sale-section-icon sale-pay-icon">$</span><div><h2>Cobro</h2><p>Elige cómo paga el cliente.</p></div></div><div class="pay-field"><span id="d-pago-label">Medio de pago</span><div class="pay-opts sale-pay-opts" role="group" aria-labelledby="d-pago-label">${MEDIOS_PAGO.map(m => `<button type="button" data-pago="${esc(m)}" aria-pressed="${(draft.pago || PAGO_INICIAL) === m}">${esc(m)}</button>`).join("")}</div></div>
          ${esEfectivo ? `<div class="cash-change"><label class="f"><span>Monto recibido en efectivo</span><input type="text" inputmode="decimal" id="d-recibido" value="${esc(draft.recibido)}" placeholder="Ingresa el monto recibido" autocomplete="off" aria-describedby="d-vuelto"></label><div class="cash-change-result" id="d-vuelto" aria-live="polite"><span>Vuelto</span><b>${vuelto === null ? "Ingresa cuánto recibió" : vuelto < 0 ? "Falta " + money(-vuelto) : money(vuelto)}</b></div></div>` : `<div class="sale-noncash-note">Se cobrará <b>${money(total)}</b> por ${esc(draft.pago)}.</div>`}
        </div><label class="f sale-observations"><span>Observaciones</span><textarea id="d-obs" placeholder="Ej. Entrega a domicilio">${esc(draft.obs)}</textarea></label>` : `<div class="sale-empty"><span>＋</span><b>Agrega productos a la venta</b><small>Busca arriba o toca un producto del catálogo.</small></div>`}
        <div class="sale-total-card"><span>Total a cobrar</span><b id="d-total">${money(total)}</b><small>${draft.items.reduce((n,i)=>n+n2(i.cant),0)} unidades · ${esc(draft.pago || PAGO_INICIAL)}</small></div>
        <div class="actions sale-actions">
          <button class="btn ghost" id="d-clear" ${draft.items.length || draft.cliente ? "" : "disabled"}>Vaciar</button>
          <div class="r"><button class="btn primary sale-emit" id="d-emit" ${draft.items.some(i => n2(i.cant) > 0) && !pagoInvalido ? "" : "disabled"}>Emitir venta</button></div>
        </div>
        <details class="sale-preview"><summary>Vista previa de la nota</summary>${ticketHtml({ folio: nextFolio(), fecha: new Date().toISOString(), cliente: draft.cliente, doc: draft.doc, obs: draft.obs, pago: draft.pago || PAGO_INICIAL, recibido: esEfectivo && recibidoValido ? recibido : null, vuelto: esEfectivo && recibidoValido && vuelto >= 0 ? vuelto : null, items: draft.items.filter(i => n2(i.cant) > 0), total }, true)}</details>
      </section>
    </div>`;
  if (focusId && document.getElementById(focusId)) { const i = document.getElementById(focusId); i.focus(); try { i.setSelectionRange(caret, caret); } catch {} }
}
// buscador de productos de Nueva venta y de Cotizaciones
function productMatches(text) {
  const q = norm(text), palabras = palabrasDe(text);
  if (!q) return [];
  const res = [], otros = [];
  S.products.forEach(p => {
    const hay = productoTexto(p);
    if (tieneTodas(hay, palabras)) res.push({ p, s: 1 + (hay.startsWith(q) ? 0.5 : 0) + (hay.includes(q) ? 0.2 : 0) });
    else otros.push(p);
  });
  // el parecido (errores de tipeo) solo se calcula si hace falta y el catálogo no es enorme
  if (res.length < 8 && S.products.length <= CATALOGO_GRANDE) {
    otros.forEach(p => {
      const s = similarity({ nombre: text }, p);
      if (s >= 0.35) res.push({ p, s });
    });
  }
  return res.sort((a, b) => b.s - a.s).slice(0, 8);
}
function pickerResultsHtml(res, quickLabel) {
  const fotos = anyFoto(), th = p => fotos ? thumbHtml(p, "sm") : "";
  const variantBtn = (p, v) => `<button data-addline="${esc(p.id)}" data-variant="${esc(v.id)}">${th(p)}<span>${esc(p.nombre)} – ${esc([v.talla, v.color].filter(Boolean).join(" / "))}</span><span class="num">${money(v.precio ?? p.precio)}</span><small>${esc(v.codigo || p.codigo || "")}</small><small class="num">stock ${qty(v.stock)} ${esc(p.unidad || "und")}</small></button>`;
  const productBtn = p => `<button data-addline="${esc(p.id)}">${th(p)}<span>${esc(p.nombre)}</span><span class="num">${money(p.precio)}</span><small>${esc(p.categoria || "Sin categoría")}</small><small class="num">stock ${qty(p.stock)} ${esc(p.unidad || "und")}</small></button>`;
  const rows = res.map(x => x.p.variantes && x.p.variantes.length ? x.p.variantes.map(v => variantBtn(x.p, v)).join("") : productBtn(x.p)).join("");
  return `<div class="results${fotos ? " with-thumb" : ""}">${rows || `<div style="padding:10px" class="muted">Sin coincidencias. <button class="btn ghost" data-quickadd="1" style="padding:2px 6px">${quickLabel}</button></div>`}</div>`;
}
// línea de venta o cotización a partir de un producto (y su variante, si tiene)
function itemFromProduct(p, variant) {
  return { productId: p.id, ...(variant ? { variantId: variant.id, talla: variant.talla || "", color: variant.color || "" } : {}), nombre: p.nombre + (variant ? " – " + [variant.talla, variant.color].filter(Boolean).join(" / ") : ""), unidad: p.unidad || "und", cant: 1, precio: n2(variant && variant.precio != null ? variant.precio : p.precio) };
}
function addLine(p, variant) {
  if(p.variantes&&p.variantes.length&&!variant)return;
  const ex = draft.items.find(i => i.productId === p.id && i.variantId === (variant&&variant.id));
  if (ex) ex.cant = n2(ex.cant) + 1;
  else draft.items.push(itemFromProduct(p, variant));
  salePickProductId = null; pickQ = ""; saveDraft(); renderVenta(); $("#d-pick").focus();
}
$("#v-venta").addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.view) return go(t.dataset.view);
  if (t.dataset.saleCategory !== undefined) { saleCategory = t.dataset.saleCategory; saleShowAll = false; salePickProductId = null; return renderVenta(); }
  if (t.hasAttribute("data-sale-more")) { saleShowAll = true; return renderVenta(); }
  if (t.dataset.saleProduct) { salePickProductId = t.dataset.saleProduct; return renderVenta(); }
  if (t.hasAttribute("data-sale-variants-close")) { salePickProductId = null; return renderVenta(); }
  if (t.dataset.addline) { const p = S.products.find(x => x.id === t.dataset.addline); if (p) addLine(p,t.dataset.variant&&p.variantes&&p.variantes.find(v=>v.id===t.dataset.variant)); return; }
  if (t.dataset.rmline) { draft.items.splice(+t.dataset.rmline, 1); saveDraft(); return renderVenta(); }
  if (t.dataset.quickadd) { const name = pickQ; pickQ = ""; openProduct(null); $("#p-nombre").value = name; showSimilar(); return; }
  if (t.dataset.pago) { draft.pago = t.dataset.pago; if (draft.pago !== PAGO_INICIAL) draft.recibido = ""; saveDraft(); return renderVenta(); }
  if (t.id === "d-scan") return abrirEscaner(ventaCodigo, "Apunta la cámara a cada producto. Se agregan solos; toca Listo al terminar.");
  if (t.id === "d-clear") { draft = blankDraft(); saveDraft(); return renderVenta(); }
  if (t.id === "d-emit") return emitNote(t);
});
$("#v-venta").addEventListener("input", e => {
  const t = e.target;
  if (t.id === "d-pick") {
    pickQ = t.value;
    saleShowAll = false;
    salePickProductId = null;
    clearTimeout(pickTimer);
    pickTimer = 0;
    if (S.products.length <= SEMEJANZA_MAX) return renderVenta();
    pickTimer = setTimeout(() => { pickTimer = 0; renderVenta(); }, 120);
    return;
  }
  if (t.id === "d-cliente") { draft.cliente = t.value; saveDraft(); return renderVenta(); }
  if (t.id === "d-doc") { draft.doc = t.value; saveDraft(); return renderVenta(); }
  if (t.id === "d-obs") { draft.obs = t.value; saveDraft(); return renderVenta(); }
  if (t.id === "d-recibido") { draft.recibido = t.value; saveDraft(); return renderVenta(); }
  if (t.dataset.cant) { draft.items[+t.dataset.cant].cant = t.value === "" ? "" : n2(t.value); saveDraft(); return renderVenta(); }
  if (t.dataset.precio) { draft.items[+t.dataset.precio].precio = t.value === "" ? "" : n2(t.value); saveDraft(); return renderVenta(); }
});
$("#v-venta").addEventListener("keydown", e => {
  if (e.target.id === "d-pick" && e.key === "Enter") {
    e.preventDefault();
    if (pickTimer) { clearTimeout(pickTimer); pickTimer = 0; renderVenta(); }
    const t = pickQ.trim(), hit = buscarCodigo(t);
    if (hit) { const m = ventaCodigo(t); if (hit.v || !hit.p.variantes || !hit.p.variantes.length) return; return toast(m); }
    // un código que no existe no debe agregar el producto más parecido
    if (pareceCodigo(t) && !productMatches(t).some(x => x.s >= 1)) {
      pickQ = ""; renderVenta();
      return toast("No hay ningún producto con el código " + t);
    }
    const b = $("#v-venta [data-sale-product], #v-venta [data-addline], #v-venta [data-quickadd]");
    if (b) b.click();
  }
});
async function emitNote(btn) {
  if (!exigir("venta.crear", "crear ventas")) return;
  const items = draft.items.filter(i => n2(i.cant) > 0).map(i => {
    const linea = { ...i, cant: n2(i.cant), precio: n2(i.precio) };
    // el costo se guarda con la venta: si después cambia, la ganancia de esta venta no se mueve
    const p = i.productId && S.products.find(x => x.id === i.productId);
    if (p && tieneCosto(p)) linea.costo = n2(p.costo); else delete linea.costo;
    return linea;
  });
  if (!items.length) return;
  const totalCobro = round2(items.reduce((a, i) => a + i.cant * i.precio, 0));
  const esEfectivo = (draft.pago || PAGO_INICIAL) === PAGO_INICIAL;
  const recibidoTxt = String(draft.recibido || "").trim().replace(",", ".");
  const recibido = esEfectivo ? (/^\d+(\.\d{1,2})?$/.test(recibidoTxt) ? Number(recibidoTxt) : NaN) : null;
  if (esEfectivo && (!Number.isFinite(recibido) || recibido < totalCobro)) return toast("Ingresa el efectivo recibido. Debe ser igual o mayor al total.");
  const fromQuote = draft.cotizacionId;
  const note = {
    id: uid(), folio: nextFolio(), fecha: new Date().toISOString(),
    cliente: draft.cliente.trim(), doc: draft.doc.trim(), docTipo: docTipo(draft.doc), obs: draft.obs.trim(), pago: draft.pago || PAGO_INICIAL,
    items, total: totalCobro, ...(esEfectivo ? { recibido: round2(recibido), vuelto: round2(recibido - totalCobro) } : {}), estado: "emitida",
  };
  const detalle = items.map(i => `• ${i.nombre} ×${qty(i.cant)}`).join("\n");
  const pagoDetalle = esEfectivo ? `\nRecibido: ${money(recibido)}\nVuelto: ${money(recibido - totalCobro)}` : "";
  if (!confirm(`Revisa la venta antes de emitir\n\n${detalle}\n\nTotal: ${money(totalCobro)}\nMedio de pago: ${note.pago}${pagoDetalle}\n\n¿Emitir esta venta?`)) return;
  btn.disabled = true;
  try {
    await flushPendingStock();
    note.vendedorId = usuarioActual()?.id;
    note.vendedorNombre = usuarioActual()?.nombre;
    if (usaTransacciones()) {
      const r = await fbMovimiento({ deltas: deltasDe(items, -1), nota: note });
      note.id = r.id; note.folio = r.folio;
    } else {
      const freshNotes = await readNotes();
      note.folio = nextFreeFolio(freshNotes);
      saleAdjusting = true;
      const changed = await adjustStock(items, -1);
      try {
        const latestNotes = await readNotes();
        if (latestNotes.some(n => n2(n.folio) === n2(note.folio))) note.folio = nextFreeFolio(latestNotes);
        await putNote(note);
      }
      catch (err) {
        await restoreProducts(changed);
        try { await deleteNote(note.id); } catch {}
        throw err;
      }
      saleAdjusting = false;
    }
    // la cotización de la que salió la venta queda marcada como vendida
    if (fromQuote) { try { await patchQuote(fromQuote, { estado: "vendida", notaId: note.id, notaFolio: note.folio }); } catch {} }
    draft = blankDraft(); saveDraft();
    S.selNote = note.id;
    toast("Nota " + folioTxt(note.folio) + " emitida");
    go("notas");
  } catch (err) { saleAdjusting = false; toast("No se pudo emitir la nota; se revirtieron los cambios. " + failMsg(err)); btn.disabled = false; }
}
async function readNotes() {
  if (db && db.lastNotes) return db.lastNotes();
  if (db) { const snap = await db.collection("notes").get(); return snap.docs.map(d => ({ id: d.id, ...d.data() })); }
  return [...mem.notes.values()].map(n => ({ ...n }));
}
function nextFreeFolio(notes) {
  const used = new Set(notes.map(n => n2(n.folio)));
  let folio = notes.reduce((m, n) => Math.max(m, n2(n.folio)), 0) + 1;
  while (used.has(folio)) folio++;
  return folio;
}
async function restoreProducts(snapshots) {
  for (const p of snapshots) {
    const body = { ...p }; delete body.id;
    if (db) await db.collection("products").doc(p.id).set(body);
    else { mem.products.set(p.id, { ...p }); syncMem(); }
  }
}
async function adjustStock(items, sign) {
  const byKey = {};
  items.forEach(i => { if (i.productId) {const key=i.productId+":"+(i.variantId||"");byKey[key]=(byKey[key]||0)+n2(i.cant);} });
  const snapshots = [];
  for (const key of Object.keys(byKey)) {
    const [id, vid] = key.split(":"), p = await readProduct(id);
    if (!p || (vid && !(p.variantes || []).some(v => v.id === vid))) throw new Error("Producto o variante no disponible");
  }
  try {
    for (const [key, c] of Object.entries(byKey)) {
      const [id, vid] = key.split(":"), p = await readProduct(id);
      snapshots.push(structuredClone(p));
      if (vid) {
        const v = p.variantes.find(x => x.id === vid);
        v.stock = Math.round((n2(v.stock) + sign * c) * 1000) / 1000; p.stock = totalStock(p);
        await patchProduct(id, { variantes: p.variantes, stock: p.stock, actualizado: new Date().toISOString() });
      } else {
        p.stock = Math.round((n2(p.stock) + sign * c) * 1000) / 1000;
        await patchProduct(id, { stock: p.stock, actualizado: new Date().toISOString() });
      }
    }
  } catch (err) { await restoreProducts(snapshots); throw err; }
  return snapshots;
}

// ---------- Firebase: venta, anulación y conteo, todo junto o nada ----------
// Con internet va en una transacción: si otro equipo cambió el mismo producto o tomó el mismo folio,
// Firebase la repite con los datos nuevos, así nunca se pisan el stock ni se repite el número de nota.
// Sin internet no hay transacciones: va en un lote, que también se guarda entero o nada y se envía al volver la conexión.
const usaTransacciones = () => !!(fbMode && fb && fb.negocioId && db);
const sinRed = e => !navigator.onLine || /unavailable|deadline-exceeded/.test(String((e && e.code) || ""));
const FOLIO_ID = folio => "folio-" + folio;
function deltasDe(items, sign) {
  const deltas = new Map();
  items.forEach(i => {
    if (!i.productId) return;
    const key = i.productId + ":" + (i.variantId || "");
    deltas.set(key, (deltas.get(key) || 0) + sign * n2(i.cant));
  });
  return deltas;
}
// agrupa los cambios por producto: Map(id → [{ vid, d }])
function deltasPorProducto(deltas) {
  const porId = new Map();
  for (const [key, d] of deltas) {
    const [id, vid] = key.split(":");
    if (!porId.has(id)) porId.set(id, []);
    porId.get(id).push({ vid, d });
  }
  return porId;
}
// calcula el stock nuevo de un producto leído; piso0 = el conteo manual no baja de cero
function parcheStock(p, cambios, piso0) {
  const r = x => Math.round(x * 1000) / 1000;
  const ajusta = (actual, d) => piso0 ? Math.max(0, r(n2(actual) + d)) : r(n2(actual) + d);
  const patch = { actualizado: new Date().toISOString() };
  if (cambios.some(c => c.vid)) {
    const variantes = (p.variantes || []).map(v => ({ ...v }));
    for (const c of cambios) {
      const v = variantes.find(x => x.id === c.vid);
      if (!v) throw new Error("Producto o variante no disponible");
      v.stock = ajusta(v.stock, c.d);
    }
    patch.variantes = variantes;
    patch.stock = totalStock({ variantes });
  } else {
    patch.stock = ajusta(p.stock, cambios.reduce((a, c) => a + c.d, 0));
  }
  return patch;
}
// deltas: Map("producto:variante" → cambio). nota: venta nueva. anular: nota que se anula.
// Devuelve el id y el folio con que quedó guardada la venta.
async function fbMovimiento({ deltas, nota = null, anular = null, piso0 = false, soloEnLinea = false }) {
  if (soloEnLinea && !navigator.onLine) throw Object.assign(new Error("Sin conexión"), { code: "unavailable" });
  if (anular && anular.estado === "anulada") throw Object.assign(new Error("Ya anulada"), { aviso: "Esa nota ya estaba anulada." });
  // Cimiento: el stock, la nota con su folio y la anulación se guardan juntos dentro de la base.
  const lista = [...deltas].map(([key, d]) => { const [id, vid] = key.split(":"); return { id, variantId: vid || null, delta: Math.round(d * 1000) / 1000 }; });
  // El folio lo da el servidor; el de este equipo solo se usa si la venta se hizo sin internet.
  const notaEnvio = nota ? { ...nota, folio: n2(nota.folio) || nextFolio() } : null;
  const desde = Math.max(0, ...S.notes.map(n => n2(n.folio))) + 1;
  try {
    const r = await fb.F.rpc("movimiento", { negocio: fb.negocioId, deltas: lista, nota: notaEnvio, anular: anular ? anular.id : null, piso0, desde });
    return r || { id: nota ? nota.id : null, folio: notaEnvio ? notaEnvio.folio : 0 };
  } catch (e) {
    // Los mensajes de la base (falta stock, nota ya anulada) están escritos para quien atiende la caja.
    if (e && (e.code === "invalid-argument" || e.code === "already-exists") && e.message) e.aviso = e.message;
    throw e;
  }
}
// cola de cambios de stock por talla hechos sin internet (sobrevive si se cierra la app)
const PEND_KEY = "mostrador.stockPendiente";
function pendLeer() { try { return JSON.parse(localStorage.getItem(PEND_KEY) || "[]"); } catch { return []; } }
function pendGuardar(lista) { try { localStorage.setItem(PEND_KEY, JSON.stringify(lista)); } catch {} }
let pendEnviando = false;
async function stockPendienteEnviar() {
  if (pendEnviando || !usaTransacciones() || !navigator.onLine) return;
  pendEnviando = true;
  try {
    for (const m of pendLeer()) {
      if (m.nid !== fb.negocioId) continue;
      try { await fbMovimiento({ deltas: new Map(m.deltas), piso0: m.piso0, soloEnLinea: true }); }
      catch (e) {
        // sin red o sin permiso: queda en la cola para el próximo intento
        if (sinRed(e) || String(e && e.code).includes("permission")) break;
        // el producto o la talla ya no existe: no hay a qué aplicarlo
      }
      pendGuardar(pendLeer().filter(x => x.id !== m.id));
    }
  } finally { pendEnviando = false; }
}
addEventListener("online", () => setTimeout(stockPendienteEnviar, 1500));

