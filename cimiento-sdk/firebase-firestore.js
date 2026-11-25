// Las funciones de Firestore que usa Mostrador, sobre tablas de Cimiento.
// Cada documento es una fila: key, negocio_id, id y data (el contenido en JSON).
import { ultimaHoraServidor, errorCon, escucharSesion, escucharTablas, escucharTienda, pedir, rpc as llamar, sesionActual, TIEMPO_REAL } from "./nucleo.js";
import { FueraDeLinea } from "./fuera-de-linea.js";

class AlmacenIDB {
  constructor() {
    this.db = new Promise((resolve, reject) => {
      const r = indexedDB.open("mostrador-cimiento-v1", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("filas");
        r.result.createObjectStore("cola", { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async trans(almacen, modo, accion) {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const t = db.transaction(almacen, modo);
      const r = accion(t.objectStore(almacen));
      t.oncomplete = () => resolve(r?.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  }
  leer(k) { return this.trans("filas", "readonly", s => s.get(k)).then(v => v ?? null); }
  guardar(k, v) { return this.trans("filas", "readwrite", s => s.put(v, k)); }
  guardarLote(filas) { return this.trans("filas", "readwrite", s => { filas.forEach(([k, v]) => s.put(v, k)); }); }
  borrar(k) { return this.trans("filas", "readwrite", s => s.delete(k)); }
  listar(prefijo) {
    const rango = IDBKeyRange.bound(prefijo, prefijo + "\uffff");
    return this.trans("filas", "readonly", s => s.getAll(rango));
  }
  encolar(v) { return this.trans("cola", "readwrite", s => s.put(v)); }
  pendientes() { return this.trans("cola", "readonly", s => s.getAll()); }
  quitar(id) { return this.trans("cola", "readwrite", s => s.delete(id)); }
}

const fuera = new FueraDeLinea(
  new AlmacenIDB(),
  e => (e.funcion ? llamar(e.funcion, e.args) : llamar("lote", { ops: e.ops })),
  e => window.dispatchEvent(new CustomEvent("mostrador:aviso", { detail: e })),
  () => sesionActual()?.uid,
);
window.addEventListener("online", () => fuera.enviarCola());
setInterval(() => { if (navigator.onLine) void fuera.enviarCola(); }, 15000);
escucharSesion(s => { if (s) fuera.enviarCola(); });
export { FueraDeLinea };

const POR_PAGINA = 1000;
const TABLAS_EN_VIVO = ["products", "notes", "quotes", "pedidos", "cajas", "settings", "miembros", "invitaciones", "catalogo_productos", "eliminados"];
const SUBCOLECCIONES = new Set(["miembros", "products", "notes", "quotes", "pedidos", "pedido_eventos", "pedidos_fotos", "cajas", "settings", "nombres"]);
// Solo estos campos existen como columnas para filtrar y ordenar.
const COLUMNAS = { fecha: "fecha", folio: "folio", abiertaEn: "abierta_en", negocioId: "negocio_id", actualizado: "actualizado", creado: "creado", pedidoId: "pedido_id" };

// ---------- valores especiales ----------
export class Timestamp {
  constructor(ms) { this.ms = ms; }
  static fromMillis(ms) { return new Timestamp(ms); }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
}
const SERVIDOR = Symbol("serverTimestamp");
export const serverTimestamp = () => SERVIDOR;

function aJson(valor) {
  if (valor === SERVIDOR) return { __ts: Date.now() };
  if (valor instanceof Timestamp) return { __ts: valor.ms };
  if (Array.isArray(valor)) return valor.map(aJson);
  if (valor && typeof valor === "object") {
    const salida = {};
    for (const [k, v] of Object.entries(valor)) if (v !== undefined) salida[k] = aJson(v);
    return salida;
  }
  return valor;
}
function deJson(valor) {
  if (Array.isArray(valor)) return valor.map(deJson);
  if (valor && typeof valor === "object") {
    if (typeof valor.__ts === "number" && Object.keys(valor).length === 1) return new Timestamp(valor.__ts);
    const salida = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = deJson(v);
    return salida;
  }
  return valor;
}

// ---------- referencias ----------
function resolver(ruta) {
  const p = ruta.split("/");
  if (p[0] === "negocios" && p.length >= 3) {
    if (!SUBCOLECCIONES.has(p[2])) throw errorCon("invalid-argument", `Colección desconocida: ${p[2]}`);
    return { tabla: p[2], negocio: p[1], id: p[3] };
  }
  if (p[0] === "catalogo" && p.length >= 3) return { tabla: "catalogo_productos", negocio: p[1], id: p[3] };
  if (["usuarios", "negocios", "invitaciones", "catalogo"].includes(p[0])) {
    return { tabla: p[0], negocio: p[0] === "usuarios" || p[0] === "invitaciones" ? null : p[1], id: p[1] };
  }
  throw errorCon("invalid-argument", `Ruta desconocida: ${ruta}`);
}
const claveDe = r => (["usuarios", "negocios", "invitaciones", "catalogo"].includes(r.tabla) ? r.id : `${r.negocio}/${r.id}`);

function nuevoId() {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return [...crypto.getRandomValues(new Uint8Array(20))].map(b => letras[b % letras.length]).join("");
}

export const getFirestore = () => ({});
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});

export function collection(_fs, ruta) { return { tipo: "coleccion", ...resolver(ruta) }; }
export function doc(primero, ruta) {
  if (primero?.tipo === "coleccion") return { tipo: "doc", tabla: primero.tabla, negocio: primero.negocio, id: nuevoId() };
  return { tipo: "doc", ...resolver(ruta) };
}
export const where = (campo, op, valor) => ({ clase: "where", campo, op, valor });
export const orderBy = (campo, dir = "asc") => ({ clase: "orderBy", campo, dir });
export const limit = n => ({ clase: "limit", n });
export function query(col, ...partes) { return { ...col, partes }; }

// ---------- leer ----------
const snapDoc = (id, data) => ({ id, exists: () => data !== undefined, data: () => data && deJson(data) });

function filtros(q) {
  const params = new URLSearchParams();
  if (q.negocio) params.set("negocio_id", `eq.${q.negocio}`);
  let tope = null;
  let orden = null;
  for (const parte of q.partes || []) {
    if (parte.clase === "where") {
      const col = COLUMNAS[parte.campo];
      if (!col) throw errorCon("invalid-argument", `No se puede filtrar por ${parte.campo}`);
      const op = { "==": "eq", ">=": "gte", ">": "gt", "<=": "lte", "<": "lt" }[parte.op];
      params.set(col, `${op}.${parte.valor}`);
    } else if (parte.clase === "orderBy") {
      orden = `${COLUMNAS[parte.campo]}.${parte.dir}`;
    } else if (parte.clase === "limit") {
      tope = parte.n;
    }
  }
  return { params, tope, orden };
}

/** Trae todas las filas de una consulta, por páginas. */
async function leerFilas(q) {
  const { params, tope, orden } = filtros(q);
  if (orden || tope) {
    if (orden) params.set("order", orden);
    params.set("limit", String(tope ?? POR_PAGINA));
    return pedir(`/rest/v1/${q.tabla}?${params}`);
  }
  // Por clave y no por desplazamiento: no se saltan filas si algo cambia a mitad de la lectura.
  const todas = [];
  let ultima = null;
  for (;;) {
    const p = new URLSearchParams(params);
    p.set("order", "key.asc");
    p.set("limit", String(POR_PAGINA));
    if (ultima !== null) p.set("key", `gt.${ultima}`);
    const filas = await pedir(`/rest/v1/${q.tabla}?${p}`);
    todas.push(...filas);
    if (filas.length < POR_PAGINA) return todas;
    ultima = filas[filas.length - 1].key;
  }
}

async function leerTablaDesde(tabla, negocio, columna, marca) {
  const params = new URLSearchParams({ negocio_id: `eq.${negocio}`, [columna]: `gte.${marca}` });
  const todas = [];
  let ultima = null;
  for (;;) {
    const pagina = new URLSearchParams(params);
    pagina.set("order", "key.asc");
    pagina.set("limit", String(POR_PAGINA));
    if (ultima !== null) pagina.set("key", `gt.${ultima}`);
    const filas = await pedir(`/rest/v1/${tabla}?${pagina}`);
    todas.push(...filas);
    if (filas.length < POR_PAGINA) return todas;
    ultima = filas[filas.length - 1].key;
  }
}

async function sincronizarTabla(uid, q) {
  if (q.tipo === "doc" || q.tabla !== "products" || (q.partes || []).some(p => p.clase === "limit")) {
    return leerFilas(q);
  }
  const filas = await fuera.sincronizarCambios({
    usuario: uid,
    tabla: q.tabla,
    negocio: q.negocio,
    horaServidor: ultimaHoraServidor(),
    perteneceAConsulta: fila => fila.negocio_id === q.negocio,
    leerCompleto: () => leerFilas(q),
    leerCambios: marca => leerTablaDesde(q.tabla, q.negocio, "actualizado", marca),
    leerBorrados: async marca => (await leerTablaDesde("eliminados", q.negocio, "creado", marca)).filter(b => b.tabla === q.tabla),
  });
  return filas.filter(fila => coincide({ q }, fila));
}

function snapColeccion(filas, cambios = filas.length) {
  return {
    docs: filas.map(f => snapDoc(f.id, f.data)),
    metadata: { fromCache: false },
    docChanges: () => Array.from({ length: cambios }),
  };
}

export async function getDoc(ref) {
  const uid = sesionActual()?.uid || "anon", key = claveDe(ref);
  const local = await fuera.leer(`${uid}:${ref.tabla}:${key}`);
  try {
    const filas = await pedir(`/rest/v1/${ref.tabla}?key=eq.${encodeURIComponent(key)}`);
    for (const f of filas) await fuera.almacen.guardar(`${uid}:${ref.tabla}:${f.key}`, f);
    return snapDoc(ref.id, filas[0]?.data);
  } catch (e) {
    if (e.code === "unavailable" && local) return { ...snapDoc(ref.id, local.data), metadata: { fromCache: true } };
    throw e;
  }
}
export async function getDocs(q) {
  const uid = sesionActual()?.uid || "anon";
  try {
    const filas = q.tabla === "products" ? await sincronizarTabla(uid, q) : await leerFilas(q);
    const visibles = filas.filter(f => coincide({ q }, f));
    void fuera.guardarFilas(uid, q.tabla, filas).catch(() => {});
    return snapColeccion(visibles);
  } catch (e) {
    if (e.code !== "unavailable") throw e;
    // Sin internet, una colección vacía en este equipo es una respuesta válida: la primera venta del día.
    const locales = (await fuera.filas(uid, q.tabla)).filter(f => coincide({ q }, f));
    const filas = ordenar({ q, filas: new Map(locales.map(f => [f.key, f])) });
    return { ...snapColeccion(filas), metadata: { fromCache: true } };
  }
}
export const getDocsFromServer = getDocs;

// ---------- escuchar ----------
const oyentes = new Set();
let cortarVivo = null;

function coincide(oyente, fila) {
  const q = oyente.q;
  if (q.tipo === "doc") return fila.key === claveDe(q);
  if (q.negocio && fila.negocio_id !== q.negocio) return false;
  for (const parte of q.partes || []) {
    if (parte.clase !== "where") continue;
    const actual = fila[COLUMNAS[parte.campo]];
    if (parte.op === ">=" && !(actual >= parte.valor)) return false;
    if (parte.op === "==" && actual !== parte.valor) return false;
  }
  return true;
}

function ordenar(oyente) {
  const filas = [...oyente.filas.values()];
  const q = oyente.q;
  const orden = (q.partes || []).find(p => p.clase === "orderBy");
  const tope = (q.partes || []).find(p => p.clase === "limit");
  if (orden) {
    const col = COLUMNAS[orden.campo];
    const signo = orden.dir === "desc" ? -1 : 1;
    filas.sort((a, b) => (a[col] > b[col] ? signo : a[col] < b[col] ? -signo : 0));
  }
  return tope ? filas.slice(0, tope.n) : filas;
}

function avisar(oyente, fromCache = false) {
  const filas = ordenar(oyente);
  const cambios = oyente.pendientes || 0;
  oyente.pendientes = 0;
  if (oyente.q.tipo === "doc") {
    oyente.cb({ ...snapDoc(oyente.q.id, filas[0]?.data), metadata: { fromCache } });
  } else {
    oyente.cb({ ...snapColeccion(filas, cambios), metadata: { fromCache } });
  }
}

function programar(oyente) {
  oyente.pendientes = (oyente.pendientes || 0) + 1;
  if (oyente.timer) return;
  // Varios cambios seguidos se juntan en un solo redibujo.
  oyente.timer = setTimeout(() => { oyente.timer = null; if (oyentes.has(oyente)) avisar(oyente); }, 60);
}

// Lo que llega en vivo también va a la copia local, de a tandas: si se corta internet
// justo después, la caja debe tener el stock que ya vio en pantalla.
const porGuardar = new Map();
let guardando = null;
function guardarEnCopia(tabla, fila) {
  const lista = porGuardar.get(tabla) ?? [];
  lista.push(fila);
  porGuardar.set(tabla, lista);
  if (guardando) return;
  guardando = setTimeout(() => {
    guardando = null;
    const uid = sesionActual()?.uid || "anon";
    for (const [nombre, filas] of porGuardar) void fuera.guardarFilas(uid, nombre, filas).catch(() => {});
    porGuardar.clear();
  }, 500);
}

function aplicarFila(tabla, fila) {
  guardarEnCopia(tabla, fila);
  for (const o of oyentes) {
    if (o.q.tabla !== tabla) continue;
    if (coincide(o, fila)) { o.filas.set(fila.key, fila); programar(o); }
    else if (o.filas.delete(fila.key)) programar(o);
  }
}
function quitarFila(tabla, key) {
  void fuera.almacen.borrar(`${sesionActual()?.uid || "anon"}:${tabla}:${key}`).catch(() => {});
  for (const o of oyentes) if (o.q.tabla === tabla && o.filas.delete(key)) programar(o);
}

async function recargar(oyente) {
  const uid = sesionActual()?.uid || "anon";
  try {
    const local = oyente.q.tipo === "doc"
      ? [await fuera.leer(`${uid}:${oyente.q.tabla}:${claveDe(oyente.q)}`)].filter(Boolean)
      : await fuera.almacen.listar(`${uid}:${oyente.q.tabla}:`);
    const visibles = local.filter(f => coincide(oyente, f));
    if (visibles.length && oyentes.has(oyente)) { oyente.filas = new Map(visibles.map(f => [f.key, f])); avisar(oyente, true); }
  } catch {}
  try {
    // Primero lo que quedó pendiente: si no, leer del servidor borraría de la pantalla lo vendido sin internet.
    await fuera.enviarCola();
    const filas = oyente.q.tipo === "doc"
      ? await pedir(`/rest/v1/${oyente.q.tabla}?key=eq.${encodeURIComponent(claveDe(oyente.q))}`)
      : await sincronizarTabla(uid, oyente.q);
    if (!oyentes.has(oyente)) return;
    oyente.filas = new Map(filas.map(f => [f.key, f]));
    oyente.pendientes = filas.length;
    avisar(oyente);
    // La pantalla no espera a que se guarde la copia local.
    const conTope = (oyente.q.partes || []).some(p => p.clase === "limit");
    if (oyente.q.tabla === "products" && oyente.q.tipo !== "doc" && !conTope) {
      // sincronizarTabla ya dejó la copia al día.
    } else if (oyente.q.tipo !== "doc" && !conTope) {
      void fuera.reemplazar(uid, oyente.q.tabla, filas, f => coincide(oyente, f)).catch(() => {});
    } else {
      void fuera.guardarFilas(uid, oyente.q.tabla, filas).catch(() => {});
    }
  } catch (e) {
    if (oyentes.has(oyente)) oyente.err?.(e);
  }
}

fuera.alEnviar = () => { for (const o of oyentes) void recargar(o); };

const alCambiarVivo = ev => {
  if (ev.table === "eliminados") {
    if (ev.row) quitarFila(ev.row.tabla, ev.row.clave);
  } else if (ev.row) {
    aplicarFila(ev.table, ev.row);
  }
};
const alVolverVivo = () => { for (const o of oyentes) recargar(o); };
let negocioVivo = null;

function asegurarVivo() {
  if (TIEMPO_REAL === "ws") {
    // En Cloudflare hay una sala por tienda: se escucha la del negocio que está abierto.
    const negocio = [...oyentes].map(o => o.q.negocio).filter(Boolean).at(-1) || null;
    if (cortarVivo && negocio === negocioVivo) return;
    if (cortarVivo) { cortarVivo(); cortarVivo = null; }
    negocioVivo = negocio;
    if (negocio) cortarVivo = escucharTienda(negocio, alCambiarVivo, alVolverVivo);
    return;
  }
  if (cortarVivo) return;
  cortarVivo = escucharTablas(TABLAS_EN_VIVO, alCambiarVivo, alVolverVivo);
}
escucharSesion(s => { if (!s && cortarVivo) { cortarVivo(); cortarVivo = null; negocioVivo = null; } });

export function onSnapshot(q, a, b, c) {
  // onSnapshot(q, cb, err) u onSnapshot(q, opciones, cb, err)
  const cb = typeof a === "function" ? a : b;
  const err = typeof a === "function" ? b : c;
  const oyente = { q, cb, err, filas: new Map(), timer: null, pendientes: 0 };
  oyentes.add(oyente);
  asegurarVivo();
  recargar(oyente);
  return () => { oyentes.delete(oyente); clearTimeout(oyente.timer); };
}

// ---------- escribir ----------
function operacion(tipo, ref, datos) {
  const op = { o: tipo, t: ref.tabla, k: claveDe(ref), i: ref.id };
  op.n = ref.tabla === "invitaciones" ? datos?.negocioId : ref.negocio;
  if (datos !== undefined) op.d = aJson(datos);
  return op;
}

/** Las columnas calculadas de la base: sin ellas, una venta sin internet no entraría en los filtros. */
function conColumnas(fila) {
  const { data } = fila;
  if (data.folio !== undefined) fila.folio = data.folio;
  if (data.fecha !== undefined) fila.fecha = data.fecha;
  if (data.abiertaEn !== undefined) fila.abierta_en = data.abiertaEn;
  return fila;
}

/** Lo aceptado o puesto en cola se ve enseguida en este equipo, sin esperar el aviso en vivo. */
async function reflejar(ops) {
  const uid = sesionActual()?.uid || "anon";
  for (const op of ops) {
    const cacheKey = `${uid}:${op.t}:${op.k}`;
    if (op.o === "delete") await fuera.almacen.borrar(cacheKey);
    else {
      const guardada = await fuera.almacen.leer(cacheKey);
      const previa = guardada || [...oyentes].find(o => o.q.tabla === op.t)?.filas.get(op.k);
      const data = op.o === "update" ? { ...(previa?.data || {}), ...op.d } : op.d;
      await fuera.almacen.guardar(cacheKey, conColumnas({ ...(previa || {}), key: op.k, negocio_id: op.n ?? previa?.negocio_id, id: op.i, data }));
    }
    if (op.o === "delete") { quitarFila(op.t, op.k); continue; }
    for (const o of oyentes) {
      if (o.q.tabla !== op.t) continue;
      const previa = o.filas.get(op.k);
      if (op.o === "update" && !previa) continue;
      const data = op.o === "update" ? { ...previa.data, ...op.d } : op.d;
      const fila = conColumnas({ ...(previa || {}), key: op.k, negocio_id: op.n ?? previa?.negocio_id, id: op.i, data });
      if (coincide(o, fila)) { o.filas.set(op.k, fila); avisar(o); }
    }
  }
}

async function aplicar(ops) {
  if (!navigator.onLine) { await fuera.encolar(ops); await reflejar(ops); void fuera.enviarCola(); return; }
  try { await llamar("lote", { ops }); await reflejar(ops); }
  catch (e) { if (e.code !== "unavailable") throw e; await fuera.encolar(ops); await reflejar(ops); void fuera.enviarCola(); }
}

export const setDoc = (ref, datos) => aplicar([operacion("set", ref, datos)]);
export const updateDoc = (ref, datos) => aplicar([operacion("update", ref, datos)]);
export const deleteDoc = ref => aplicar([operacion("delete", ref)]);

export function writeBatch() {
  const ops = [];
  const lote = {
    set(ref, datos) { ops.push(operacion("set", ref, datos)); return lote; },
    update(ref, datos) { ops.push(operacion("update", ref, datos)); return lote; },
    delete(ref) { ops.push(operacion("delete", ref)); return lote; },
    commit: () => aplicar(ops),
  };
  return lote;
}

/** Función propia de la base; Mostrador la usa para el stock y las invitaciones. */
export async function rpc(nombre, args) {
  if (nombre === "unirme") {
    const respuesta = await llamar(nombre, args);
    // Para poder volver a entrar a este negocio sin internet.
    await getDoc({ tipo: "doc", tabla: "usuarios", negocio: null, id: sesionActual()?.uid }).catch(() => {});
    return respuesta;
  }
  // ajustar_stock (Mostrador antiguo) y movimiento (venta, anulación o conteo del Mostrador nuevo):
  // se pueden hacer sin internet. Llevan una operación única para que reenviarlos no descuente dos veces.
  if (nombre !== "ajustar_stock" && nombre !== "movimiento") return llamar(nombre, args);
  const payload = { ...args, operacion: crypto.randomUUID() };
  const piso = x => (payload.piso0 ? Math.max(0, x) : x);
  const reflejarStock = async () => {
    for (const it of payload.items || payload.deltas || []) for (const o of oyentes) {
      if (o.q.tabla !== "products") continue;
      const key = `${payload.negocio}/${it.id}`, f = o.filas.get(key);
      if (!f) continue;
      const data = structuredClone(f.data);
      if (it.variantId) {
        const v = (data.variantes || []).find(x => x.id === it.variantId);
        if (v) v.stock = piso(Number(v.stock || 0) + Number(it.delta));
        data.stock = (data.variantes || []).reduce((sum, x) => sum + Number(x.stock || 0), 0);
      } else data.stock = piso(Number(data.stock || 0) + Number(it.delta));
      f.data = data; await fuera.almacen.guardar(`${sesionActual()?.uid || "anon"}:products:${key}`, f); avisar(o);
    }
  };
  // La nota nueva o anulada también se ve enseguida en este equipo.
  const reflejarNota = async (r) => {
    const n = payload.negocio, ops = [];
    if (payload.nota && r) {
      const { id: _id, ...d } = payload.nota;
      ops.push({ o: "set", t: "notes", n, k: `${n}/${r.id}`, i: r.id, d: { ...d, folio: r.folio } });
    }
    if (payload.anular) ops.push({ o: "update", t: "notes", n, k: `${n}/${payload.anular}`, i: payload.anular, d: { estado: "anulada", anulada: new Date().toISOString() } });
    if (ops.length) await reflejar(ops);
  };
  const enCola = async () => {
    await fuera.encolar({ funcion: nombre, args: payload });
    await reflejarStock();
    // Sin internet la nota queda con el id y el folio de este equipo; el servidor lo respeta si está libre.
    const r = payload.nota ? { id: payload.nota.id, folio: payload.nota.folio } : null;
    if (nombre === "movimiento") await reflejarNota(r);
    void fuera.enviarCola();
    return r;
  };
  if (!navigator.onLine) return enCola();
  try {
    const r = await llamar(nombre, { ...payload, en_linea: true });
    await reflejarStock();
    if (nombre === "movimiento") await reflejarNota(r);
    return r;
  } catch (e) { if (e.code !== "unavailable") throw e; return enCola(); }
}
