const supabase = require('../config/supabase');
const { todayKey } = require('../lib/vencimientos');
const { MEDIOS, tablaNoExiste } = require('../lib/pagos');

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

// Historial de un cliente
pagosController.deCliente = async (req, res) => {
    try {
        const { data, error } = await supabase.from('pago').select(SELECT)
            .eq('id_usuario', req.params.idUsuario).order('fecha', { ascending: false }).limit(100);
        if (error) {
            if (tablaNoExiste(error)) return sinTabla(res);
            throw error;
        }
        res.status(200).json({ tabla: true, movimientos: data.map(plano) });
    } catch (error) {
        console.error('Error listando pagos del cliente:', error);
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
