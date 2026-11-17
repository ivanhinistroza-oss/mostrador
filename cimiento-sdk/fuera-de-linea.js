// Copia local y cola de escrituras para vender sin internet.
// El almacén se inyecta: IndexedDB en el navegador y memoria en las pruebas.
export class AlmacenMemoria {
  constructor() { this.filasGuardadas = new Map(); this.cola = new Map(); }
  async leer(k) { return this.filasGuardadas.get(k) ?? null; }
  async guardar(k, v) { this.filasGuardadas.set(k, v); }
  async guardarLote(filas) { for (const [k, v] of filas) this.filasGuardadas.set(k, v); }
  async borrar(k) { this.filasGuardadas.delete(k); }
  async listar(prefijo) { return [...this.filasGuardadas].filter(([k]) => k.startsWith(prefijo)).map(([, v]) => v); }
  async encolar(entrada) { this.cola.set(entrada.id, entrada); }
  async pendientes() { return [...this.cola.values()]; }
  async quitar(id) { this.cola.delete(id); }
}

const LOTE = 250;

const masReciente = (a, b) => (b && (!a || b > a) ? b : a);

export class FueraDeLinea {
  constructor(almacen, enviar, avisar = () => {}, usuarioActual = () => undefined) {
    this.almacen = almacen;
    this.enviar = enviar;
    this.avisar = avisar;
    this.usuarioActual = usuarioActual;
    this.procesando = null;
    this.orden = 0;
    /** Se llama después de enviar algo: el servidor pudo cambiar lo enviado, como el folio. */
    this.alEnviar = () => {};
  }

  leer(clave) { return this.almacen.leer(clave); }

  /** Por partes y soltando el hilo: 20.000 filas no deben congelar la pantalla. */
  async guardarFilas(usuario, tabla, filas) {
    for (let i = 0; i < filas.length; i += LOTE) {
      await this.almacen.guardarLote(filas.slice(i, i + LOTE).map(f => [`${usuario}:${tabla}:${f.key}`, f]));
      await new Promise(r => setTimeout(r, 0));
    }
  }

  filas(usuario, tabla) { return this.almacen.listar(`${usuario}:${tabla}:`); }

  marca(usuario, tabla, negocio) {
    return this.almacen.leer(`${usuario}:marca:${tabla}:${negocio}`);
  }

  async guardarMarca(usuario, tabla, negocio, valor) {
    const previa = await this.marca(usuario, tabla, negocio);
    if (valor && (!previa || valor > previa)) await this.almacen.guardar(`${usuario}:marca:${tabla}:${negocio}`, valor);
  }

  /**
   * Devuelve las filas al día sin bajar todo si ya hay copia local. La marca solo avanza con
   * fechas del servidor. En una descarga completa, la pantalla no espera a que se guarde:
   * la marca se escribe al terminar, y si la página se cierra antes, se descarga otra vez.
   */
  async sincronizarCambios({ usuario, tabla, negocio, leerCambios, leerBorrados, leerCompleto, perteneceAConsulta = () => true, ahora = Date.now(), horaServidor = null }) {
    const marca = await this.marca(usuario, tabla, negocio);
    const completa = !marca || ahora - Date.parse(marca) > 6 * 24 * 60 * 60 * 1000;
    if (completa) {
      const filas = await leerCompleto();
      const mayor = masReciente(horaServidor, filas.reduce((valor, fila) => masReciente(valor, fila.actualizado), null));
      this.copiaGuardada = this.reemplazar(usuario, tabla, filas, perteneceAConsulta)
        .then(() => this.guardarMarca(usuario, tabla, negocio, mayor));
      this.copiaGuardada.catch(() => {});
      return filas;
    }
    const desde = restarMinutosIso(marca, 2);
    const [filas, borrados] = await Promise.all([leerCambios(desde), leerBorrados(desde)]);
    const actuales = new Map((await this.filas(usuario, tabla)).map(f => [f.key, f]));
    // Primero los borrados: algo borrado y creado otra vez debe quedar.
    for (const borrado of borrados) actuales.delete(borrado.clave);
    for (const fila of filas) actuales.set(fila.key, fila);
    // La hora del servidor es de antes de leer: aunque nada haya cambiado, la marca avanza
    // y la próxima vez no vuelve a pedir lo mismo.
    const mayor = [horaServidor, ...filas.map(f => f.actualizado), ...borrados.map(f => f.creado)].reduce(masReciente, marca);
    this.copiaGuardada = (async () => {
      for (const borrado of borrados) await this.almacen.borrar(`${usuario}:${tabla}:${borrado.clave}`);
      await this.guardarFilas(usuario, tabla, filas);
      await this.guardarMarca(usuario, tabla, negocio, mayor);
    })();
    this.copiaGuardada.catch(() => {});
    return [...actuales.values()];
  }

  /** Guarda lo que llegó del servidor y olvida lo que ya no existe allá, entre las filas de esa consulta. */
  async reemplazar(usuario, tabla, filas, perteneceAConsulta) {
    await this.guardarFilas(usuario, tabla, filas);
    const vigentes = new Set(filas.map(f => f.key));
    for (const fila of await this.filas(usuario, tabla)) {
      if (!vigentes.has(fila.key) && perteneceAConsulta(fila)) await this.almacen.borrar(`${usuario}:${tabla}:${fila.key}`);
    }
  }

  async encolar(trabajo) {
    const entrada = {
      id: crypto.randomUUID(),
      // Dos ventas en el mismo milisegundo conservan su orden.
      creada: Date.now() * 1000 + (++this.orden % 1000),
      uid: this.usuarioActual(),
      estado: "pendiente",
      ...(Array.isArray(trabajo) ? { ops: trabajo } : trabajo),
    };
    await this.almacen.encolar(entrada);
    return entrada;
  }

  /** Lo que falló de forma definitiva, para poder mostrarlo o revisarlo. */
  async apartadas() {
    return (await this.almacen.pendientes()).filter(e => e.estado === "apartada");
  }

  async #enviarUna(entrada) {
    for (let intento = 0; ; intento += 1) {
      try {
        await this.enviar(entrada);
        return;
      } catch (error) {
        // Otra caja usó ese folio mientras esta no tenía internet: la venta toma el siguiente.
        const notas = (entrada.ops || []).filter(op => op.t === "notes" && op.d?.folio != null);
        if (error?.code !== "already-exists" || !notas.length || intento >= 999) throw error;
        notas.forEach(op => { op.d.folio += 1; });
        await this.almacen.encolar(entrada);
      }
    }
  }

  async #enviarPendientes() {
    const usuario = this.usuarioActual();
    const entradas = (await this.almacen.pendientes()).sort((a, b) => a.creada - b.creada);
    let enviadas = 0;
    const terminar = () => { if (enviadas) this.alEnviar(); };
    for (const entrada of entradas) {
      if (entrada.estado === "apartada") continue;
      // Una venta se envía con la cuenta que la hizo, nunca con la que entró después.
      if (entrada.uid !== usuario) continue;
      try {
        await this.#enviarUna(entrada);
        await this.almacen.quitar(entrada.id);
        enviadas += 1;
      } catch (error) {
        // Sin red o sin sesión todavía: se reintenta después, en el mismo orden.
        if (error?.code === "unavailable" || error?.status === 401 || globalThis.navigator?.onLine === false) return terminar();
        entrada.estado = "apartada";
        entrada.error = String(error?.message || error);
        await this.almacen.encolar(entrada);
        this.avisar({ tipo: "escritura-apartada", mensaje: `No se pudo sincronizar una operación: ${entrada.error}`, operacion: entrada });
      }
    }
    return terminar();
  }

  enviarCola() {
    if (this.procesando) return this.procesando;
    const corre = globalThis.navigator?.locks
      ? globalThis.navigator.locks.request("mostrador.cola-escrituras", () => this.#enviarPendientes())
      : this.#enviarPendientes();
    this.procesando = corre.finally(() => { this.procesando = null; });
    return this.procesando;
  }
}

function restarMinutosIso(valor, minutos) {
  const precision = valor.match(/\.(\d+)(?=Z|[+-])/);
  const fraccion = precision ? `.${precision[1]}` : "";
  const fecha = new Date(Date.parse(valor) - minutos * 60_000);
  return `${fecha.toISOString().replace(/\.\d{3}Z$/, "")}${fraccion || ".000"}Z`;
}
