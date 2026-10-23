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

function itemsPorUbicar(pendientes = []) {
    const items = [];
    for (const row of pendientes) {
        const bucket = classifyVencimiento(row.vencimiento_usuario);
        if (!bucket) continue;
        const plataforma = row.plataforma?.nombre_plat || '—';
        const correo = row.cuenta?.correo || row.cuenta_anterior?.correo || '';
        items.push({
            id: `por-ubicar-${row.id}`,
            tipo: 'por_ubicar',
            bucket,
            fecha: dateKey(row.vencimiento_usuario),
            nombre: row.usuario?.nombre || 'Cliente sin nombre',
            telefono: row.usuario?.numero_telefono || '',
            correo,
            plataforma,
            plataformas: [plataforma],
            proveedor: '',
            pin: row.pin || '',
            valor: row.valor_venta ?? 0,
            id_usuario: row.id_usuario,
            id_plataforma: row.id_plataforma,
            id_cuenta: row.id_cuenta_anterior || null,
            id_por_ubicar: row.id,
            es_combo: !!row.es_combo,
        });
    }
    return items;
}

function buildVencimientoItems(cuentas = [], pendientes = []) {
    const porUsuario = new Map();
    const itemsCuenta = [];

    for (const cuenta of cuentas) {
        const puestos = cuenta.usuario_cuenta || [];
        const plataforma = cuenta.plataforma?.nombre_plat || '—';
        const proveedor = cuenta.proveedor?.nombre_prov || '—';

        for (const puesto of puestos) {
            if (!puesto.id_usuario) continue;
            if (String(puesto.estado || '').toLowerCase() === 'cortado') continue;
            let perfil = porUsuario.get(puesto.id_usuario);
            if (!perfil) {
                perfil = {
                    idUsuario: puesto.id_usuario,
                    nombre: puesto.usuario?.nombre || 'Cliente sin nombre',
                    telefono: puesto.usuario?.numero_telefono || '',
                    esCombo: false,
                    plataformas: new Set(),
                    cuentas: new Set(),
                    asignaciones: [],
                    porBucket: { hoy: [], manana: [], vencida: [] },
                };
                porUsuario.set(puesto.id_usuario, perfil);
            }
            if (puesto.usuario?.nombre) perfil.nombre = puesto.usuario.nombre;
            if (puesto.usuario?.numero_telefono) perfil.telefono = puesto.usuario.numero_telefono;
            if (puesto.es_combo) perfil.esCombo = true;
            perfil.plataformas.add(plataforma);
            perfil.cuentas.add(cuenta.id);
            perfil.asignaciones.push({
                id_puesto: puesto.id,
                id_cuenta: cuenta.id,
                id_plataforma: cuenta.id_plataforma,
                plataforma,
                correo: cuenta.correo,
                pin: puesto.pin || '',
                valor: puesto.valor_venta ?? 0,
                fecha: dateKey(puesto.vencimiento_usuario),
                notas: puesto.notas || '',
            });

            const bucket = classifyVencimiento(puesto.vencimiento_usuario);
            if (bucket) {
                perfil.porBucket[bucket].push({
                    id: puesto.id,
                    id_cuenta: cuenta.id,
                    id_plataforma: cuenta.id_plataforma,
                    fecha: dateKey(puesto.vencimiento_usuario),
                    pin: puesto.pin || '',
                    correo: cuenta.correo,
                    plataforma,
                    proveedor,
                    valor: puesto.valor_venta,
                    notas: puesto.notas || '',
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
                id_cuenta: cuenta.id,
                notas: cuenta.notas || '',
            });
        }
    }

    const items = [];

    for (const perfil of porUsuario.values()) {
        for (const bucket of ['hoy', 'manana', 'vencida']) {
            const vencen = perfil.porBucket[bucket];
            if (vencen.length === 0) continue;

            const porFecha = new Map();
            for (const fila of vencen) {
                const key = fila.fecha || '';
                if (!porFecha.has(key)) porFecha.set(key, []);
                porFecha.get(key).push(fila);
            }

            const fechas = [...porFecha.keys()].sort();
            for (const fecha of fechas) {
                const filas = porFecha.get(fecha);
                filas.sort((a, b) => ordenPlataforma(a.plataforma).localeCompare(ordenPlataforma(b.plataforma), 'es'));
                const plataformasFecha = plataformasUnicas(new Set(filas.map((fila) => fila.plataforma)));
                const esComboFecha = plataformasFecha.length > 1;

                if (esComboFecha) {
                    const asignaciones = filas.map((fila) => ({
                        id_puesto: fila.id,
                        id_cuenta: fila.id_cuenta,
                        id_plataforma: fila.id_plataforma,
                        plataforma: fila.plataforma,
                        correo: fila.correo,
                        pin: fila.pin || '',
                        valor: fila.valor ?? 0,
                        fecha: fila.fecha,
                        notas: fila.notas || '',
                    }));
                    items.push({
                        id: `combo-${perfil.idUsuario}-${fecha}`,
                        tipo: 'combo',
                        bucket,
                        fecha,
                        nombre: perfil.nombre,
                        telefono: perfil.telefono,
                        correo: '',
                        plataforma: plataformasFecha.join(' · '),
                        plataformas: plataformasFecha,
                        proveedor: '',
                        pin: '',
                        valor: null,
                        id_usuario: perfil.idUsuario,
                        asignaciones,
                        renovaciones: asignaciones,
                        notas: filas.map((fila) => fila.notas).filter(Boolean).join(' · '),
                    });
                } else {
                    for (const fila of filas) {
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
                            id_puesto: fila.id,
                            id_cuenta: fila.id_cuenta,
                            id_plataforma: fila.id_plataforma,
                            id_usuario: perfil.idUsuario,
                            asignaciones: perfil.asignaciones,
                            notas: fila.notas || '',
                        });
                    }
                }
            }
        }
    }

    items.push(...itemsCuenta);
    items.push(...itemsPorUbicar(pendientes));

    const tipoOrden = { combo: 0, usuario: 1, por_ubicar: 2, cuenta: 3 };
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
