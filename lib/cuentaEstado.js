const { classifyVencimiento } = require('./vencimientos');

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

function esCuentaInhabilitada(estado) {
    const e = String(estado || '').toLowerCase();
    return e === 'inhabilitada' || e === 'inactiva' || e === 'suspendida';
}

function esPuestoActivo(puesto) {
    const estado = String(puesto?.estado || 'activa').toLowerCase();
    return estado !== 'cortado';
}

function esPuestoQueOcupa(puesto) {
    if (!esPuestoActivo(puesto)) return false;
    const bucket = classifyVencimiento(puesto?.vencimiento_usuario);
    if (bucket === 'vencida' || bucket === 'hoy') return false;
    return true;
}

async function plataformaDeCuenta(supabase, idCuenta) {
    const { data, error } = await supabase
        .from('cuenta')
        .select('id, id_plataforma, plataforma ( nombre_plat, max_puestos )')
        .eq('id', idCuenta)
        .single();

    if (error) throw error;
    return data;
}

async function maxPuestosCuenta(supabase, idCuenta) {
    const cuenta = await plataformaDeCuenta(supabase, idCuenta);
    return { cuenta, max: maxPuestosDe(cuenta?.plataforma) };
}

async function contarPuestos(supabase, idCuenta) {
    const { data, error } = await supabase
        .from('usuario_cuenta')
        .select('id, estado, vencimiento_usuario')
        .eq('id_cuenta', idCuenta);

    if (error) throw error;
    return (data || []).filter(esPuestoQueOcupa).length;
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

async function actualizarEstadoCuenta(supabase, idCuenta, opciones = {}) {
    const { data: actual } = await supabase
        .from('cuenta')
        .select('estado')
        .eq('id', idCuenta)
        .single();

    const { max } = await maxPuestosCuenta(supabase, idCuenta);
    const ocupados = await contarPuestos(supabase, idCuenta);

    if (!opciones.forzar && esCuentaInhabilitada(actual?.estado)) {
        return { ocupados, max, estado: 'inhabilitada' };
    }

    const estado = estadoPorOcupacion(ocupados, max);
    await escribirEstado(supabase, idCuenta, estado);
    return { ocupados, max, estado };
}

async function setCuentaInhabilitada(supabase, idCuenta, inhabilitada) {
    if (inhabilitada) {
        await escribirEstado(supabase, idCuenta, 'inhabilitada');
        const { max } = await maxPuestosCuenta(supabase, idCuenta);
        const ocupados = await contarPuestos(supabase, idCuenta);
        return { ocupados, max, estado: 'inhabilitada' };
    }
    return actualizarEstadoCuenta(supabase, idCuenta, { forzar: true });
}

async function asegurarCupo(supabase, idCuenta, extras = 1) {
    const { data: actual } = await supabase
        .from('cuenta')
        .select('estado')
        .eq('id', idCuenta)
        .single();
    if (esCuentaInhabilitada(actual?.estado)) {
        const err = new Error('Esta cuenta está inhabilitada.');
        err.status = 400;
        throw err;
    }
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

    const { data, error } = await supabase
        .from('plataforma')
        .select('nombre_plat, max_puestos')
        .eq('id', idPlataforma)
        .single();

    if (error) return DEFAULT_MAX_PUESTOS;
    return maxPuestosDe(data);
}

// Recalcula el estado de las cuentas tocadas y, si alguna quedó con más clientes
// que puestos, devuelve un aviso (no bloquea: suele ser alguien que faltaba cortar).
async function avisoSobrecupo(supabase, idsCuentas) {
    const pasadas = [];
    for (const idCuenta of new Set([...idsCuentas].filter(Boolean))) {
        const { ocupados, max } = await actualizarEstadoCuenta(supabase, idCuenta);
        if (ocupados > max) pasadas.push({ idCuenta, ocupados, max });
    }
    if (pasadas.length === 0) return null;

    const { data } = await supabase
        .from('cuenta')
        .select('id, correo, plataforma ( nombre_plat )')
        .in('id', pasadas.map((p) => p.idCuenta));
    const porId = new Map((data || []).map((c) => [c.id, c]));
    const lista = pasadas.map((p) => {
        const c = porId.get(p.idCuenta);
        const nombre = [c?.plataforma?.nombre_plat, c?.correo].filter(Boolean).join(' ') || 'una cuenta';
        return `${nombre} (${p.ocupados}/${p.max})`;
    }).join(', ');
    return `Quedó guardado, pero ojo: ${lista} tiene más clientes que puestos. `
        + 'Hay algo pendiente en esa cuenta: cortar o eliminar a algún cliente.';
}

function decorarCuenta(cuenta) {
    if (!cuenta) return cuenta;
    const max = maxPuestosDe(cuenta.plataforma);
    const puestos = cuenta.usuario_cuenta || cuenta.usuarios_cuenta || [];
    const ocupados = puestos.filter(esPuestoQueOcupa).length;
    return {
        ...cuenta,
        max_puestos: max,
        ocupados,
        estado: esCuentaInhabilitada(cuenta.estado)
            ? 'inhabilitada'
            : estadoPorOcupacion(ocupados, max),
    };
}

module.exports = {
    DEFAULT_MAX_PUESTOS,
    maxPuestosDe,
    esPuestoActivo,
    esPuestoQueOcupa,
    estadoPorOcupacion,
    esCuentaInhabilitada,
    actualizarEstadoCuenta,
    setCuentaInhabilitada,
    asegurarCupo,
    avisoSobrecupo,
    maxPuestosPlataforma,
    decorarCuenta,
};
