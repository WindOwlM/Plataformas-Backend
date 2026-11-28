const supabase = require('../config/supabase');
const { todayKey } = require('../lib/vencimientos');
const { MEDIOS, tablaNoExiste, falteTipoSaldo } = require('../lib/pagos');

const SELECT = 'id, tipo, estado, monto, medio, fecha, fecha_pagado, id_usuario, proveedor, detalle, notas, created_at, usuario(nombre, numero_telefono)';

function rangoMes(mes) {
    const [y, m] = mes.split('-').map(Number);
    const fin = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    return { desde: `${mes}-01`, hasta: fin };
}

function plano(p) {
    return {
        ...p,
        monto: Number(p.monto) || 0,
        cliente: p.usuario?.nombre || null,
        telefono: p.usuario?.numero_telefono || null,
        usuario: undefined,
    };
}

function sinTabla(res) {
    return res.status(200).json({ tabla: false, movimientos: [], pendientes: [] });
}

const pagosController = {};

// Movimientos de un mes: lo que entró/salió ese mes y lo fiado en ese mes
pagosController.listarMes = async (req, res) => {
    try {
        const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : todayKey().slice(0, 7);
        const { desde, hasta } = rangoMes(mes);
        const [pagados, fiados] = await Promise.all([
            supabase.from('pago').select(SELECT).eq('estado', 'pagado')
                .gte('fecha_pagado', desde).lt('fecha_pagado', hasta),
            supabase.from('pago').select(SELECT).eq('estado', 'pendiente')
                .gte('fecha', desde).lt('fecha', hasta),
        ]);
        for (const r of [pagados, fiados]) {
            if (r.error) {
                if (tablaNoExiste(r.error)) return sinTabla(res);
                throw r.error;
            }
        }
        const movimientos = [...pagados.data, ...fiados.data]
            .map(plano)
            .sort((a, b) => String(b.fecha_pagado || b.fecha).localeCompare(String(a.fecha_pagado || a.fecha))
                || String(b.created_at).localeCompare(String(a.created_at)));
        res.status(200).json({ tabla: true, mes, medios: MEDIOS, movimientos });
    } catch (error) {
        console.error('Error listando pagos:', error);
        res.status(500).json({ error: error.message });
    }
};

// Todo lo que sigue pendiente (fiados de clientes y deudas con proveedores)
pagosController.pendientes = async (req, res) => {
    try {
        const { data, error } = await supabase.from('pago').select(SELECT)
            .eq('estado', 'pendiente').order('fecha', { ascending: true });
        if (error) {
            if (tablaNoExiste(error)) return sinTabla(res);
            throw error;
        }
        res.status(200).json({ tabla: true, medios: MEDIOS, pendientes: data.map(plano) });
    } catch (error) {
        console.error('Error listando pendientes:', error);
        res.status(500).json({ error: error.message });
    }
};

// Historial de un cliente con sus totales
pagosController.deCliente = async (req, res) => {
    try {
        const { data, error } = await supabase.from('pago').select(SELECT)
            .eq('id_usuario', req.params.idUsuario)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(300);
        if (error) {
            if (tablaNoExiste(error)) return sinTabla(res);
            throw error;
        }
        const movimientos = data.map(plano);
        const suma = (filtro) => movimientos.filter(filtro).reduce((s, p) => s + p.monto, 0);
        res.status(200).json({
            tabla: true,
            medios: MEDIOS,
            resumen: {
                pagado: suma((p) => p.tipo === 'cobro' && p.estado === 'pagado'),
                debe: suma((p) => p.tipo === 'cobro' && p.estado === 'pendiente'),
                saldo: Math.max(0, suma((p) => p.tipo === 'saldo')),
            },
            movimientos,
        });
    } catch (error) {
        console.error('Error listando pagos del cliente:', error);
        res.status(500).json({ error: error.message });
    }
};

// Debe y saldo a favor de todos los clientes (para las etiquetas)
pagosController.estadoClientes = async (req, res) => {
    try {
        const { data, error } = await supabase.from('pago').select('id_usuario, tipo, estado, monto, fecha')
            .not('id_usuario', 'is', null)
            .or('and(tipo.eq.cobro,estado.eq.pendiente),tipo.eq.saldo');
        if (error) {
            if (tablaNoExiste(error)) return res.status(200).json({ tabla: false, clientes: {} });
            throw error;
        }
        const clientes = {};
        for (const p of data) {
            const c = clientes[p.id_usuario] || (clientes[p.id_usuario] = { debe: 0, fiados: 0, desde: null, saldo: 0 });
            if (p.tipo === 'saldo') {
                c.saldo += Number(p.monto) || 0;
            } else {
                c.debe += Number(p.monto) || 0;
                c.fiados += 1;
                if (!c.desde || p.fecha < c.desde) c.desde = p.fecha;
            }
        }
        for (const [id, c] of Object.entries(clientes)) {
            c.saldo = Math.max(0, c.saldo);
            if (!c.debe && !c.saldo) delete clientes[id];
        }
        res.status(200).json({ tabla: true, clientes });
    } catch (error) {
        console.error('Error calculando estado de clientes:', error);
        res.status(500).json({ error: error.message });
    }
};

// Agregar saldo a favor (compensación) a un cliente
pagosController.agregarSaldo = async (req, res) => {
    try {
        const { id_usuario, monto, notas } = req.body || {};
        const valor = Number(monto);
        if (!id_usuario) return res.status(400).json({ error: 'Falta el cliente.' });
        if (!Number.isFinite(valor) || valor <= 0) {
            return res.status(400).json({ error: 'El saldo a favor debe ser mayor que 0.' });
        }
        const hoy = todayKey();
        const { error } = await supabase.from('pago').insert([{
            tipo: 'saldo',
            estado: 'pagado',
            monto: valor,
            fecha: hoy,
            fecha_pagado: hoy,
            id_usuario,
            detalle: [],
            notas: notas ? String(notas).slice(0, 500) : 'Saldo a favor',
        }]);
        if (error) {
            if (falteTipoSaldo(error)) {
                return res.status(400).json({
                    error: 'Para usar saldo a favor falta un paso en Supabase: ejecuta el archivo sql/pago_saldo.sql (una vez).',
                });
            }
            throw error;
        }
        res.status(200).json({ mensaje: 'Saldo a favor agregado' });
    } catch (error) {
        console.error('Error agregando saldo a favor:', error);
        res.status(500).json({ error: error.message });
    }
};

// Un fiado / deuda ya se pagó
pagosController.marcarPagado = async (req, res) => {
    try {
        const medio = MEDIOS.includes(req.body?.medio) ? req.body.medio : null;
        const cambios = { estado: 'pagado', fecha_pagado: todayKey(), medio };
        const monto = Number(req.body?.monto);
        if (req.body?.monto !== undefined && req.body?.monto !== '') {
            if (!Number.isFinite(monto) || monto < 0) {
                return res.status(400).json({ error: 'El monto no es válido.' });
            }
            cambios.monto = monto;
        }
        const { data, error } = await supabase.from('pago').update(cambios)
            .eq('id', req.params.id).eq('estado', 'pendiente').select('id');
        if (error) throw error;
        if (!data?.length) return res.status(404).json({ error: 'Ese pago ya no está pendiente.' });
        res.status(200).json({ mensaje: 'Pago marcado como recibido' });
    } catch (error) {
        console.error('Error marcando pago:', error);
        res.status(500).json({ error: error.message });
    }
};

// Borrar un registro equivocado (no cambia fechas de vencimiento)
pagosController.eliminar = async (req, res) => {
    try {
        const { error } = await supabase.from('pago').delete().eq('id', req.params.id);
        if (error) throw error;
        res.status(200).json({ mensaje: 'Pago eliminado' });
    } catch (error) {
        console.error('Error eliminando pago:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = pagosController;
