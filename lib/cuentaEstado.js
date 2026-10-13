const DEFAULT_MAX_PUESTOS = 5;

function esNetflix(nombre) {
    return String(nombre || '').toLowerCase().includes('netflix');
}

function maxPuestosDe(plataforma) {
    const n = Number(plataforma?.max_puestos);
    if (Number.isFinite(n) && n > 0) return n;
    if (esNetflix(plataforma?.nombre_plat)) return 5;
    return DEFAULT_MAX_PUESTOS;
}

function estadoPorOcupacion(ocupados, max) {
    return ocupados >= max ? 'llena' : 'disponible';
}

async function plataformaDeCuenta(supabase, idCuenta) {
    const conMax = await supabase
        .from('cuenta')
        .select('id, id_plataforma, plataforma ( nombre_plat, max_puestos )')
        .eq('id', idCuenta)
        .single();

    if (!conMax.error) return conMax.data;

    const sinMax = await supabase
        .from('cuenta')
        .select('id, id_plataforma, plataforma ( nombre_plat )')
        .eq('id', idCuenta)
        .single();

    if (sinMax.error) throw sinMax.error;
    return sinMax.data;
}

async function maxPuestosCuenta(supabase, idCuenta) {
    const cuenta = await plataformaDeCuenta(supabase, idCuenta);
    return { cuenta, max: maxPuestosDe(cuenta?.plataforma) };
}

async function contarPuestos(supabase, idCuenta) {
    const { data, error } = await supabase
        .from('usuario_cuenta')
        .select('id')
        .eq('id_cuenta', idCuenta);

    if (error) throw error;
    return (data || []).length;
}

async function escribirEstado(supabase, idCuenta, estado) {
    const { error } = await supabase
        .from('cuenta')
        .update({ estado })
        .eq('id', idCuenta);

    if (!error) return estado;

    if (estado === 'llena') {
        const fallback = await supabase
            .from('cuenta')
            .update({ estado: 'vendida' })
            .eq('id', idCuenta);
        if (fallback.error) throw fallback.error;
        return 'vendida';
    }

    throw error;
}

async function actualizarEstadoCuenta(supabase, idCuenta) {
    const { max } = await maxPuestosCuenta(supabase, idCuenta);
    const ocupados = await contarPuestos(supabase, idCuenta);
    const estado = estadoPorOcupacion(ocupados, max);
    await escribirEstado(supabase, idCuenta, estado);
    return { ocupados, max, estado };
}

async function asegurarCupo(supabase, idCuenta, extras = 1) {
    const { max } = await maxPuestosCuenta(supabase, idCuenta);
    const ocupados = await contarPuestos(supabase, idCuenta);
    if (ocupados + extras > max) {
        const err = new Error(`La cuenta está llena (${ocupados}/${max} puestos).`);
        err.status = 400;
        throw err;
    }
    return { ocupados, max };
}

async function maxPuestosPlataforma(supabase, idPlataforma) {
    if (!idPlataforma) return DEFAULT_MAX_PUESTOS;

    const conMax = await supabase
        .from('plataforma')
        .select('nombre_plat, max_puestos')
        .eq('id', idPlataforma)
        .single();

    if (!conMax.error) return maxPuestosDe(conMax.data);

    const sinMax = await supabase
        .from('plataforma')
        .select('nombre_plat')
        .eq('id', idPlataforma)
        .single();

    if (sinMax.error) return DEFAULT_MAX_PUESTOS;
    return maxPuestosDe(sinMax.data);
}

function decorarCuenta(cuenta) {
    if (!cuenta) return cuenta;
    const max = maxPuestosDe(cuenta.plataforma);
    const ocupados = (cuenta.usuario_cuenta || cuenta.usuarios_cuenta || []).length;
    return {
        ...cuenta,
        max_puestos: max,
        ocupados,
        estado: estadoPorOcupacion(ocupados, max),
    };
}

module.exports = {
    DEFAULT_MAX_PUESTOS,
    maxPuestosDe,
    estadoPorOcupacion,
    actualizarEstadoCuenta,
    asegurarCupo,
    maxPuestosPlataforma,
    decorarCuenta,
};
