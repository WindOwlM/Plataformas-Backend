const { todayKey } = require('./vencimientos');

const MEDIOS = ['Nequi', 'Bancolombia', 'Daviplata', 'Llave', 'Efectivo', 'Otro'];

function falteTipoSaldo(error) {
    const texto = `${error?.code || ''} ${error?.message || ''}`;
    return /23514|pago_tipo_check/i.test(texto);
}

// Saldo a favor disponible de un cliente (suma de sus movimientos tipo 'saldo')
async function saldoCliente(supabase, idUsuario) {
    if (!idUsuario) return 0;
    const { data, error } = await supabase.from('pago').select('monto').eq('tipo', 'saldo').eq('id_usuario', idUsuario);
    if (error) return 0;
    return Math.max(0, data.reduce((s, f) => s + (Number(f.monto) || 0), 0));
}

function tablaNoExiste(error) {
    const texto = `${error?.code || ''} ${error?.message || ''}`;
    return /42P01|PGRST205|relation .*pago.* does not exist|Could not find the table/i.test(texto);
}

// Guarda el pago de una renovación. Nunca hace fallar la renovación: si algo
// sale mal devuelve un aviso en español para mostrarlo en amarillo.
//   pago = { registrar, estado: 'pagado'|'pendiente'|'parcial', monto, total, medio, detalle, notas }
//   'parcial' = pagó `monto` ahora y queda debiendo (total - monto): se guardan dos registros.
//   usar_saldo = parte del total cubierta con saldo a favor (solo clientes).
//   'saldo' = el saldo a favor cubrió todo: solo se descuenta el saldo.
async function registrarPagoRenovacion(supabase, pago, { tipo, idUsuario = null, proveedor = null }) {
    if (!pago || pago.registrar === false) return null;

    let avisoSaldo = null;
    const pedidoSaldo = Number(pago.usar_saldo) || 0;
    if (tipo === 'cobro' && idUsuario && pedidoSaldo > 0) {
        const disponible = await saldoCliente(supabase, idUsuario);
        const usado = Math.min(pedidoSaldo, disponible);
        if (usado > 0) {
            const { error } = await supabase.from('pago').insert([{
                tipo: 'saldo',
                estado: 'pagado',
                monto: -usado,
                fecha: todayKey(),
                fecha_pagado: todayKey(),
                id_usuario: idUsuario,
                detalle: [],
                notas: 'Usado al renovar',
            }]);
            if (error) {
                console.error('No se pudo descontar el saldo a favor:', error);
                return 'Se renovó, pero no se pudo descontar el saldo a favor ni guardar el pago. Revisa el registro de errores.';
            }
        }
        if (usado < pedidoSaldo) {
            avisoSaldo = `Ojo: el cliente solo tenía ${pesos(usado)} de saldo a favor, se descontó eso.`;
        }
    }
    if (pago.estado === 'saldo') return avisoSaldo;

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
            { ...base, estado: 'pagado', monto, medio, fecha_pagado: hoy, notas: notas || `Abono; quedó debiendo ${pesos(resto)}` },
            { ...base, estado: 'pendiente', monto: resto, medio: null, fecha_pagado: null, notas: notas || `Resto después de abonar ${pesos(monto)}` },
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
    if (!error) return avisoSaldo;
    console.error('No se pudo guardar el pago:', error);
    if (tablaNoExiste(error)) {
        return 'Se renovó, pero el pago no se guardó: falta crear la tabla de pagos en Supabase (archivo sql/pago.sql).';
    }
    return 'Se renovó, pero el pago no se pudo guardar. Revisa el registro de errores.';
}

function pesos(valor) {
    return `$${Math.round(Number(valor) || 0).toLocaleString('es-CO')}`;
}

function unirAvisos(...avisos) {
    const lista = avisos.filter(Boolean);
    return lista.length ? lista.join(' ') : null;
}

module.exports = { MEDIOS, registrarPagoRenovacion, unirAvisos, tablaNoExiste, falteTipoSaldo, saldoCliente };
