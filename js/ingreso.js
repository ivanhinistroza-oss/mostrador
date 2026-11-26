// ---------- ingreso de mercadería ----------
// Solo SUMA unidades al stock de productos que ya existen (lo que llega del proveedor) y, si se escribe,
// actualiza el costo de compra. No cambia nombres ni precios. Con Cimiento va en una sola operación
// (movimiento) que también funciona sin internet y se envía sola al volver la conexión.
let ingresoQ = "", ingresoEnviando = false;
let ingreso = store.get("mostrador.ingreso") || { items: [] }; // items: [{ pid, cant: { [variantId|""]: "texto" }, costo: "" }]
const ingresoGuardar = () => store.set("mostrador.ingreso", ingreso);
const ingresoNum = t => { const s = String(t ?? "").trim().replace(",", "."); return /^\d+(\.\d{1,3})?$/.test(s) ? Number(s) : null; };

// líneas válidas del borrador: solo productos y variantes que siguen existiendo y cantidades mayores que cero
function ingresoLineas() {
  const out = [];
  ingreso.items.forEach(it => {
    const p = S.products.find(x => x.id === it.pid); if (!p) return;
    Object.entries(it.cant || {}).forEach(([vid, t]) => {
      const n = ingresoNum(t);
      if (!n) return;
      if (vid && !(p.variantes || []).some(v => v.id === vid)) return;
      if (!vid && p.variantes && p.variantes.length) return;
      out.push({ p, vid, cant: n });
    });
  });
  return out;
}
function ingresoTotales() {
  const lineas = ingresoLineas();
  let costo = 0, conCosto = true;
  lineas.forEach(l => {
    const it = ingreso.items.find(x => x.pid === l.p.id), c = ingresoNum(it && it.costo);
    if (c != null) costo += c * l.cant; else if (tieneCosto(l.p)) costo += n2(l.p.costo) * l.cant; else conCosto = false;
  });
  return { lineas, unidades: lineas.reduce((a, l) => a + l.cant, 0), productos: new Set(lineas.map(l => l.p.id)).size, costo: round2(costo), conCosto };
}
function ingresoAgregar(pid, vid = "") {
  const p = S.products.find(x => x.id === pid); if (!p) return;
  let it = ingreso.items.find(x => x.pid === pid);
  if (!it) { it = { pid, cant: {}, costo: "" }; ingreso.items.unshift(it); }
  // con lector o escáner, cada lectura suma una unidad a esa talla/color
  if (vid || !(p.variantes && p.variantes.length)) it.cant[vid] = String((ingresoNum(it.cant[vid]) || 0) + 1);
  ingresoQ = ""; ingresoGuardar(); renderIngreso();
  const foco = document.querySelector(`[data-ing-cant="${CSS.escape(pid)}"][data-variant="${CSS.escape(vid)}"]`) || document.querySelector(`[data-ing-cant="${CSS.escape(pid)}"]`);
  if (foco) { foco.focus(); foco.select(); }
}
function ingresoCodigo(codigo) {
  const hit = buscarCodigo(codigo);
  if (!hit) return "No hay ningún producto con el código " + codigo + ". Créalo primero en Inventario.";
  if (!hit.v && hit.p.variantes && hit.p.variantes.length) { ingresoAgregar(hit.p.id); return "Ese código es del producto: escribe la cantidad de cada talla y color."; }
  ingresoAgregar(hit.p.id, hit.v ? hit.v.id : "");
  return "";
}

function ingresoResultadosHtml() {
  const q = norm(ingresoQ);
  if (!q) return `<div class="ing-ayuda">${S.products.length ? `<b>Busca el producto que llegó</b><span>Escribe su nombre o código, o usa el lector de códigos. Si es un producto nuevo, créalo primero en <button type="button" class="link" data-view="inventario">Inventario</button>.</span>` : `<b>Aún no tienes productos</b><span>Crea tus productos en Inventario y luego registra aquí la mercadería que te llega.</span>`}</div>`;
  const res = productMatches(ingresoQ).slice(0, 8);
  if (!res.length) return `<div class="ing-ayuda"><b>No encontramos ese producto</b><span>Revisa cómo se escribe, o créalo en <button type="button" class="link" data-view="inventario">Inventario</button>.</span></div>`;
  return `<div class="ing-res">${res.map(({ p }) => {
    const vs = p.variantes || [], ya = ingreso.items.some(x => x.pid === p.id);
    return `<button type="button" class="ing-res-row" data-ing-add="${esc(p.id)}">${thumbHtml(p, "sm")}<span class="ing-res-name"><b>${esc(p.nombre)}</b><small>${esc(p.categoria || "Sin categoría")}${p.codigo ? ` · <span class="num">${esc(p.codigo)}</span>` : ""}${vs.length ? ` · ${vs.length} tallas/colores` : ""}</small></span><span class="ing-res-stock num">${qty(totalStock(p))} ${esc(p.unidad || "und")}</span><span class="ing-res-add">${ya ? "✓" : "+"}</span></button>`;
  }).join("")}</div>`;
}
// cuadro talla × color con una casilla por combinación; si no forman un cuadro, una lista
function ingresoVariantesHtml(p, it) {
  const vs = p.variantes, label = v => [v.talla, v.color].filter(Boolean).join(" / ") || "Variante";
  const input = v => `<input type="text" inputmode="decimal" data-ing-cant="${esc(p.id)}" data-variant="${esc(v.id)}" value="${esc(it.cant[v.id] || "")}" placeholder="0" aria-label="Cantidad que llega de ${esc(label(v))}">`;
  const allT = vs.every(v => v.talla), noT = vs.every(v => !v.talla), allC = vs.every(v => v.color), noC = vs.every(v => !v.color);
  const keys = vs.map(v => norm(v.talla || "") + "|" + norm(v.color || ""));
  if ((allT || noT) && (allC || noC) && new Set(keys).size === keys.length) {
    const ts = noT ? [""] : uniq(vs.map(v => v.talla)).sort(byTalla), cs = noC ? [""] : uniq(vs.map(v => v.color)).sort(byColor);
    const find = (t, c) => vs.find(v => norm(v.talla || "") === norm(t) && norm(v.color || "") === norm(c));
    return `<div class="var-matrix-wrap"><table class="var-matrix ing-matrix"><thead><tr><th></th>${ts.map(t => `<th>${t ? esc(t) : "Llega"}</th>`).join("")}</tr></thead>
      <tbody>${cs.map(c => `<tr><th>${c ? swatch(c) + esc(c) : "Llega"}</th>${ts.map(t => { const v = find(t, c); return v ? `<td title="Ahora hay ${qty(v.stock)}">${input(v)}<small>hay ${qty(v.stock)}</small></td>` : `<td class="none">—</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  return `<div class="ing-var-list">${vs.map(v => `<label>${v.color ? swatch(v.color) : ""}<span>${esc(label(v))} <small>hay ${qty(v.stock)}</small></span>${input(v)}</label>`).join("")}</div>`;
}
function ingresoItemHtml(it) {
  const p = S.products.find(x => x.id === it.pid);
  if (!p) return `<div class="ing-item ing-item-x"><span>Un producto de la lista ya no existe.</span><button type="button" class="btn ghost" data-ing-rm="${esc(it.pid)}">Quitar</button></div>`;
  const vs = p.variantes || [], suma = vs.length ? vs.reduce((a, v) => a + (ingresoNum(it.cant[v.id]) || 0), 0) : ingresoNum(it.cant[""]) || 0;
  return `<div class="ing-item" data-ing-item="${esc(p.id)}">
    <div class="ing-item-head">${thumbHtml(p, "sm")}<div class="ing-item-name"><b>${esc(p.nombre)}</b><small>Stock ahora: <span class="num">${qty(totalStock(p))} ${esc(p.unidad || "und")}</span></small></div>
      <span class="ing-suma" data-ing-suma="${esc(p.id)}">${suma ? `+${qty(suma)} → <b class="num">${qty(totalStock(p) + suma)}</b>` : ""}</span>
      <button type="button" class="ing-x" data-ing-rm="${esc(p.id)}" aria-label="Quitar ${esc(p.nombre)}">✕</button></div>
    ${vs.length ? ingresoVariantesHtml(p, it) : `<label class="f ing-cant"><span>Cantidad que llega</span><input type="text" inputmode="decimal" data-ing-cant="${esc(p.id)}" data-variant="" value="${esc(it.cant[""] || "")}" placeholder="0"></label>`}
    <label class="f ing-costo"><span>Costo por unidad <small>(opcional)</small></span><input type="text" inputmode="decimal" data-ing-costo="${esc(p.id)}" value="${esc(it.costo || "")}" placeholder="${tieneCosto(p) ? "Ahora " + money(p.costo) : "Lo que te costó cada uno"}"></label>
  </div>`;
}
function ingresoPieHtml() {
  const t = ingresoTotales();
  return `<div class="ing-tot"><span>Unidades que entran</span><b class="num">${qty(t.unidades)}</b></div>
    <div class="ing-tot"><span>Productos</span><b class="num">${t.productos}</b></div>
    ${puede("estadisticas.ver") ? `<div class="ing-tot"><span>Costo de la compra</span><b class="num">${t.unidades && t.conCosto ? money(t.costo) : "—"}</b></div>` : ""}`;
}
function renderIngreso() {
  if (!exigir("stock.ajustar", "ingresar mercadería")) return;
  const el = $("#v-ingreso"), focusId = document.activeElement && document.activeElement.id;
  ingreso.items = ingreso.items.filter(x => x && x.pid);
  const t = ingresoTotales();
  el.innerHTML = `<div class="ing">
    <div class="toolbar"><div class="rv-head" style="margin-right:auto"><h1>Ingreso de mercadería</h1><p class="rv-sub">Suma al stock lo que te llega. No cambia nombres ni precios.</p></div></div>
    <div class="ing-grid">
      <section class="panel ing-buscar">
        <h2>1. Busca el producto</h2>
        <div class="scan-row"><label class="f"><span>Nombre o código</span><input type="search" id="ing-q" value="${esc(ingresoQ)}" placeholder="Ej. Polo algodón o 775…" autocomplete="off"></label><button type="button" class="btn" id="ing-scan"><svg class="bc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M8 9v6M11 9v6M14 9v6M17 9v6"/></svg>Escanear</button></div>
        <div id="ing-res">${ingresoResultadosHtml()}</div>
      </section>
      <section class="panel ing-lista">
        <div class="ing-lista-head"><h2>2. Escribe cuánto llegó</h2>${ingreso.items.length ? `<button type="button" class="btn ghost" id="ing-vaciar">Vaciar</button>` : ""}</div>
        ${ingreso.items.length ? ingreso.items.map(ingresoItemHtml).join("") : `<div class="ing-vacio"><span>＋</span><b>Todavía no agregaste productos</b><small>Toca un producto de la búsqueda para agregarlo aquí.</small></div>`}
        <div class="ing-pie" id="ing-pie">${ingresoPieHtml()}</div>
        <button type="button" class="btn primary ing-registrar" id="ing-ok" ${t.unidades ? "" : "disabled"}>Registrar ingreso</button>
      </section>
    </div>
  </div>`;
  if (focusId && document.getElementById(focusId)) { const i = document.getElementById(focusId); i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch {} }
}
// al escribir solo se actualizan los totales: redibujar movería el cursor
function ingresoRefrescar(pid) {
  const it = ingreso.items.find(x => x.pid === pid), p = S.products.find(x => x.id === pid), el = document.querySelector(`[data-ing-suma="${CSS.escape(pid)}"]`);
  if (it && p && el) {
    const vs = p.variantes || [], suma = vs.length ? vs.reduce((a, v) => a + (ingresoNum(it.cant[v.id]) || 0), 0) : ingresoNum(it.cant[""]) || 0;
    el.innerHTML = suma ? `+${qty(suma)} → <b class="num">${qty(totalStock(p) + suma)}</b>` : "";
  }
  $("#ing-pie").innerHTML = ingresoPieHtml();
  $("#ing-ok").disabled = !ingresoTotales().unidades;
}
async function ingresoRegistrar(btn) {
  if (!exigir("stock.ajustar", "ingresar mercadería") || ingresoEnviando) return;
  const mal = document.querySelector("#v-ingreso [data-ing-cant], #v-ingreso [data-ing-costo]") && [...document.querySelectorAll("#v-ingreso [data-ing-cant], #v-ingreso [data-ing-costo]")].find(i => i.value.trim() && ingresoNum(i.value) == null);
  if (mal) { mal.focus(); return toast("Revisa los números: usa cifras como 12 o 4.50."); }
  const t = ingresoTotales();
  if (!t.unidades) return toast("Escribe cuántas unidades llegaron.");
  const resumen = [...new Set(t.lineas.map(l => l.p))].map(p => `• ${p.nombre}: +${qty(t.lineas.filter(l => l.p === p).reduce((a, l) => a + l.cant, 0))}`).join("\n");
  if (!confirm(`¿Sumar ${qty(t.unidades)} unidades al stock?\n\n${resumen}`)) return;
  ingresoEnviando = true; btn.disabled = true;
  try {
    await flushPendingStock();
    if (usaTransacciones()) {
      const deltas = new Map();
      t.lineas.forEach(l => { const k = l.p.id + ":" + (l.vid || ""); deltas.set(k, (deltas.get(k) || 0) + l.cant); });
      await fbMovimiento({ deltas });
    } else {
      saleAdjusting = true;
      try { await adjustStock(t.lineas.map(l => ({ productId: l.p.id, variantId: l.vid || undefined, cant: l.cant })), +1); }
      finally { saleAdjusting = false; }
    }
    // el costo de compra es del producto (igual para todas sus tallas y colores)
    let costoFallo = false;
    for (const it of ingreso.items) {
      const c = ingresoNum(it.costo), p = S.products.find(x => x.id === it.pid);
      if (c == null || !p || (tieneCosto(p) && n2(p.costo) === c) || !t.lineas.some(l => l.p.id === it.pid)) continue;
      try { await patchProduct(it.pid, { costo: c, actualizado: new Date().toISOString() }); } catch { costoFallo = true; }
    }
    ingreso = { items: [] }; ingresoQ = ""; ingresoGuardar();
    toast(`Listo: entraron ${qty(t.unidades)} unidades.` + (costoFallo ? " No se pudo guardar algún costo." : ""));
    renderIngreso();
  } catch (err) { toast(failMsg(err)); btn.disabled = false; }
  finally { ingresoEnviando = false; }
}
$("#v-ingreso").addEventListener("input", e => {
  const t = e.target;
  if (t.id === "ing-q") { ingresoQ = t.value; $("#ing-res").innerHTML = ingresoResultadosHtml(); return; }
  if (t.dataset.ingCant !== undefined) {
    const it = ingreso.items.find(x => x.pid === t.dataset.ingCant); if (!it) return;
    it.cant[t.dataset.variant || ""] = t.value; ingresoGuardar();
    t.classList.toggle("mal", !!t.value.trim() && ingresoNum(t.value) == null);
    return ingresoRefrescar(it.pid);
  }
  if (t.dataset.ingCosto !== undefined) {
    const it = ingreso.items.find(x => x.pid === t.dataset.ingCosto); if (!it) return;
    it.costo = t.value; ingresoGuardar();
    t.classList.toggle("mal", !!t.value.trim() && ingresoNum(t.value) == null);
    return ingresoRefrescar(it.pid);
  }
});
$("#v-ingreso").addEventListener("keydown", e => {
  if (e.target.id !== "ing-q" || e.key !== "Enter") return;
  e.preventDefault();
  const q = ingresoQ.trim(); if (!q) return;
  if (buscarCodigo(q)) { const m = ingresoCodigo(q); if (m) toast(m); return; }
  const primero = $("#v-ingreso [data-ing-add]");
  if (primero) primero.click(); else if (pareceCodigo(q)) toast("No hay ningún producto con el código " + q + ".");
});
$("#v-ingreso").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.ingAdd) return ingresoAgregar(b.dataset.ingAdd);
  if (b.dataset.ingRm) { ingreso.items = ingreso.items.filter(x => x.pid !== b.dataset.ingRm); ingresoGuardar(); return renderIngreso(); }
  if (b.id === "ing-vaciar") { if (!confirm("¿Quitar todos los productos de la lista?")) return; ingreso = { items: [] }; ingresoGuardar(); return renderIngreso(); }
  if (b.id === "ing-scan") return abrirEscaner(c => { const m = ingresoCodigo(c); if (m) toast(m); return false; }, "Apunta la cámara a cada producto que llegó. Cada lectura suma una unidad.");
  if (b.id === "ing-ok") return ingresoRegistrar(b);
});
