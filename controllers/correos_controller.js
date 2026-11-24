const supabase = require('../config/supabase');
const { origenPermitido } = require('../lib/origenes');
const {
    errorHttp,
    normalizarCorreo,
    proveedorSugerido,
    firmarState,
    leerState,
    urlAutorizacion,
    intercambiarCodigo,
    renovarToken,
    correoDeIdToken,
    venceEn,
    traerCorreos,
} = require('../lib/correos');

const correosController = {};
const TABLA = 'correo_vinculado';

function responderError(res, error, contexto) {
    console.error(`Error ${contexto}:`, error.message || error, error.detalle || '');
    res.status(error.status || 500).json({ error: error.message, detalle: error.detalle, reconectar: !!error.reconectar });
}

async function guardarTokens(fila, tokens) {
    const cambios = {
        access_token: tokens.access_token,
        expires_at: venceEn(tokens.expires_in),
        updated_at: new Date().toISOString(),
    };
    // Microsoft entrega un refresh nuevo en cada renovación; Google normalmente no
    if (tokens.refresh_token) cambios.refresh_token = tokens.refresh_token;
    const { error } = await supabase.from(TABLA).update(cambios).eq('id', fila.id);
    if (error) throw error;
    return { ...fila, ...cambios };
}

// Devuelve un access_token válido, renovándolo solo si ya venció (o está por vencer)
async function tokenVigente(fila, forzar = false) {
    const vence = fila.expires_at ? new Date(fila.expires_at).getTime() : 0;
    if (!forzar && fila.access_token && vence > Date.now() + 60 * 1000) return fila;
    if (!fila.refresh_token) {
        const err = errorHttp(401, 'Este correo perdió el permiso. Vuelve a conectarlo.');
        err.reconectar = true;
        throw err;
    }
    const tokens = await renovarToken(fila.provider, fila.refresh_token);
    return guardarTokens(fila, tokens);
}

correosController.listarVinculados = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from(TABLA)
            .select('correo, provider, updated_at');
        if (error) throw error;

        // Para mostrar en qué plataformas se usa cada correo
        const { data: cuentas } = await supabase.from('cuenta').select('correo, plataforma ( nombre_plat )');
        const porCorreo = new Map();
        for (const c of cuentas || []) {
            const k = normalizarCorreo(c.correo);
            const nombre = c.plataforma?.nombre_plat;
            if (!k || !nombre) continue;
            if (!porCorreo.has(k)) porCorreo.set(k, new Set());
            porCorreo.get(k).add(nombre);
        }
        res.status(200).json((data || []).map((v) => ({
            ...v,
            plataformas: [...(porCorreo.get(normalizarCorreo(v.correo)) || [])],
        })));
    } catch (error) {
        responderError(res, error, 'listando correos vinculados');
    }
};

correosController.conectar = async (req, res) => {
    try {
        const correo = normalizarCorreo(req.body?.correo);
        const provider = req.body?.provider || proveedorSugerido(correo);
        if (!provider) throw errorHttp(400, 'Elige si el correo es de Gmail o de Outlook.');

        const origen = req.headers.origin;
        if (!origen || !origenPermitido(origen)) throw errorHttp(400, 'Origen no permitido.');
        const ruta = String(req.body?.ruta || '/cuentas');
        const rutaSegura = ruta.startsWith('/') && !ruta.startsWith('//') ? ruta : '/cuentas';

        const state = firmarState({ p: provider, c: correo, o: origen, r: rutaSegura });
        res.status(200).json({ url: urlAutorizacion(provider, state, correo) });
    } catch (error) {
        responderError(res, error, 'iniciando conexión de correo');
    }
};

// Google / Microsoft redirigen aquí después de que das el permiso (navegación del navegador)
correosController.callback = async (req, res) => {
    let datos = null;
    const volver = (params) => {
        if (!datos?.o) return res.status(400).send('No se pudo conectar el correo. Cierra esta ventana e inténtalo de nuevo.');
        const url = new URL(datos.r || '/cuentas', datos.o);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        return res.redirect(url.toString());
    };
    try {
        datos = leerState(req.query.state);
        const provider = req.params.provider;
        const nombre = provider === 'google' ? 'Google' : 'Microsoft';
        if (provider !== datos.p) throw errorHttp(400, 'El enlace para conectar el correo no es válido. Vuelve a intentarlo desde la app.', 'provider no coincide con el state');
        if (req.query.error) {
            throw errorHttp(400, req.query.error === 'access_denied'
                ? 'Cancelaste el permiso, así que el correo no se conectó.'
                : `${nombre} no permitió conectar el correo. Inténtalo de nuevo.`,
            `${req.query.error}: ${req.query.error_description || ''}`);
        }
        if (!req.query.code) throw errorHttp(400, `${nombre} no devolvió el permiso. Inténtalo de nuevo.`, 'callback sin code');

        const tokens = await intercambiarCodigo(provider, String(req.query.code));
        const correo = correoDeIdToken(tokens.id_token) || datos.c;
        if (!correo) throw errorHttp(400, 'No se pudo saber qué correo conectaste. Inténtalo de nuevo.', 'id_token sin email');

        const fila = {
            correo,
            provider,
            access_token: tokens.access_token,
            expires_at: venceEn(tokens.expires_in),
            updated_at: new Date().toISOString(),
        };
        if (tokens.refresh_token) fila.refresh_token = tokens.refresh_token;

        const { error } = await supabase.from(TABLA).upsert(fila, { onConflict: 'correo' });
        if (error) throw error;

        const params = { correo_conectado: correo };
        if (datos.c && datos.c !== correo) params.correo_pedido = datos.c;
        return volver(params);
    } catch (error) {
        // La persona solo ve el mensaje sencillo; lo técnico va al log
        const { logError } = require('../lib/logger');
        logError(`Conectar correo (${req.params.provider})`, `${error.message}${error.detalle ? ` | detalle: ${error.detalle}` : ''}`);
        const { traducirError } = require('../lib/mensajesError');
        return volver({ correo_error: traducirError(error.status || 500, error.message).error });
    }
};

correosController.leer = async (req, res) => {
    try {
        const correo = normalizarCorreo(req.body?.correo);
        if (!correo) throw errorHttp(400, 'Falta el correo.');
        const query = String(req.body?.query || '').trim().slice(0, 200);
        const max = Math.min(Math.max(parseInt(req.body?.max, 10) || 5, 1), 20);

        const { data: filaDb, error } = await supabase
            .from(TABLA)
            .select('*')
            .eq('correo', correo)
            .maybeSingle();
        if (error) throw error;
        if (!filaDb) {
            const err = errorHttp(404, 'Este correo no está conectado todavía.');
            err.reconectar = true;
            throw err;
        }

        let fila = await tokenVigente(filaDb);
        let emails;
        try {
            emails = await traerCorreos(fila.provider, fila.access_token, query, max);
        } catch (err) {
            if (err.status !== 401) throw err;
            // El token fue rechazado antes de tiempo: renovamos una vez y reintentamos
            fila = await tokenVigente(fila, true);
            emails = await traerCorreos(fila.provider, fila.access_token, query, max);
        }
        res.status(200).json({ correo, provider: fila.provider, emails });
    } catch (error) {
        responderError(res, error, 'leyendo correos');
    }
};

correosController.desvincular = async (req, res) => {
    try {
        const correo = normalizarCorreo(req.params.correo);
        const { error } = await supabase.from(TABLA).delete().eq('correo', correo);
        if (error) throw error;
        res.status(200).json({ mensaje: 'Correo desconectado' });
    } catch (error) {
        responderError(res, error, 'desconectando correo');
    }
};

module.exports = correosController;
