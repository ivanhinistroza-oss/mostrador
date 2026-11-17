// Conexión con Cimiento: sesión, peticiones y avisos en vivo.
// Mostrador sigue hablando "Firebase"; estos archivos traducen esas llamadas.
import * as config from "./config.js";

const { CIMIENTO_URL } = config;
/** "ws": servidor en Cloudflare Workers (una sala por tienda). Si no, el servidor Node (SSE). */
export const TIEMPO_REAL = config.CIMIENTO_TIEMPO_REAL || "sse";

const CLAVE_SESION = "mostrador.cimiento.sesion";
const MARGEN_MS = 60_000;

let horaServidor = null;
/** Última hora informada por el servidor; el reloj del equipo puede estar mal. */
export const ultimaHoraServidor = () => horaServidor;

export function errorCon(codigo, mensaje) {
  return Object.assign(new Error(mensaje || codigo), { code: codigo });
}

function leerSesion() {
  try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || "null"); } catch { return null; }
}
let sesion = leerSesion();
const alCambiarSesion = new Set();

export function escucharSesion(cb) { alCambiarSesion.add(cb); return () => alCambiarSesion.delete(cb); }
export function sesionActual() { return sesion; }

function reclamos(token) {
  const parte = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(decodeURIComponent(escape(atob(parte))));
}

export function guardarSesion(datos) {
  if (datos) {
    const claims = reclamos(datos.access_token);
    sesion = {
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
      vence: claims.exp * 1000,
      uid: claims.sub,
      email: datos.user?.email || claims.email,
    };
    try { localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)); } catch {}
  } else {
    sesion = null;
    try { localStorage.removeItem(CLAVE_SESION); } catch {}
  }
  alCambiarSesion.forEach(cb => cb(sesion));
}

// Otra pestaña renovó la sesión o salió.
window.addEventListener("storage", e => {
  if (e.key !== CLAVE_SESION) return;
  const antes = sesion?.uid;
  sesion = leerSesion();
  if (antes !== sesion?.uid) alCambiarSesion.forEach(cb => cb(sesion));
});

async function renovarAhora() {
  const actual = leerSesion();
  if (!actual) return null;
  // Otra pestaña pudo renovarla mientras esta esperaba su turno.
  if (actual.vence - Date.now() > MARGEN_MS) { sesion = actual; return actual; }
  if (globalThis.navigator?.onLine === false) return actual;
  const res = await fetch(`${CIMIENTO_URL}/auth/v1/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: actual.refresh_token }),
  });
  if (res.status === 401 || res.status === 400) {
    window.dispatchEvent(new CustomEvent("mostrador:aviso", { detail: { mensaje: "La sesión venció y no se pudo renovar. Las ventas pendientes siguen guardadas; vuelve a entrar cuando tengas conexión." } }));
    return actual;
  }
  if (!res.ok) throw errorCon("unavailable");
  guardarSesion(await res.json());
  return sesion;
}

let renovando = null;
// Cada renovación gasta el token anterior: con varias pestañas, va una a la vez.
function renovar() {
  if (!renovando) {
    const tarea = navigator.locks ? navigator.locks.request("mostrador.sesion", renovarAhora) : renovarAhora();
    renovando = tarea.finally(() => { renovando = null; });
  }
  return renovando;
}

export async function tokenVigente() {
  if (!sesion) return null;
  if (sesion.vence - Date.now() < MARGEN_MS) {
    try { await renovar(); } catch (e) { if (globalThis.navigator?.onLine !== false) throw e; }
  }
  return sesion?.access_token ?? null;
}

function errorDeRespuesta(status, cuerpo) {
  const mensaje = cuerpo?.error;
  if (status === 401 || status === 403) return Object.assign(errorCon("permission-denied", mensaje), { status });
  if (status === 404) return errorCon("not-found", mensaje);
  if (status === 409) return errorCon("already-exists", mensaje);
  if (status === 429) return errorCon("too-many-requests", mensaje);
  if (status >= 500) return errorCon("unavailable", mensaje);
  return errorCon("invalid-argument", mensaje);
}

/** Petición con la sesión actual. Lanza errores con el mismo code que Firebase. */
export async function pedir(ruta, { method = "GET", body, sinSesion = false } = {}) {
  const headers = {};
  if (!sinSesion) {
    const token = await tokenVigente();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(CIMIENTO_URL + ruta, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw errorCon("unavailable", "Sin conexión.");
  }
  const fecha = res.headers.get("date");
  if (fecha) horaServidor = new Date(fecha).toISOString();
  const texto = await res.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch {}
  if (!res.ok) throw errorDeRespuesta(res.status, cuerpo);
  return cuerpo;
}

export const rpc = (nombre, args) => pedir(`/rest/v1/rpc/${nombre}`, { method: "POST", body: args });

/**
 * Una sola conexión en vivo para todas las tablas. alCambiar recibe cada cambio.
 * alReconectar(perdioDatos) avisa al volver: si true, hay que releer todo.
 */
export function escucharTablas(tablas, alCambiar, alReconectar) {
  const control = new AbortController();
  let espera = 1000;
  let primera = true;
  (async () => {
    while (!control.signal.aborted) {
      let limpio = false;
      try {
        const token = await tokenVigente();
        if (!token) return;
        const res = await fetch(`${CIMIENTO_URL}/realtime/v1?tablas=${tablas.join(",")}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: control.signal,
        });
        if (!res.ok) throw errorCon("unavailable");
        espera = 1000;
        // También si la página abrió sin internet: lo que se ve puede estar atrasado.
        if (!primera) alReconectar(true);
        primera = false;
        const lector = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let resto = "";
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          resto += value;
          const bloques = resto.split("\n\n");
          resto = bloques.pop();
          for (const bloque of bloques) {
            const tipo = /^event: (.*)$/m.exec(bloque)?.[1];
            const datos = /^data: (.*)$/m.exec(bloque)?.[1];
            if (tipo === "cambio") alCambiar(JSON.parse(datos));
            if (tipo === "perdidos") alReconectar(true);
          }
        }
        limpio = true;
      } catch {
        if (control.signal.aborted) return;
        primera = false;
      }
      await new Promise(r => setTimeout(r, limpio ? 200 : espera));
      if (!limpio) espera = Math.min(espera * 2, 30_000);
    }
  })();
  return () => control.abort();
}

/**
 * Avisos en vivo de una tienda por WebSocket (servidor en Cloudflare Workers).
 * Mismo contrato que escucharTablas: alCambiar({table, row}) y alReconectar(true) al volver,
 * para releer lo que pudo cambiar mientras no hubo conexión.
 */
export function escucharTienda(negocio, alCambiar, alReconectar) {
  let cerrado = false;
  let ws = null;
  let latido = null;
  let espera = 1000;
  let primera = true;
  let reintento = null;
  const base = CIMIENTO_URL.replace(/^http/, "ws");
  const abrir = async () => {
    if (cerrado) return;
    const token = await tokenVigente().catch(() => null);
    if (!token || cerrado) return;
    // El token va como subprotocolo: el navegador no deja poner encabezados en un WebSocket.
    ws = new WebSocket(`${base}/realtime/v1/tienda/${encodeURIComponent(negocio)}`, ["cimiento", token]);
    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.tipo === "listo") {
        espera = 1000;
        if (!primera) alReconectar(true);
        primera = false;
      } else if (m.tipo === "cambios") {
        for (const ev of m.eventos || []) alCambiar(ev);
      } else if (m.tipo === "perdidos") {
        alReconectar(true);
      } else if (m.tipo === "sin_acceso" || m.tipo === "sesion_vencida") {
        try { ws.close(); } catch {}
      }
    };
    // Un ping cada 30 s mantiene viva la conexión en redes móviles; la sala lo contesta sin despertarse.
    latido = setInterval(() => { if (ws && ws.readyState === 1) ws.send("ping"); }, 30000);
    ws.onclose = () => {
      clearInterval(latido);
      if (cerrado) return;
      primera = false;
      reintento = setTimeout(abrir, espera);
      espera = Math.min(espera * 2, 30000);
    };
  };
  void abrir();
  return () => {
    cerrado = true;
    clearTimeout(reintento);
    clearInterval(latido);
    try { if (ws) ws.close(1000, "fin"); } catch {}
  };
}
