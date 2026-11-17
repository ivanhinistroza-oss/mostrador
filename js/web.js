// ---------- Tienda web: vitrina pública del negocio ----------
// Con el vínculo encendido, los productos marcados «Mostrar en la web» se copian a catalogo/{negocio}/productos
// (solo nombre, código, categoría, precio de venta y stock por variante). La web y el asistente de WhatsApp
// (asistente-whatsapp/worker.js) leen esa vitrina sin iniciar sesión.
// Cada negocio tiene su propia vitrina: vincular uno no toca a los demás.
let webCat = null; // { nid, actual: Map(id → json publicado), listo }
let webTimer = null;
function webVinculada() { return !!(fbMode && fb && fb.negocioId && S.settings.webVinculada); }
function webPublico(p) {
  return {
    nombre: p.nombre || "", codigo: p.codigo || "", categoria: p.categoria || "", precio: n2(p.precio), stock: Math.max(0, n2(p.stock)),
    variantes: (p.variantes || []).map(v => {
      const w = { id: v.id, talla: v.talla || "", color: v.color || "", stock: Math.max(0, n2(v.stock)) };
      if (v.precio != null) w.precio = n2(v.precio);
      return w;
    }),
  };
}
// lo único que el vendedor puede cambiar en la vitrina
function webStockJson(x) { return JSON.stringify([x.stock, x.variantes]); }
function webConfigCard() {
  if (!fbMode || !fb || !fb.negocioId) return `
        <div class="config-card"><h2>🌐 Tienda web</h2>
          <p class="muted">Disponible cuando usas Mostrador con correo y contraseña.</p></div>`;
  if (!S.settings.webVinculada) return `
        <div class="config-card"><h2>🌐 Tienda web</h2>
          <p class="muted">Muestra el stock de este negocio en tu tienda web. Solo se publica el nombre, el precio de venta y el stock de los productos que marques; tus ventas, precios de costo y clientes no salen de Mostrador. Los demás negocios no se ven afectados.</p>
          <div class="row-actions"><button class="btn primary" id="webLink">Vincular con mi tienda web</button></div></div>`;
  const marcados = S.products.filter(p => p.web).length;
  return `
        <div class="config-card"><h2>🌐 Tienda web <span class="chip">Vinculada</span></h2>
          <span class="f-label">Código de vinculación (pégalo en el panel de tu web → Datos de la tienda)</span>
          <div class="row-actions"><code class="web-code">${esc(fb.negocioId)}</code> <button class="btn" id="webCopy">Copiar</button></div>
          <p class="muted">${marcados} producto${marcados === 1 ? "" : "s"} marcado${marcados === 1 ? "" : "s"} «Mostrar en la web». Márcalos al editar cada producto.</p>
          <div class="row-actions"><button class="btn danger" id="webUnlink">Desvincular</button></div></div>`;
}
async function vincularWeb(on) {
  if (!exigir("ajustes.editar", "vincular la tienda web") || !fbMode || !fb?.negocioId) return;
  if (!on && !confirm("¿Desvincular? La tienda web dejará de ver el stock de este negocio.")) return;
  const { F, fs } = fb, nid = fb.negocioId;
  try {
    await fbWrite(F.setDoc(F.doc(fs, "catalogo/" + nid), { activa: on, negocio: S.settings.negocio || "", actualizado: new Date().toISOString() }));
    const s = { ...S.settings, webVinculada: on };
    await putSettings(s);
    S.settings = s;
    if (configDraft) configDraft.webVinculada = on;
    webSync();
    renderConfig();
    toast(on ? "Tienda web vinculada" : "Tienda web desvinculada");
  } catch (e) { toast(failMsg(e)); }
}
// arranca o detiene la escucha de la vitrina y programa la copia de cambios
function webSync() {
  if (!webVinculada()) { webCat = null; return; }
  const nid = fb.negocioId;
  if (!webCat || webCat.nid !== nid) {
    webCat = { nid, actual: new Map(), listo: false };
    const cat = webCat;
    fbTrack(fb.F.onSnapshot(fb.F.collection(fb.fs, "catalogo/" + nid + "/productos"), snap => {
      cat.actual = new Map(snap.docs.map(d => { const x = { ...d.data() }; delete x.actualizado; return [d.id, JSON.stringify(x)]; }));
      cat.listo = true;
      webProgramar();
    }, () => {}));
    return;
  }
  webProgramar();
}
function webProgramar() { clearTimeout(webTimer); webTimer = setTimeout(webPublicar, 1500); }
// escribe solo lo que cambió; el vendedor solo puede actualizar stock (lo demás lo completa el administrador)
async function webPublicar() {
  const cat = webCat;
  if (!cat || !cat.listo || !webVinculada()) return;
  const { F, fs } = fb, base = "catalogo/" + cat.nid + "/productos/", admin = puede("producto.editar");
  const ahora = new Date().toISOString();
  const quiere = new Map(S.products.filter(p => p.web).map(p => [p.id, webPublico(p)]));
  for (const [id, body] of quiere) {
    const antes = cat.actual.get(id);
    if (antes === JSON.stringify(body)) continue;
    // si solo falta algo que el vendedor no puede escribir (p. ej. el precio), espera al administrador en vez de reintentar sin fin
    if (!admin && antes && webStockJson(JSON.parse(antes)) === webStockJson(body)) continue;
    const ref = F.doc(fs, base + id);
    const w = admin || !antes ? F.setDoc(ref, { ...body, actualizado: ahora })
      : F.updateDoc(ref, { stock: body.stock, variantes: body.variantes, actualizado: ahora });
    fbWrite(w).catch(() => {});
  }
  if (admin) for (const id of cat.actual.keys()) if (!quiere.has(id)) fbWrite(F.deleteDoc(F.doc(fs, base + id))).catch(() => {});
}

