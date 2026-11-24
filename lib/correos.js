// Lectura de correos de Gmail / Outlook (misma lógica que multicuentas, pero en el backend).
const crypto = require('crypto');

const PROVIDERS = {
    google: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
        clientId: () => process.env.GOOGLE_CLIENT_ID,
        clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
        extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    },
    microsoft: {
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        scope: 'openid email profile offline_access Mail.Read',
        clientId: () => process.env.MICROSOFT_CLIENT_ID,
        clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET,
        extraAuthParams: { prompt: 'select_account' },
    },
};

// mensaje: lo que ve la persona. detalle: lo técnico, solo para el registro de errores
function errorHttp(status, mensaje, detalle) {
    const err = new Error(mensaje);
    err.status = status;
    if (detalle) err.detalle = detalle;
    return err;
}

const NOMBRE = { google: 'Gmail', microsoft: 'Outlook' };

function normalizarCorreo(correo) {
    return String(correo || '').trim().toLowerCase();
}

// Adivina el proveedor por el dominio del correo
function proveedorSugerido(correo) {
    const dominio = normalizarCorreo(correo).split('@')[1] || '';
    if (/^(gmail|googlemail)\.com$/.test(dominio)) return 'google';
    if (/^(hotmail|outlook|live|msn)\.[a-z.]+$/.test(dominio)) return 'microsoft';
    return null;
}

function getProvider(provider) {
    const conf = PROVIDERS[provider];
    if (!conf) throw errorHttp(400, 'Elige si el correo es de Gmail o de Outlook.', `provider recibido: ${provider}`);
    if (!conf.clientId() || !conf.clientSecret()) {
        throw errorHttp(500,
            `La conexión con ${NOMBRE[provider]} no está configurada en el servidor. Avísale a quien administra el sistema.`,
            `Faltan ${provider === 'google' ? 'GOOGLE' : 'MICROSOFT'}_CLIENT_ID / _CLIENT_SECRET en el .env`);
    }
    return conf;
}

function redirectUri(provider) {
    const base = String(process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/api/correos/callback/${provider}`;
}

// --- "state" firmado: viaja a Google/Microsoft y vuelve, así sabemos que lo pedimos nosotros ---
function secretoState() {
    return process.env.CORREOS_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'plataformas';
}

function firmarState(datos) {
    const payload = Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + 15 * 60 * 1000 })).toString('base64url');
    const firma = crypto.createHmac('sha256', secretoState()).update(payload).digest('base64url');
    return `${payload}.${firma}`;
}

function leerState(state) {
    const [payload, firma] = String(state || '').split('.');
    const invalido = 'El enlace para conectar el correo no es válido. Vuelve a intentarlo desde la app.';
    if (!payload || !firma) throw errorHttp(400, invalido, 'state sin firma');
    const esperada = crypto.createHmac('sha256', secretoState()).update(payload).digest('base64url');
    const a = Buffer.from(firma);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw errorHttp(400, invalido, 'firma del state no coincide');
    const datos = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!datos.exp || datos.exp < Date.now()) throw errorHttp(400, 'Tardaste mucho en dar el permiso y el enlace venció. Vuelve a intentarlo.', 'state vencido');
    return datos;
}

function urlAutorizacion(provider, state, correoSugerido) {
    const conf = getProvider(provider);
    const params = new URLSearchParams({
        client_id: conf.clientId(),
        redirect_uri: redirectUri(provider),
        response_type: 'code',
        scope: conf.scope,
        state,
        ...conf.extraAuthParams,
    });
    if (correoSugerido) params.set('login_hint', correoSugerido);
    return `${conf.authUrl}?${params.toString()}`;
}

async function pedirTokens(provider, campos) {
    const conf = getProvider(provider);
    const body = new URLSearchParams({
        client_id: conf.clientId(),
        client_secret: conf.clientSecret(),
        ...campos,
    });
    if (provider === 'microsoft') body.set('scope', conf.scope);
    const res = await fetch(conf.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        const detalle = `${provider} token ${res.status}: ${data.error || ''} ${data.error_description || ''}`.trim();
        const reconectar = ['invalid_grant', 'interaction_required', 'consent_required'].includes(data.error);
        const mensaje = data.error === 'invalid_client'
            ? `La clave de ${NOMBRE[provider]} guardada en el servidor no es válida. Avísale a quien administra el sistema.`
            : reconectar
                ? `${NOMBRE[provider]} quitó el permiso de este correo. Vuelve a conectarlo.`
                : `No se pudo obtener el permiso de ${NOMBRE[provider]}. Inténtalo de nuevo.`;
        const err = errorHttp(data.error === 'invalid_client' ? 500 : 401, mensaje, detalle);
        err.reconectar = reconectar;
        throw err;
    }
    return data;
}

function intercambiarCodigo(provider, code) {
    return pedirTokens(provider, {
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(provider),
    });
}

function renovarToken(provider, refreshToken) {
    return pedirTokens(provider, { refresh_token: refreshToken, grant_type: 'refresh_token' });
}

function correoDeIdToken(idToken) {
    try {
        const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString());
        return normalizarCorreo(payload.email || payload.preferred_username || payload.upn);
    } catch {
        return '';
    }
}

function venceEn(expiresIn) {
    return new Date(Date.now() + (Number(expiresIn) || 3600) * 1000).toISOString();
}

// --- Gmail ---
function decodeBase64Url(str) {
    try {
        return Buffer.from(String(str), 'base64url').toString('utf8');
    } catch {
        return '';
    }
}

function getGmailBody(payload) {
    if (!payload) return '';
    if (payload.body?.data) return decodeBase64Url(payload.body.data);
    if (payload.parts) {
        let textBody = '';
        for (const part of payload.parts) {
            if (part.mimeType === 'text/html' && part.body?.data) return decodeBase64Url(part.body.data);
            if (part.mimeType === 'text/plain' && part.body?.data && !textBody) textBody = decodeBase64Url(part.body.data);
            if (part.parts) {
                const nested = getGmailBody(part);
                if (nested) {
                    if (part.mimeType?.includes('html')) return nested;
                    if (!textBody) textBody = nested;
                }
            }
        }
        return textBody;
    }
    return '';
}

async function fetchGmail(accessToken, query, maxResults) {
    let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    const auth = { headers: { Authorization: `Bearer ${accessToken}` } };

    const listRes = await fetch(url, auth);
    if (!listRes.ok) {
        const text = await listRes.text();
        throw errorHttp(listRes.status === 401 ? 401 : 502,
            'Gmail no respondió bien. Inténtalo de nuevo en un momento.',
            `Gmail ${listRes.status}: ${text.slice(0, 300)}`);
    }
    const listData = await listRes.json();
    const mensajes = (listData.messages || []).slice(0, maxResults);

    const detalles = await Promise.all(mensajes.map(async (msg) => {
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, auth);
        if (!r.ok) return null;
        const detail = await r.json();
        const headers = detail.payload?.headers || [];
        const h = (name) => headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value || '';
        return {
            id: msg.id,
            subject: h('Subject') || '(Sin asunto)',
            from: h('From'),
            to: h('To'),
            date: h('Date') ? new Date(h('Date')).toISOString() : null,
            body: getGmailBody(detail.payload),
        };
    }));
    return detalles.filter(Boolean);
}

// --- Outlook ---
async function fetchOutlook(accessToken, query, maxResults) {
    const params = new URLSearchParams({
        $top: String(maxResults),
        $select: 'from,toRecipients,subject,body,receivedDateTime,id',
    });
    if (query) params.set('$search', `"${query.replace(/"/g, '')}"`);
    else params.set('$orderby', 'receivedDateTime desc');

    const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const text = await res.text();
        throw errorHttp(res.status === 401 ? 401 : 502,
            'Outlook no respondió bien. Inténtalo de nuevo en un momento.',
            `Outlook ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    return (data.value || []).map((msg) => ({
        id: msg.id,
        subject: msg.subject || '(Sin asunto)',
        from: msg.from?.emailAddress?.name
            ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
            : msg.from?.emailAddress?.address || '',
        to: (msg.toRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean).join(', '),
        date: msg.receivedDateTime || null,
        body: msg.body?.content || '',
    }));
}

function traerCorreos(provider, accessToken, query, maxResults) {
    return provider === 'google'
        ? fetchGmail(accessToken, query, maxResults)
        : fetchOutlook(accessToken, query, maxResults);
}

module.exports = {
    PROVIDERS,
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
};
