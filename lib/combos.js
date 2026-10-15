const { CUENTA_PUBLIC_SELECT } = require('./cuentaSelect');
const { decorarCuenta } = require('./cuentaEstado');

function idsUsuariosCombo(cuentas) {
    const porUsuario = new Map();
    const ids = new Set();

    for (const cuenta of cuentas) {
        const vistos = new Set();
        for (const puesto of cuenta.usuario_cuenta || []) {
            if (!puesto.id_usuario || vistos.has(puesto.id_usuario)) continue;
            vistos.add(puesto.id_usuario);
            const lista = porUsuario.get(puesto.id_usuario) || [];
            lista.push(cuenta.id);
            porUsuario.set(puesto.id_usuario, lista);
            if (puesto.es_combo) ids.add(puesto.id_usuario);
        }
    }

    for (const [idUsuario, cuentasIds] of porUsuario) {
        if (new Set(cuentasIds).size > 1) ids.add(idUsuario);
    }

    return [...ids];
}

async function incluirCuentasCombo(supabase, cuentas) {
    const usuarios = idsUsuariosCombo(cuentas);
    if (usuarios.length === 0) return cuentas;

    const { data: puestos, error } = await supabase
        .from('usuario_cuenta')
        .select('id_cuenta, id_usuario')
        .in('id_usuario', usuarios);

    if (error) throw error;

    const existentes = new Set(cuentas.map((c) => c.id));
    const faltantes = [...new Set((puestos || []).map((p) => p.id_cuenta))]
        .filter((id) => id && !existentes.has(id));

    if (faltantes.length === 0) return cuentas;

    const { data: extra, error: extraError } = await supabase
        .from('cuenta')
        .select(CUENTA_PUBLIC_SELECT)
        .in('id', faltantes);

    if (extraError) throw extraError;

    return [...cuentas, ...(extra || []).map(decorarCuenta)];
}

module.exports = { incluirCuentasCombo };
