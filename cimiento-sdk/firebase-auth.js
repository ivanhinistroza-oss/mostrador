// Las funciones de Firebase Auth que usa Mostrador, sobre las cuentas de Cimiento.
import { errorCon, escucharSesion, guardarSesion, pedir, sesionActual } from "./nucleo.js";

const CLAVE_NOMBRE = "mostrador.cimiento.nombre";
const auth = { currentUser: null, languageCode: "es" };

function usuario(s) {
  if (!s) return null;
  let displayName = null;
  try { displayName = localStorage.getItem(`${CLAVE_NOMBRE}.${s.uid}`); } catch {}
  return { uid: s.uid, email: s.email, displayName };
}

function aplicar(s) {
  const antes = auth.currentUser?.uid;
  auth.currentUser = usuario(s);
  return antes !== auth.currentUser?.uid;
}
aplicar(sesionActual());

export function getAuth() { return auth; }

export function onAuthStateChanged(_auth, cb) {
  setTimeout(() => cb(auth.currentUser), 0);
  return escucharSesion(s => { if (aplicar(s)) cb(auth.currentUser); });
}

function traducir(e, tipo) {
  if (e.code === "unavailable") return errorCon("auth/network-request-failed");
  if (e.code === "too-many-requests") return errorCon("auth/too-many-requests");
  if (tipo === "crear") {
    if (e.code === "already-exists") return errorCon("auth/email-already-in-use");
    if (/contraseña/i.test(e.message)) return errorCon("auth/weak-password");
    return errorCon("auth/invalid-email");
  }
  return errorCon("auth/invalid-credential");
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
  try {
    const datos = await pedir("/auth/v1/signup", { method: "POST", sinSesion: true, body: { email, password } });
    guardarSesion(datos);
    return { user: auth.currentUser };
  } catch (e) { throw traducir(e, "crear"); }
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  try {
    const datos = await pedir("/auth/v1/login", { method: "POST", sinSesion: true, body: { email, password } });
    guardarSesion(datos);
    return { user: auth.currentUser };
  } catch (e) { throw traducir(e, "entrar"); }
}

export async function signOut() {
  // Aunque no haya internet, en este equipo la sesión se cierra.
  await pedir("/auth/v1/logout", { method: "POST", body: {} }).catch(() => {});
  guardarSesion(null);
}

export async function updateProfile(user, { displayName }) {
  user.displayName = displayName;
  try { localStorage.setItem(`${CLAVE_NOMBRE}.${user.uid}`, displayName); } catch {}
}

export async function sendPasswordResetEmail(_auth, email) {
  try {
    await pedir("/auth/v1/recover", { method: "POST", sinSesion: true, body: { email } });
  } catch (e) { throw traducir(e, "entrar"); }
}
