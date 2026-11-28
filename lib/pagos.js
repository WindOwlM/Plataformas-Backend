const { todayKey } = require('./vencimientos');

const MEDIOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Llave', 'Efectivo', 'Otro'];

function tablaNoExiste(error) {
    const texto = `${error?.code || ''} ${error?.message || ''}`;
    return /42P01|PGRST205|relation .*pago.* does not exist|Could not find the table/i.test(texto);
}

// Guarda el pago de una renovación. Nunca hace fallar la renovación: si algo
// sale mal devuelve un aviso en español para mostrarlo en amarillo.
//   pago = { registrar, estado: 'pagado'|'pendiente'|'parcial', monto, total, medio, detalle, notas }
//   'parcial' = pagó `monto` ahora y queda debiendo (total - monto): se guardan dos registros.
async function registrarPagoRenovacion(supabase, pago, { tipo, idUsuario = null, proveedor = null }) {
    if (!pago || pago.registrar === false) return null;
    const estado = ['pendiente', 'parcial'].includes(pago.estado) ? pago.estado : 'pagado';
    const monto = Number(pago.monto);
    if (!Number.isFinite(monto) || monto < 0) {
        return 'Se renovó, pero el pago no se guardó porque el monto no es válido.';
    }
    let resto = 0;
    if (estado === 'parcial') {
        const total = Number(pago.total);
        if (!Number.isFinite(total) || monto <= 0 || monto >= total) {
            return 'Se renovó, pero el pago no se guardó: en "Pagó una parte" lo pagado debe ser mayor que 0 y menor que el total.';
        }
        resto = total - monto;
    }

    const hoy = todayKey();
    const medio = estado !== 'pendiente' && MEDIOS.includes(pago.medio) ? pago.medio : null;
    const detalle = (Array.isArray(pago.detalle) ? pago.detalle : []).slice(0, 50).map((d) => ({
        plataforma: String(d.plataforma || '').slice(0, 80),
        correo: String(d.correo || '').slice(0, 160),
        valor: Number(d.valor) || 0,
        fecha: String(d.fecha || '').slice(0, 10),
    }));
    const base = {
        tipo,
        fecha: hoy,
        id_usuario: tipo === 'cobro' ? idUsuario : null,
        proveedor: tipo === 'gasto' ? (proveedor ? String(proveedor).slice(0, 120) : null) : null,
        detalle,
    };
    const notas = pago.notas ? String(pago.notas).slice(0, 500) : null;

    const filas = estado === 'parcial'
        ? [
            { ...base, estado: 'pagado', monto, medio, fecha_pagado: hoy, notas: notas || `Abono; quedó debiendo ${resto}` },
            { ...base, estado: 'pendiente', monto: resto, medio: null, fecha_pagado: null, notas: notas || `Resto después de abonar ${monto}` },
        ]
        : [{
            ...base,
            estado,
            monto,
            medio,
            fecha_pagado: estado === 'pagado' ? hoy : null,
            notas,
        }];

    const { error } = await supabase.from('pago').insert(filas);
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
