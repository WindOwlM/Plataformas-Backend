// Convierte errores técnicos (base de datos, Google, Microsoft, red…) en mensajes
// sencillos para quien usa la app. El texto técnico original se conserva como
// "detalle" para el registro de errores.

const TRADUCCIONES = [
    [/duplicate key|unique constraint|\b23505\b/i, 'Ya existe un registro con esos mismos datos.'],
    [/foreign key|\b23503\b/i, 'No se puede completar porque hay otros datos que dependen de este (por ejemplo, clientes o cuentas asignadas).'],
    [/not-null|null value in column|\b23502\b/i, 'Falta llenar un dato obligatorio.'],
    [/check constraint|\b23514\b/i, 'Uno de los datos no tiene un valor permitido.'],
    [/invalid input syntax|\b22P02\b|\b22007\b|\b22008\b/i, 'Uno de los datos no tiene el formato correcto. Revisa lo que escribiste e inténtalo de nuevo.'],
    [/PGRST116|multiple \(or no\) rows|contains 0 rows/i, 'No se encontró el registro. Puede que ya se haya borrado; recarga la página.'],
    [/relation .* does not exist|column .* does not exist|\b42P01\b|\b42703\b|schema cache/i, 'Falta una actualización en la base de datos. Avísale a quien administra el sistema.'],
    [/permission denied|row-level security|\b42501\b/i, 'No hay permiso para hacer esta acción en la base de datos. Avísale a quien administra el sistema.'],
    [/jwt|token is expired|invalid token|token inválido/i, 'Tu sesión venció. Vuelve a iniciar sesión.'],
    [/AADSTS|invalid_client|invalid_grant|unauthorized_client/i, 'No se pudo acceder a este correo. Vuelve a conectarlo desde el botón Correos.'],
    [/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|socket hang up|network/i, 'No se pudo conectar con la base de datos o con el servicio externo. Revisa el internet e inténtalo de nuevo.'],
];

// Palabras que delatan un mensaje técnico (en inglés o con nombres internos)
const PARECE_TECNICO = /\b(the|is|not|of|for|failed|invalid|cannot|could not|column|relation|syntax|undefined|null|violates|unexpected|denied|error|exception|stack|TypeError|ReferenceError|PGRST\w*|HTTP \d{3})\b|\.env\b|https?:\/\//i;

const GENERICO_5XX = 'Algo falló en el servidor. Inténtalo de nuevo; si sigue pasando, revisa el registro de errores.';
const GENERICO_4XX = 'No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.';

function traducirError(status, mensaje, detalle) {
    const texto = String(mensaje || '').trim();
    const extra = detalle ? String(detalle) : '';

    for (const [patron, amigable] of TRADUCCIONES) {
        if (patron.test(texto)) {
            return { error: amigable, detalle: [texto, extra].filter(Boolean).join(' | ') };
        }
    }
    if (!texto) {
        return { error: status >= 500 ? GENERICO_5XX : GENERICO_4XX, detalle: extra };
    }
    if (PARECE_TECNICO.test(texto)) {
        return { error: status >= 500 ? GENERICO_5XX : GENERICO_4XX, detalle: [texto, extra].filter(Boolean).join(' | ') };
    }
    // Ya es un mensaje en español escrito para la persona: se deja igual
    return { error: texto, detalle: extra };
}

module.exports = { traducirError };
