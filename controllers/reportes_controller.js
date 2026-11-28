const supabase = require('../config/supabase');
const { todayKey } = require('../lib/vencimientos');
const { tablaNoExiste } = require('../lib/pagos');

// Reporte de solo lectura: cuánto debería entrar y salir según los datos actuales.
// No hay historial de pagos todavía, así que todo es una estimación.

function dateKey(value) {
    const s = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function numero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

// Saldo a favor total de los clientes (lo que les debes en servicio)
function saldosAFavor(filas) {
    const porCliente = new Map();
    for (const f of filas || []) {
        porCliente.set(f.id_usuario, (porCliente.get(f.id_usuario) || 0) + numero(f.monto));
    }
    const positivos = [...porCliente.values()].filter((v) => v > 0);
    return { saldo_favor: positivos.reduce((s, v) => s + v, 0), clientes_saldo: positivos.length };
}

async function resumenPagos(mes) {
    const [y, m] = mes.split('-').map(Number);
    const hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const [mesRes, pendRes, saldoRes] = await Promise.all([
        supabase.from('pago').select('tipo, monto, medio, estado')
            .eq('estado', 'pagado').gte('fecha_pagado', `${mes}-01`).lt('fecha_pagado', hasta),
        supabase.from('pago').select('tipo, monto').eq('estado', 'pendiente'),
        supabase.from('pago').select('id_usuario, monto').eq('tipo', 'saldo'),
    ]);
    for (const r of [mesRes, pendRes, saldoRes]) {
        if (r.error) {
            if (tablaNoExiste(r.error)) return null;
            throw r.error;
        }
    }
    const total = (filas, tipo) => filas.filter((f) => f.tipo === tipo).reduce((s, f) => s + numero(f.monto), 0);
    const contar = (filas, tipo) => filas.filter((f) => f.tipo === tipo).length;
    const porMedio = {};
    for (const f of mesRes.data) {
        if (f.tipo !== 'cobro') continue;
        const medio = f.medio || 'Sin especificar';
        porMedio[medio] = (porMedio[medio] || 0) + numero(f.monto);
    }
    const cobrado = total(mesRes.data, 'cobro');
    const pagado = total(mesRes.data, 'gasto');
    return {
        cobrado,
        cobros: contar(mesRes.data, 'cobro'),
        pagado,
        gastos: contar(mesRes.data, 'gasto'),
        ganancia: cobrado - pagado,
        por_medio: Object.entries(porMedio)
            .map(([medio, valor]) => ({ medio, valor }))
            .sort((a, b) => b.valor - a.valor),
        fiado: total(pendRes.data, 'cobro'),
        fiados: contar(pendRes.data, 'cobro'),
        deuda_proveedores: total(pendRes.data, 'gasto'),
        deudas: contar(pendRes.data, 'gasto'),
        ...saldosAFavor(saldoRes.data),
    };
}

const reportesController = {};

reportesController.resumen = async (req, res) => {
    try {
        const hoy = todayKey();
        const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : hoy.slice(0, 7);

        const [puestosRes, pendientesRes, cuentasRes, plataformasRes, proveedoresRes] = await Promise.all([
            supabase
                .from('usuario_cuenta')
                .select('id, id_usuario, id_cuenta, valor_venta, estado, vencimiento_usuario, usuario(nombre)'),
            supabase
                .from('usuario_por_ubicar')
                .select('id, id_usuario, id_plataforma, valor_venta, vencimiento_usuario, usuario(nombre)'),
            supabase
                .from('cuenta')
                .select('id, id_plataforma, id_proveedor, correo, precio_costo, estado, fecha_vencimiento'),
            supabase.from('plataforma').select('id, nombre_plat'),
            supabase.from('proveedor').select('id, nombre_prov'),
        ]);
        for (const r of [puestosRes, pendientesRes, cuentasRes, plataformasRes, proveedoresRes]) {
            if (r.error) throw r.error;
        }

        const nombrePlat = new Map((plataformasRes.data || []).map((p) => [p.id, p.nombre_plat]));
        const nombreProv = new Map((proveedoresRes.data || []).map((p) => [
            p.id,
            p.nombre_prov || 'Sin proveedor',
        ]));
        const cuentas = (cuentasRes.data || []).filter((c) => c.estado !== 'inhabilitada');
        const cuentaPorId = new Map((cuentasRes.data || []).map((c) => [c.id, c]));

        // Cada perfil vendido (activo o por ubicar) como una fila de cobro
        const cobros = [];
        for (const p of puestosRes.data || []) {
            if (p.estado === 'cortado') continue;
            const cuenta = cuentaPorId.get(p.id_cuenta);
            if (cuenta?.estado === 'inhabilitada') continue;
            cobros.push({
                id: p.id,
                id_usuario: p.id_usuario,
                cliente: p.usuario?.nombre || 'Cliente sin nombre',
                plataforma: nombrePlat.get(cuenta?.id_plataforma) || 'Sin plataforma',
                correo: cuenta?.correo || '',
                valor: numero(p.valor_venta),
                fecha: dateKey(p.vencimiento_usuario),
                por_ubicar: false,
            });
        }
        for (const p of pendientesRes.data || []) {
            cobros.push({
                id: p.id,
                id_usuario: p.id_usuario,
                cliente: p.usuario?.nombre || 'Cliente sin nombre',
                plataforma: nombrePlat.get(p.id_plataforma) || 'Sin plataforma',
                correo: 'Por ubicar',
                valor: numero(p.valor_venta),
                fecha: dateKey(p.vencimiento_usuario),
                por_ubicar: true,
            });
        }

        // Al día = vence hoy o después (o sin fecha). Vencido = fecha pasada y sin renovar.
        const alDia = cobros.filter((c) => !c.fecha || c.fecha >= hoy);
        const vencidos = cobros.filter((c) => c.fecha && c.fecha < hoy);

        const suma = (filas, campo = 'valor') => filas.reduce((s, f) => s + numero(f[campo]), 0);
        const ventaMensual = suma(alDia);
        const costoMensual = cuentas.reduce((s, c) => s + numero(c.precio_costo), 0);

        // Por plataforma
        const porPlat = new Map();
        const fila = (nombre) => {
            if (!porPlat.has(nombre)) porPlat.set(nombre, { plataforma: nombre, perfiles: 0, cuentas: 0, venta: 0, costo: 0 });
            return porPlat.get(nombre);
        };
        for (const c of alDia) {
            const f = fila(c.plataforma);
            f.perfiles += 1;
            f.venta += c.valor;
        }
        for (const c of cuentas) {
            const f = fila(nombrePlat.get(c.id_plataforma) || 'Sin plataforma');
            f.cuentas += 1;
            f.costo += numero(c.precio_costo);
        }
        const plataformas = [...porPlat.values()]
            .map((f) => ({ ...f, ganancia: f.venta - f.costo }))
            .sort((a, b) => b.venta - a.venta);

        // Mes elegido: lo que vence día a día (clientes que pagan / cuentas que pagas)
        const dias = new Map();
        const dia = (fecha) => {
            if (!dias.has(fecha)) dias.set(fecha, { fecha, clientes: new Set(), cobro: 0, cuentas: 0, pago: 0 });
            return dias.get(fecha);
        };
        const cobrosMes = cobros.filter((c) => c.fecha && c.fecha.startsWith(mes));
        for (const c of cobrosMes) {
            const d = dia(c.fecha);
            d.clientes.add(c.id_usuario);
            d.cobro += c.valor;
        }
        const cuentasMes = cuentas.filter((c) => dateKey(c.fecha_vencimiento)?.startsWith(mes));
        for (const c of cuentasMes) {
            const d = dia(dateKey(c.fecha_vencimiento));
            d.cuentas += 1;
            d.pago += numero(c.precio_costo);
        }
        const porDia = [...dias.values()]
            .map((d) => ({ fecha: d.fecha, clientes: d.clientes.size, cobro: d.cobro, cuentas: d.cuentas, pago: d.pago }))
            .sort((a, b) => a.fecha.localeCompare(b.fecha));

        const cobrosMesPendientes = cobrosMes.filter((c) => c.fecha < hoy);
        const cobrosMesPorVenir = cobrosMes.filter((c) => c.fecha >= hoy);

        // Vencidos sin renovar, agrupados por cliente
        const vencidosPorCliente = new Map();
        for (const c of vencidos) {
            if (!vencidosPorCliente.has(c.id_usuario)) {
                vencidosPorCliente.set(c.id_usuario, { cliente: c.cliente, plataformas: [], valor: 0, fecha: c.fecha });
            }
            const v = vencidosPorCliente.get(c.id_usuario);
            v.plataformas.push(c.plataforma);
            v.valor += c.valor;
            if (c.fecha < v.fecha) v.fecha = c.fecha;
        }

        // Lo que realmente se registró con "Renovar" (tabla pago)
        const real = await resumenPagos(mes);

        res.status(200).json({
            hoy,
            mes,
            real,
            general: {
                clientes: new Set(alDia.map((c) => c.id_usuario)).size,
                perfiles: alDia.length,
                cuentas: cuentas.length,
                venta_mensual: ventaMensual,
                costo_mensual: costoMensual,
                ganancia_mensual: ventaMensual - costoMensual,
            },
            vencidos: {
                clientes: vencidosPorCliente.size,
                valor: suma(vencidos),
                lista: [...vencidosPorCliente.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
            },
            mes_detalle: {
                clientes: new Set(cobrosMes.map((c) => c.id_usuario)).size,
                cobro: suma(cobrosMes),
                cobro_por_venir: suma(cobrosMesPorVenir),
                cobro_pendiente: suma(cobrosMesPendientes),
                cuentas: cuentasMes.length,
                pago: cuentasMes.reduce((s, c) => s + numero(c.precio_costo), 0),
                por_dia: porDia,
            },
            plataformas,
            incompletos: {
                // Clientes cuyo total es $0. En un combo es normal que el precio
                // esté solo en una de sus plataformas, por eso se mira el total.
                clientes_sin_precio: (() => {
                    const porCliente = new Map();
                    for (const c of alDia) {
                        if (!porCliente.has(c.id_usuario)) porCliente.set(c.id_usuario, { cliente: c.cliente, plataformas: [], valor: 0 });
                        const v = porCliente.get(c.id_usuario);
                        v.plataformas.push(c.plataforma);
                        v.valor += c.valor;
                    }
                    return [...porCliente.values()]
                        .filter((v) => !v.valor)
                        .map(({ cliente, plataformas: plats }) => ({ cliente, plataformas: plats }));
                })(),
                cuentas_sin_costo: cuentas
                    .filter((c) => !numero(c.precio_costo))
                    .map((c) => ({
                        correo: c.correo,
                        plataforma: nombrePlat.get(c.id_plataforma) || 'Sin plataforma',
                        proveedor: nombreProv.get(c.id_proveedor) || '',
                    })),
            },
        });
    } catch (error) {
        console.error('Error generando el reporte:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = reportesController;
