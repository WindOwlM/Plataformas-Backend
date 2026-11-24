// Registro de errores: se muestran en ROJO en la consola del servidor
// y se guardan en logs/errores.log para revisarlos después.
const fs = require('fs');
const path = require('path');
const { traducirError } = require('./mensajesError');

const ROJO = '\x1b[31m';
const AMARILLO = '\x1b[33m';
const NEGRITA = '\x1b[1m';
const RESET = '\x1b[0m';

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'errores.log');

function fecha() {
    return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false });
}

function guardarEnArchivo(linea) {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, `${linea}\n`);
    } catch {
        // Si no se puede escribir el archivo (p. ej. en el hosting), basta con la consola.
    }
}

function logError(titulo, detalle) {
    const texto = detalle instanceof Error ? (detalle.stack || detalle.message) : (detalle || '');
    const linea = `[${fecha()}] ERROR ${titulo}${texto ? ` — ${texto}` : ''}`;
    console.error(`${ROJO}${NEGRITA}✖ ${linea}${RESET}`);
    guardarEnArchivo(linea);
}

function logAviso(titulo, detalle) {
    const linea = `[${fecha()}] AVISO ${titulo}${detalle ? ` — ${detalle}` : ''}`;
    console.warn(`${AMARILLO}⚠ ${linea}${RESET}`);
    guardarEnArchivo(linea);
}

// Middleware: registra toda petición que termine con error.
// 5xx (falla del servidor) en rojo, 4xx (dato inválido, sin permiso…) en amarillo.
function registrarErroresHttp(req, res, next) {
    const jsonOriginal = res.json.bind(res);
    res.json = (body) => {
        if (body && typeof body === 'object' && body.error && res.statusCode >= 400) {
            // La persona ve un mensaje sencillo; el texto técnico queda como "detalle" en el log
            const { error, detalle } = traducirError(res.statusCode, body.error, body.detalle);
            body = { ...body, error, detalle: detalle || undefined };
            res.locals.mensajeError = error;
            res.locals.detalleError = detalle;
        }
        return jsonOriginal(body);
    };
    res.on('finish', () => {
        if (res.statusCode < 400) return;
        const titulo = `${req.method} ${req.originalUrl} → ${res.statusCode}`;
        const detalle = res.locals.detalleError ? ` | detalle: ${res.locals.detalleError}` : '';
        const mensaje = `${res.locals.mensajeError || ''}${detalle}`;
        if (res.statusCode >= 500) logError(titulo, mensaje);
        else logAviso(titulo, mensaje);
    });
    next();
}

// Último middleware: errores no controlados dentro de las rutas.
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
    logError(`${req.method} ${req.originalUrl} (no controlado)`, err);
    if (res.headersSent) return;
    res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor', detalle: err.detalle });
}

function registrarErroresProceso() {
    process.on('unhandledRejection', (razon) => logError('Promesa rechazada sin manejar', razon));
    process.on('uncaughtException', (err) => logError('Excepción no controlada', err));
}

module.exports = { logError, logAviso, registrarErroresHttp, manejadorErrores, registrarErroresProceso, LOG_FILE };
