const { todayKey } = require('./vencimientos');

const MEDIOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Llave', 'Efectivo', 'Otro'];

function tablaNoExiste(error) {
    const texto = `${error?.code || ''} ${error?.message || ''}`;
    return /42P01|PGRST205|relation .*pago.* does not exist|Could not find the table/i.test(texto);
}

// Guarda el pago de una renovación. Nunca hace fallar la renovación: si algo
// sale mal devuelve un aviso en español para mostrarlo en amarillo.
//   pago = { registrar, estado: 'pagado'|'pendiente', monto, medio, detalle, notas }
async function registrarPagoRenovacion(supabase, pago, { tipo, idUsuario = null, proveedor = null }) {
    if (!pago || pago.registrar === false) return null;
    const estado = pago.estado === 'pendiente' ? 'pendiente' : 'pagado';
    const monto = Number(pago.monto);
    if (!Number.isFinite(monto) || monto < 0) {
        return 'Se renovó, pero el pago no se guardó porque el monto no es válido.';
    }
    const hoy = todayKey();
    const medio = estado === 'pagado' && MEDIOS.includes(pago.medio) ? pago.medio : null;
    const detalle = (Array.isArray(pago.detalle) ? pago.detalle : []).slice(0, 50).map((d) => ({
        plataforma: String(d.plataforma || '').slice(0, 80),
        correo: String(d.correo || '').slice(0, 160),
        valor: Number(d.valor) || 0,
        fecha: String(d.fecha || '').slice(0, 10),
    }));

    const { error } = await supabase.from('pago').insert([{
        tipo,
        estado,
        monto,
        medio,
        fecha: hoy,
        fecha_pagado: estado === 'pagado' ? hoy : null,
        id_usuario: tipo === 'cobro' ? idUsuario : null,
        proveedor: tipo === 'gasto' ? (proveedor ? String(proveedor).slice(0, 120) : null) : null,
        detalle,
        notas: pago.notas ? String(pago.notas).slice(0, 500) : null,
    }]);
    if (!error) return null;
    console.error('No se pudo guardar el pago:', error);
    if (tablaNoExiste(error)) {
        return 'Se renovó, pero el pago no se guardó: falta crear la tabla de pagos en Supabase (archivo sql/pago.sql).';
    }
    return 'Se renovó, pero el pago no se pudo guardar. Revisa el registro de errores.';
}

function unirAvisos(...avisos) {
    const lista = avisos.filter(Boolean);
    return lista.length ? lista.join(' ') : null;
}

module.exports = { MEDIOS, registrarPagoRenovacion, unirAvisos, tablaNoExiste };
