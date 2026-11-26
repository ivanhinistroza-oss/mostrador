// ---------- estado ----------
const S = {
  products: [], notes: [], users: [], quotes: [], cajas: [], pedidos: [],
  settings: { negocio: "Mi negocio", moneda: "S/" },
  view: "inventario", group: "categoria", q: "", lowOnly: false,
  selNote: null, online: false, loaded: false,
};
let db = null, downloads = null;
// fuera de claude.ai, servida por http(s), la app usa Firebase; abierta como archivo sigue guardando en el navegador
const fbMode = !window.claude && /^https?:$/.test(location.protocol);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n2 = v => Number.isFinite(+v) ? +v : 0;
const money = v => S.settings.moneda + " " + n2(v).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = v => n2(v).toLocaleString("es", { maximumFractionDigits: 3 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const folioTxt = f => "NV-" + String(f).padStart(5, "0");
// una línea de descuento (precio negativo) no es una unidad vendida
const itemUnits = i => n2(i.precio) < 0 ? 0 : n2(i.cant);
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }); };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

let toastT;
function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600);
}

// ---------- semejanza ----------
const STOP = new Set("de la el los las del con sin para por en y x un una al tipo marca".split(" "));
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const stem = t => t.length > 4 ? t.replace(/(es|s)$/, "").slice(0, 6) : t;
function tokens(s) { return norm(s).split(" ").filter(t => t.length > 1 && !STOP.has(t) && !/\d/.test(t)).map(stem); }
function grams(s) { const t = "  " + norm(s) + " "; const g = new Set(); for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3)); return g; }
const simCache = new Map();
function feat(p) {
  const key = p.nombre;
  if (!simCache.has(key)) simCache.set(key, { tk: new Set(tokens(key)), gr: grams(key), first: tokens(key)[0] || "" });
  return simCache.get(key);
}
function similarity(a, b) {
  const A = feat(a), B = feat(b);
  let inter = 0; A.tk.forEach(t => B.tk.has(t) && inter++);
  const uni = A.tk.size + B.tk.size - inter;
  const jac = uni ? inter / uni : 0;
  let gi = 0; A.gr.forEach(g => B.gr.has(g) && gi++);
  const dice = (A.gr.size + B.gr.size) ? (2 * gi) / (A.gr.size + B.gr.size) : 0;
  let s = Math.max(jac, dice * 0.9);
  if (A.first && A.first === B.first) s = Math.max(s, 0.55);
  return Math.min(1, s);
}
// Texto de búsqueda de cada producto, guardado para no volver a normalizarlo en cada tecla.
const textoCache = new WeakMap();
const ordenEs = new Intl.Collator("es");
function productoTexto(p) {
  const crudo = [p.nombre, p.categoria, p.codigo, ...(p.variantes || []).flatMap(v => [v.talla, v.color, v.codigo])].join(" ");
  const guardado = textoCache.get(p);
  if (guardado && guardado.crudo === crudo) return guardado.texto;
  const texto = norm(crudo);
  textoCache.set(p, { crudo, texto });
  return texto;
}
// todas las palabras buscadas deben estar, en cualquier orden: «polo negro» encuentra «Polo algodón Negro»
const palabrasDe = q => norm(q).split(/\s+/).filter(Boolean);
const tieneTodas = (texto, palabras) => palabras.every(w => texto.includes(w));
const CATALOGO_GRANDE = 3000; // desde aquí no se compara por parecido contra todo el catálogo
function mostSimilar(name, excludeId, limit = 3) {
  if (!norm(name)) return [];
  const probe = { nombre: name };
  const palabras = palabrasDe(name).filter(w => w.length >= 3);
  const base = S.products.length > CATALOGO_GRANDE ? S.products.filter(p => palabras.some(w => productoTexto(p).includes(w))).slice(0, 1500) : S.products;
  return base.filter(p => p.id !== excludeId)
    .map(p => ({ p, s: similarity(probe, p) }))
    .filter(x => x.s >= 0.3).sort((a, b) => b.s - a.s).slice(0, limit);
}
function clusters(list) {
  const TH = 0.45, groups = [];
  [...list].sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre))).forEach(p => {
    let best = null, bs = 0;
    for (const g of groups) for (const m of g) { const s = similarity(p, m); if (s > bs) { bs = s; best = g; } }
    if (best && bs >= TH) best.push(p); else groups.push([p]);
  });
  const named = groups.filter(g => g.length > 1).map(g => {
    const freq = {}, orig = {};
    g.forEach(p => { const seen = new Set(); norm(p.nombre).split(" ").forEach(w => { if (w.length < 2 || STOP.has(w) || /\d/.test(w)) return; const k = stem(w); if (seen.has(k)) return; seen.add(k); freq[k] = (freq[k] || 0) + 1; orig[k] = orig[k] || w; }); });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    const label = top ? orig[top[0]][0].toUpperCase() + orig[top[0]].slice(1) : "Grupo";
    return { label: "Familia «" + label + "»", items: g };
  }).sort((a, b) => b.items.length - a.items.length);
  const singles = groups.filter(g => g.length === 1).flat();
  if (singles.length) named.push({ label: "Sin productos parecidos", items: singles, quiet: true });
  return named;
}

// ---------- datos ----------
const mem = { products: new Map(), notes: new Map(), users: new Map(), quotes: new Map(), cajas: new Map(), pedidos: new Map(), settings: null };
const PERMISOS = { admin: ["*"], vendedor: ["inventario.ver", "venta.crear", "nota.ver", "nota.imprimir", "cotizacion.ver", "cotizacion.crear", "caja.usar", "pedido.ver", "pedido.crear", "pedido.actualizar", "pedido.foto"] };
let sessionId = null;
let saleAdjusting = false;
let failedLogins = 0;
let loginBlockedUntil = 0;
let audit = store.get("mostrador.audit") || [];
function usuarioActual() {
  return S.users.find(u => u.id === sessionId && u.activo) || null;
}
function puede(permiso) {
  const user = usuarioActual();
  const allowed = PERMISOS[user?.rol] || [];
  return allowed.includes("*") || allowed.includes(permiso);
}
function registrarIntento(usuario, accion) {
  audit.unshift({ fecha: new Date().toISOString(), usuario: String(usuario || ""), accion });
  audit = audit.slice(0, 50);
  store.set("mostrador.audit", audit);
}
function exigir(permiso, accion) {
  if (puede(permiso)) return true;
  // sin sesión (pantalla de inicio o arranque) no hay nadie a quien avisar ni registrar
  if (!usuarioActual()) return false;
  registrarIntento(usuarioActual()?.usuario || "sesión", accion);
  toast("No tienes permiso para " + accion);
  return false;
}
async function hashPin(salt, pin) {
  if (!crypto.subtle) throw new Error("Este navegador no ofrece SHA-256 seguro. No se pueden crear usuarios.");
  const bytes = new TextEncoder().encode(salt + pin);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function makeSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
function storeSession(id) {
  try {
    if (id) sessionStorage.setItem("mostrador.session", id);
    else sessionStorage.removeItem("mostrador.session");
  } catch {}
}
async function crearUsuario(input) {
  if (!crypto.subtle) throw new Error("Este navegador no ofrece SHA-256 seguro. No se pueden crear usuarios.");
  const usuario = input.usuario.trim().toLowerCase();
  if (!usuario) throw new Error("Escribe un usuario.");
  if (S.users.some(u => u.usuario === usuario)) throw new Error("Ese usuario ya existe.");
  const salt = makeSalt();
  const pinHash = await hashPin(salt, input.pin);
  const user = {
    id: uid(), nombre: input.nombre.trim(), usuario,
    rol: input.rol, activo: true, salt, pinHash,
    creado: new Date().toISOString(),
  };
  S.users.push(user);
  await putUsers();
  return user;
}
async function iniciarSesion(usuario, pin) {
  if (Date.now() < loginBlockedUntil) {
    const seconds = Math.ceil((loginBlockedUntil - Date.now()) / 1000);
    renderLogin("Demasiados intentos. Espera " + seconds + " s antes de volver a intentar.");
    return false;
  }
  const user = S.users.find(u => u.usuario === usuario.trim().toLowerCase());
  if (user && !user.activo) {
    renderLogin("Usuario desactivado; habla con el administrador");
    return false;
  }
  const valid = user && await hashPin(user.salt, pin) === user.pinHash;
  if (!valid) {
    failedLogins++;
    if (failedLogins >= 5) {
      loginBlockedUntil = Date.now() + 30000;
      failedLogins = 0;
    }
    renderLogin("Usuario o PIN incorrecto");
    return false;
  }
  sessionId = user.id;
  storeSession(sessionId);
  failedLogins = 0;
  renderApp();
  return true;
}
function cerrarSesion() {
  if (fbMode) { if (fb) fb.A.signOut(fb.auth); return; }
  sessionId = null;
  storeSession(null);
  renderLogin();
}
function renderLogin(error = "") {
  // con Firebase, las pantallas de cuenta las decide onAuthStateChanged
  if (fbMode) return fbCargando();
  // fbPantalla (cuentas.js) oculta la app y prepara el recuadro; sirve también sin Firebase
  const el = fbPantalla("");
  const first = !S.users.length;
  const nameField = first ? '<label class="f"><span>Nombre</span><input name="nombre" required></label>' : "";
  const confirmField = first ? '<label class="f"><span>Confirmar PIN</span><input name="confirmacion" type="password" minlength="4" maxlength="12" required></label>' : "";
  const title = first ? "Crear administrador" : "Iniciar sesión";
  el.innerHTML = '<form class="auth-card" id="authForm"><h1>' + title + '</h1>' + nameField +
    '<label class="f"><span>Usuario</span><input name="usuario" autocomplete="username" required></label>' +
    '<label class="f"><span>PIN</span><input name="pin" type="password" minlength="4" maxlength="12" autocomplete="current-password" required></label>' +
    confirmField + '<p class="warnline">' + esc(error) + '</p><button class="btn primary" type="submit">' + title + '</button></form>';
  $("#authForm").onsubmit = async e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const usuario = String(data.get("usuario"));
    const pin = String(data.get("pin"));
    if (!first) return iniciarSesion(usuario, pin);
    if (pin.length < 4 || pin.length > 12 || pin !== data.get("confirmacion")) {
      return renderLogin("El PIN debe tener 4 a 12 caracteres y coincidir.");
    }
    try {
      const user = await crearUsuario({ nombre: data.get("nombre"), usuario, pin, rol: "admin" });
      sessionId = user.id;
      storeSession(sessionId);
      renderApp();
    } catch (err) {
      renderLogin(err.message);
    }
  };
}
function aplicarPermisosUI() {
  const admin = puede("usuarios.gestionar");
  document.querySelectorAll('[data-view="ventas"],[data-view="reportes"],[data-view="resumen"],[data-view="usuarios"]')
    .forEach(button => button.hidden = !admin);
  document.querySelector('[data-view="config"]').hidden = !puede("ajustes.editar");
  document.querySelector('[data-view="pedidos"]').hidden = !puede("pedido.ver");
  document.querySelector('[data-view="ingreso"]').hidden = !puede("stock.ajustar");
  $("#userMenu").hidden = false;
  const user = usuarioActual();
  const role = user?.rol === "admin" ? "Administrador" : "Vendedor";
  $("#userMenu").innerHTML = '<b>' + esc(user?.nombre || "") + '</b><span class="chip">' + role +
    '</span><button class="btn" id="logout">Cerrar sesión</button>';
  $("#logout").onclick = cerrarSesion;
}
function renderApp() {
  if (!usuarioActual()) return renderLogin();
  $("#authScreen")?.remove();
  document.querySelector("header.top").hidden = false;
  document.querySelector("main.wrap").hidden = false;
  aplicarPermisosUI();
  go(S.view);
}
async function putUsers() { if (db) await db.doc("settings/users").set({ list: S.users }); else { mem.users = new Map(S.users.map(u => [u.id, u])); syncMem(); } }
async function putProduct(p) {
  if (!exigir(editing ? "producto.editar" : "producto.crear", "guardar productos")) return;
  const body = { ...p }; delete body.id;
  if (db) await db.collection("products").doc(p.id).set(body);
  else { mem.products.set(p.id, { ...p }); syncMem(); }
}
// Firebase: el nombre se reserva en negocios/{id}/nombres/{nombre normalizado} en la misma transacción que guarda
// el producto; si otro equipo reservó ese nombre un instante antes, la transacción lo ve y no se guarda.
// Sin internet, o si las reglas nuevas aún no se publicaron, se guarda como antes (queda la revisión en pantalla).
async function putProductUnico(p, anterior) {
  if (!usaTransacciones()) return putProduct(p);
  if (!exigir(anterior ? "producto.editar" : "producto.crear", "guardar productos")) return;
  const clave = norm(p.nombre), viejaClave = anterior ? norm(anterior.nombre) : "";
  const body = { ...p }; delete body.id;
  if (navigator.onLine) {
    try {
      await fb.F.rpc("guardar_producto", { negocio: fb.negocioId, producto: p.id, datos: body, clave, clave_vieja: viejaClave || null });
      return;
    } catch (e) {
      if (e && e.code === "invalid-argument" && /Ya existe un producto/.test(e.message || "")) throw Object.assign(e, { aviso: e.message });
      if (e && e.code !== "unavailable" && !String(e.code).includes("permission")) throw e;
    }
  }
  // guardado sin reserva: se repasan los nombres cuando haya internet
  try { localStorage.setItem(NOMBRES_REVISAR, fb.negocioId); } catch {}
  return putProduct(p);
}
// Los productos que existían antes de las reservas (o guardados sin internet) no tienen su nombre reservado.
// Un administrador los reserva una vez por negocio; la marca settings/nombres (fuera de la colección de nombres,
// para que no pueda confundirse con ningún producto) evita volver a leer todo en cada apertura.
const NOMBRES_REVISAR = "mostrador.nombresRevisar";
let nombresRevisando = false;
async function nombresReservarExistentes() {
  if (nombresRevisando || !usaTransacciones() || !navigator.onLine || !puede("producto.editar")) return;
  nombresRevisando = true;
  const { F, fs } = fb, nid = fb.negocioId, base = "negocios/" + nid + "/";
  try {
    const listo = F.doc(fs, base + "settings/nombres");
    let revisar = false;
    try { revisar = localStorage.getItem(NOMBRES_REVISAR) === nid; } catch {}
    if (!revisar && (await F.getDoc(listo)).exists()) return;
    const [prods, nombres] = await Promise.all([
      F.getDocsFromServer(F.collection(fs, base + "products")),
      F.getDocsFromServer(F.collection(fs, base + "nombres")),
    ]);
    const existen = new Set(prods.docs.map(d => d.id));
    // una reserva cuenta solo si su producto sigue existiendo
    const usados = new Set(nombres.docs.filter(d => existen.has(d.data().productId)).map(d => d.id));
    const nuevos = [];
    prods.docs.forEach(d => {
      const k = norm(d.data().nombre);
      if (k && !usados.has(k)) { usados.add(k); nuevos.push([k, d.id]); }
    });
    for (let i = 0; i < nuevos.length; i += 400) {
      const b = F.writeBatch(fs);
      nuevos.slice(i, i + 400).forEach(([k, id]) => b.set(F.doc(fs, base + "nombres/" + k), { productId: id }));
      await b.commit();
    }
    await F.setDoc(listo, { reservados: true, fecha: new Date().toISOString() });
    try { if (localStorage.getItem(NOMBRES_REVISAR) === nid) localStorage.removeItem(NOMBRES_REVISAR); } catch {}
  } catch {
    // sin las reglas nuevas o sin conexión: se intenta otra vez la próxima vez
  } finally { nombresRevisando = false; }
}
addEventListener("online", () => setTimeout(nombresReservarExistentes, 2000));
async function patchProduct(id, patch) {
  if (!saleAdjusting && (Object.prototype.hasOwnProperty.call(patch, "stock") || Object.prototype.hasOwnProperty.call(patch, "variantes"))) { if (!exigir("stock.ajustar", "ajustar stock")) return; }
  if (db) await db.collection("products").doc(id).update(patch);
  else { const p = mem.products.get(id); if (p) Object.assign(p, patch); syncMem(); }
}
async function readProduct(id) {
  if (db) {
    const snap = await db.collection("products").doc(id).get();
    return snap.exists ? { id, ...snap.data() } : null;
  }
  const p = mem.products.get(id);
  return p ? { ...p, variantes: p.variantes?.map(v => ({ ...v })) } : null;
}
async function removeProduct(id) {
  if (!exigir("producto.eliminar", "eliminar productos")) return;
  if (db) await db.collection("products").doc(id).delete();
  else { mem.products.delete(id); syncMem(); }
}
async function putNote(n) {
  if (n.estado === "anulada" && !exigir("nota.anular", "anular notas")) return;
  const body = { ...n }; delete body.id;
  if (db) await db.collection("notes").doc(n.id).set(body);
  else { mem.notes.set(n.id, { ...n }); syncMem(); }
}
async function deleteNote(id) {
  if (db) await db.collection("notes").doc(id).delete();
  else { mem.notes.delete(id); syncMem(); }
}
async function putQuote(q) {
  const body = { ...q }; delete body.id;
  if (db) await db.collection("quotes").doc(q.id).set(body);
  else { mem.quotes.set(q.id, { ...q }); syncMem(); }
}
async function patchQuote(id, patch) {
  if (db) await db.collection("quotes").doc(id).update(patch);
  else { const q = mem.quotes.get(id); if (q) Object.assign(q, patch); syncMem(); }
}
async function deleteQuote(id) {
  if (!exigir("cotizacion.eliminar", "eliminar cotizaciones")) return;
  if (db) await db.collection("quotes").doc(id).delete();
  else { mem.quotes.delete(id); syncMem(); }
}
async function putSettings(s) {
  if (!exigir("ajustes.editar", "editar ajustes")) return;
  if (db) await db.doc("settings/app").set(s);
  else { mem.settings = s; S.settings = { negocio: "Mi negocio", moneda: "S/", ...s }; syncMem(); }
}
function syncMem() {
  S.products = [...mem.products.values()]; S.notes = [...mem.notes.values()]; S.users = [...mem.users.values()]; S.quotes = [...mem.quotes.values()]; S.cajas = [...mem.cajas.values()]; S.pedidos = [...mem.pedidos.values()];
  if (!db) {
    try { localStorage.setItem("mostrador.data", JSON.stringify({ products: S.products, notes: S.notes, users: S.users, quotes: S.quotes, cajas: S.cajas, pedidos: S.pedidos, settings: S.settings })); }
    catch { const b = $("#banner"); b.textContent = "No se pudo guardar en este navegador. Exporta una copia y libera espacio."; b.hidden = false; }
  }
  simCache.clear(); renderAll();
}
function failMsg(e) {
  if (e && e.aviso) return e.aviso;
  const c = e && e.code;
  if (c === "permission-denied") return "No tienes permiso para guardar esto.";
  if (c === "invalid_argument") return "No tienes permiso para guardar cambios en esta app.";
  if (c === "quota_exceeded") return "El almacén está lleno. Elimina notas o productos antiguos.";
  return "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.";
}



// ---- Datos para facturación electrónica (solo en el Mostrador con Cimiento; lo agrega preparar.mjs) ----
// Todavía NO se emite nada ni se conecta un proveedor: solo se guardan los datos que harán falta para boletas
// y facturas de SUNAT (Perú). Va al final de base.js, así queda disponible para Venta, Configuración y Producto.

// RUC: 11 dígitos, empieza con 10, 15, 16, 17 o 20, y el último dígito es el verificador (módulo 11 de SUNAT).
function rucValido(r) {
  r = String(r || "").trim();
  if (!/^(10|15|16|17|20)\d{9}$/.test(r)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + p * Number(r[i]), 0);
  const dv = (11 - (suma % 11)) % 10;
  return dv === Number(r[10]);
}
// Tipo del documento del cliente según lo escrito: "DNI", "RUC" (válido), "RUC?" (11 dígitos con error) u "Otro".
function docTipo(doc) {
  const d = String(doc || "").trim();
  if (!d) return "";
  if (/^\d{8}$/.test(d)) return "DNI";
  if (/^\d{11}$/.test(d)) return rucValido(d) ? "RUC" : "RUC?";
  return "Otro";
}
// Ayuda debajo de la casilla del documento en Nueva venta.
function docHint(doc) {
  const t = docTipo(doc);
  if (!t) return `<small class="doc-hint">Para factura se necesitará el RUC del cliente.</small>`;
  if (t === "DNI") return `<small class="doc-hint ok">✓ DNI · sirve para boleta</small>`;
  if (t === "RUC") return `<small class="doc-hint ok">✓ RUC válido · sirve para factura</small>`;
  if (t === "RUC?") return `<small class="doc-hint bad">Este RUC tiene un error: revisa los números.</small>`;
  return `<small class="doc-hint">Otro documento (carné de extranjería, pasaporte…)</small>`;
}
// Documento en el ticket: "DNI: …", "RUC: …" o "Doc.: …".
function docTxt(n) {
  const d = String(n.doc || "").trim();
  if (!d) return "";
  const t = n.docTipo || docTipo(d);
  return (t === "DNI" || t === "RUC" ? t : "Doc.") + ": " + d;
}

// Afectación del IGV de cada producto (catálogo 07 de SUNAT: 10 gravado, 20 exonerado, 30 inafecto).
const AFECTACION_IGV = [["gravado", "Gravado (con IGV)", "10"], ["exonerado", "Exonerado", "20"], ["inafecto", "Inafecto", "30"]];
// Unidades del Mostrador y su código de SUNAT (catálogo 03), para cuando se emitan comprobantes.
const UNIDAD_SUNAT = { und: "NIU", kg: "KGM", g: "GRM", L: "LTR", ml: "MLT", caja: "BX", paquete: "PK", docena: "DZN", m: "MTR" };

// Tarjeta "Facturación electrónica" en Configuración (el RUC y la razón social están en la tarjeta Negocio).
function factCard(s) {
  const campo = (label, key, ph, attrs = "") => `<label class="f"><span>${label}</span><input type="text" data-setting="${key}" value="${esc(s[key] || "")}" placeholder="${esc(ph)}" ${attrs}></label>`;
  const listo = rucValido(s.ruc) && String(s.razonSocial || "").trim() && String(s.direccion || "").trim();
  return `<div class="config-card fact-card">
          <h2>Facturación electrónica <span class="chip">Próximamente</span></h2>
          <p class="muted fact-nota">Todavía no se emiten boletas ni facturas. Estos datos quedan listos para cuando se conecte un proveedor de SUNAT.</p>
          <div class="fact-check ${listo ? "ok" : ""}">${listo ? "✓ RUC, razón social y dirección completos." : "Para emitir hará falta: RUC válido, razón social y dirección (en las tarjetas Negocio y Dirección)."}</div>
          <div class="row2">
            ${campo("Serie de boletas", "serieBoleta", "B001", 'maxlength="4" style="text-transform:uppercase"')}
            ${campo("Serie de facturas", "serieFactura", "F001", 'maxlength="4" style="text-transform:uppercase"')}
          </div>
          <div class="row2">
            ${campo("IGV (%)", "igvTasa", "18", 'inputmode="decimal" maxlength="5"')}
            <span></span>
          </div>
          <label class="check"><input type="checkbox" data-setting="preciosConIgv" ${s.preciosConIgv !== false ? "checked" : ""}> Los precios de mis productos ya incluyen IGV</label>
        </div>`;
}
// Revisa los datos antes de guardar la configuración; devuelve el aviso o "" si todo está bien.
function factValidar(v) {
  if (v.ruc && !/^\d{11}$/.test(v.ruc)) return "El RUC debe tener 11 dígitos.";
  if (v.ruc && !rucValido(v.ruc)) return "El RUC tiene un error: revisa los números.";
  if (v.serieBoleta) { v.serieBoleta = v.serieBoleta.toUpperCase(); if (!/^B[A-Z0-9]{3}$/.test(v.serieBoleta)) return "La serie de boletas es una B y 3 letras o números, por ejemplo B001."; }
  if (v.serieFactura) { v.serieFactura = v.serieFactura.toUpperCase(); if (!/^F[A-Z0-9]{3}$/.test(v.serieFactura)) return "La serie de facturas es una F y 3 letras o números, por ejemplo F001."; }
  if (v.igvTasa) { const t = Number(String(v.igvTasa).replace(",", ".")); if (!(t >= 0 && t <= 30)) return "El IGV debe ser un porcentaje entre 0 y 30."; v.igvTasa = String(t); }
  return "";
}
