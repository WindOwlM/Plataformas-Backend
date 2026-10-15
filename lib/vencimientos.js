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

function buildVencimientoItems(cuentas = []) {
    const items = [];

    for (const cuenta of cuentas) {
        const puestos = cuenta.usuario_cuenta || [];
        const plataforma = cuenta.plataforma?.nombre_plat || '—';
        const proveedor = cuenta.proveedor?.nombre_prov || '—';

        for (const puesto of puestos) {
            const bucket = classifyVencimiento(puesto.vencimiento_usuario);
            if (!bucket) continue;
            items.push({
                id: `puesto-${puesto.id || `${cuenta.id}-${puesto.id_usuario}`}`,
                tipo: 'usuario',
                bucket,
                fecha: dateKey(puesto.vencimiento_usuario),
                nombre: puesto.usuario?.nombre || 'Cliente sin nombre',
                telefono: puesto.usuario?.numero_telefono || '',
                correo: cuenta.correo,
                plataforma,
                proveedor,
                pin: puesto.pin || '',
                valor: puesto.valor_venta,
            });
        }

        const cuentaBucket = classifyVencimiento(cuenta.fecha_vencimiento);
        if (cuentaBucket) {
            items.push({
                id: `cuenta-${cuenta.id}`,
                tipo: 'cuenta',
                bucket: cuentaBucket,
                fecha: dateKey(cuenta.fecha_vencimiento),
                nombre: cuenta.correo,
                telefono: '',
                correo: cuenta.correo,
                plataforma,
                proveedor,
                pin: '',
                valor: cuenta.precio_costo,
            });
        }
    }

    const order = { hoy: 0, manana: 1, vencida: 2 };
    items.sort((a, b) => {
        if (order[a.bucket] !== order[b.bucket]) return order[a.bucket] - order[b.bucket];
        return (a.fecha || '').localeCompare(b.fecha || '');
    });

    const counts = {
        hoy: 0,
        manana: 0,
        vencida: 0,
    };
    for (const item of items) counts[item.bucket] += 1;

    return { items, counts };
}

module.exports = { buildVencimientoItems, classifyVencimiento };
