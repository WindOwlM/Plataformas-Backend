const TIME_ZONE = 'America/Bogota';

function dateKey(value) {
    if (!value) return null;
    const s = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function todayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const get = (type) => parts.find((p) => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

function shiftKey(key, days) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function classifyVencimiento(fecha) {
    const key = dateKey(fecha);
    if (!key) return null;
    const today = todayKey();
    const tomorrow = shiftKey(today, 1);
    if (key === tomorrow) return 'manana';
    if (key === today) return 'hoy';
    if (key < today) return 'vencida';
    return null;
}

function ordenPlataforma(nombre) {
    const n = String(nombre || '').toLowerCase();
    return n.includes('netflix') ? `0-${n}` : `1-${n}`;
}

function plataformasUnicas(set) {
    return [...set].sort((a, b) => ordenPlataforma(a).localeCompare(ordenPlataforma(b), 'es'));
}

function buildVencimientoItems(cuentas = []) {
    const porUsuario = new Map();
    const itemsCuenta = [];

    for (const cuenta of cuentas) {
        const puestos = cuenta.usuario_cuenta || [];
        const plataforma = cuenta.plataforma?.nombre_plat || '—';
        const proveedor = cuenta.proveedor?.nombre_prov || '—';

        for (const puesto of puestos) {
            if (!puesto.id_usuario) continue;
            let perfil = porUsuario.get(puesto.id_usuario);
            if (!perfil) {
                perfil = {
                    idUsuario: puesto.id_usuario,
                    nombre: puesto.usuario?.nombre || 'Cliente sin nombre',
                    telefono: puesto.usuario?.numero_telefono || '',
                    esCombo: false,
                    plataformas: new Set(),
                    cuentas: new Set(),
                    porBucket: { hoy: [], manana: [], vencida: [] },
                };
                porUsuario.set(puesto.id_usuario, perfil);
            }
            if (puesto.usuario?.nombre) perfil.nombre = puesto.usuario.nombre;
            if (puesto.usuario?.numero_telefono) perfil.telefono = puesto.usuario.numero_telefono;
            if (puesto.es_combo) perfil.esCombo = true;
            perfil.plataformas.add(plataforma);
            perfil.cuentas.add(cuenta.id);

            const bucket = classifyVencimiento(puesto.vencimiento_usuario);
            if (bucket) {
                perfil.porBucket[bucket].push({
                    id: puesto.id,
                    fecha: dateKey(puesto.vencimiento_usuario),
                    pin: puesto.pin || '',
                    correo: cuenta.correo,
                    plataforma,
                    proveedor,
                    valor: puesto.valor_venta,
                });
            }
        }

        const cuentaBucket = classifyVencimiento(cuenta.fecha_vencimiento);
        if (cuentaBucket) {
            itemsCuenta.push({
                id: `cuenta-${cuenta.id}`,
                tipo: 'cuenta',
                bucket: cuentaBucket,
                fecha: dateKey(cuenta.fecha_vencimiento),
                nombre: cuenta.correo,
                telefono: '',
                correo: cuenta.correo,
                plataforma,
                plataformas: [plataforma],
                proveedor,
                pin: '',
                valor: cuenta.precio_costo,
            });
        }
    }

    const items = [];

    for (const perfil of porUsuario.values()) {
        const plataformas = plataformasUnicas(perfil.plataformas);
        const esCombo = perfil.esCombo || plataformas.length > 1 || perfil.cuentas.size > 1;

        for (const bucket of ['hoy', 'manana', 'vencida']) {
            const vencen = perfil.porBucket[bucket];
            if (vencen.length === 0) continue;

            vencen.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

            if (esCombo) {
                items.push({
                    id: `combo-${perfil.idUsuario}-${bucket}`,
                    tipo: 'combo',
                    bucket,
                    fecha: vencen[0].fecha,
                    nombre: perfil.nombre,
                    telefono: perfil.telefono,
                    correo: '',
                    plataforma: plataformas.join(' · '),
                    plataformas,
                    proveedor: '',
                    pin: '',
                    valor: null,
                });
            } else {
                for (const fila of vencen) {
                    items.push({
                        id: `puesto-${fila.id || `${perfil.idUsuario}-${fila.correo}`}`,
                        tipo: 'usuario',
                        bucket,
                        fecha: fila.fecha,
                        nombre: perfil.nombre,
                        telefono: perfil.telefono,
                        correo: fila.correo,
                        plataforma: fila.plataforma,
                        plataformas: [fila.plataforma],
                        proveedor: fila.proveedor,
                        pin: fila.pin,
                        valor: fila.valor,
                    });
                }
            }
        }
    }

    items.push(...itemsCuenta);

    const tipoOrden = { combo: 0, usuario: 1, cuenta: 2 };
    const bucketOrden = { hoy: 0, manana: 1, vencida: 2 };
    items.sort((a, b) => {
        if (bucketOrden[a.bucket] !== bucketOrden[b.bucket]) {
            return bucketOrden[a.bucket] - bucketOrden[b.bucket];
        }
        if (tipoOrden[a.tipo] !== tipoOrden[b.tipo]) {
            return tipoOrden[a.tipo] - tipoOrden[b.tipo];
        }
        if (a.tipo === 'combo') {
            return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
        }
        const plat = ordenPlataforma(a.plataforma).localeCompare(ordenPlataforma(b.plataforma), 'es');
        if (plat) return plat;
        return (a.fecha || '').localeCompare(b.fecha || '');
    });

    const counts = { hoy: 0, manana: 0, vencida: 0 };
    for (const item of items) counts[item.bucket] += 1;

    return { items, counts };
}

module.exports = { buildVencimientoItems, classifyVencimiento };
