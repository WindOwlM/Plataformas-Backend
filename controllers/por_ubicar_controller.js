const supabase = require('../config/supabase');
const {
    actualizarEstadoCuenta,
    asegurarCupo,
    decorarCuenta,
} = require('../lib/cuentaEstado');

const porUbicarController = {};

async function plataformasPermitidas(idUsuario, idPlataformaActual) {
    const ids = new Set();
    if (idPlataformaActual) ids.add(idPlataformaActual);

    const { data: puestos, error: puestosError } = await supabase
        .from('usuario_cuenta')
        .select('cuenta ( id_plataforma )')
        .eq('id_usuario', idUsuario);

    if (puestosError) throw puestosError;

    for (const row of puestos || []) {
        const plat = row.cuenta?.id_plataforma;
        if (plat) ids.add(plat);
    }

    const { data: pendientes, error: pendientesError } = await supabase
        .from('usuario_por_ubicar')
        .select('id_plataforma')
        .eq('id_usuario', idUsuario);

    if (pendientesError) throw pendientesError;

    for (const row of pendientes || []) {
        if (row.id_plataforma) ids.add(row.id_plataforma);
    }

    return [...ids];
}

porUbicarController.listar = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuario_por_ubicar')
            .select(`
                id,
                id_usuario,
                id_cuenta_anterior,
                id_plataforma,
                pin,
                vencimiento_usuario,
                es_combo,
                valor_venta,
                created_at,
                usuario ( nombre, numero_telefono ),
                plataforma ( nombre_plat ),
                cuenta:id_cuenta_anterior ( correo, id_plataforma )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json((data || []).map((row) => ({
            ...row,
            cuenta: row.cuenta || row.cuenta_anterior || null,
        })));
    } catch (error) {
        console.error('Error listando por ubicar:', error);
        res.status(500).json({ error: error.message });
    }
};

porUbicarController.opcionesReubicar = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: pendiente, error } = await supabase
            .from('usuario_por_ubicar')
            .select('id, id_usuario, id_plataforma')
            .eq('id', id)
            .single();

        if (error || !pendiente) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        const permitidas = await plataformasPermitidas(pendiente.id_usuario, pendiente.id_plataforma);

        const { data: plataformas, error: platError } = await supabase
            .from('plataforma')
            .select('*')
            .in('id', permitidas.length ? permitidas : ['00000000-0000-0000-0000-000000000000']);

        if (platError) throw platError;

        const { data: cuentas, error: cuentasError } = await supabase
            .from('cuenta')
            .select(`
                id, correo, id_plataforma, estado,
                plataforma ( * ),
                usuario_cuenta ( id )
            `)
            .in('id_plataforma', permitidas.length ? permitidas : ['00000000-0000-0000-0000-000000000000'])
            .order('correo');

        if (cuentasError) throw cuentasError;

        res.status(200).json({
            plataformas: plataformas || [],
            cuentas: (cuentas || []).map(decorarCuenta),
        });
    } catch (error) {
        console.error('Error opciones reubicar:', error);
        res.status(500).json({ error: error.message });
    }
};

porUbicarController.moverDesdeCuenta = async (req, res) => {
    try {
        const { id, puestoId } = req.params;

        const { data: puesto, error: puestoError } = await supabase
            .from('usuario_cuenta')
            .select(`
                id,
                id_usuario,
                id_cuenta,
                pin,
                vencimiento_usuario,
                es_combo,
                valor_venta,
                cuenta ( id, id_plataforma )
            `)
            .eq('id', puestoId)
            .eq('id_cuenta', id)
            .single();

        if (puestoError || !puesto) {
            return res.status(404).json({ error: 'Puesto no encontrado' });
        }

        let idPlataforma = puesto.cuenta?.id_plataforma;
        if (!idPlataforma) {
            const { data: cuentaRow } = await supabase
                .from('cuenta')
                .select('id_plataforma')
                .eq('id', puesto.id_cuenta)
                .single();
            idPlataforma = cuentaRow?.id_plataforma;
        }
        if (!idPlataforma) {
            return res.status(400).json({ error: 'La cuenta no tiene plataforma' });
        }

        const { data: pendiente, error: insertError } = await supabase
            .from('usuario_por_ubicar')
            .insert([{
                id_usuario: puesto.id_usuario,
                id_cuenta_anterior: puesto.id_cuenta,
                id_plataforma: idPlataforma,
                pin: puesto.pin || null,
                vencimiento_usuario: puesto.vencimiento_usuario || null,
                es_combo: !!puesto.es_combo,
                valor_venta: puesto.valor_venta || 0,
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        const { error: deleteError } = await supabase
            .from('usuario_cuenta')
            .delete()
            .eq('id', puestoId)
            .eq('id_cuenta', id);

        if (deleteError) throw deleteError;

        await actualizarEstadoCuenta(supabase, id);

        res.status(200).json({ mensaje: 'Cliente pasado a por ubicar', pendiente });
    } catch (error) {
        console.error('Error moviendo a por ubicar:', error);
        res.status(500).json({ error: error.message });
    }
};

porUbicarController.reubicar = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            id_cuenta,
            pin,
            vencimiento_usuario,
            es_combo = false,
            valor_venta = 0,
        } = req.body;

        if (!id_cuenta) {
            return res.status(400).json({ error: 'Debes elegir una cuenta destino' });
        }

        const { data: pendiente, error: pendienteError } = await supabase
            .from('usuario_por_ubicar')
            .select('*')
            .eq('id', id)
            .single();

        if (pendienteError || !pendiente) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }

        const { data: cuenta, error: cuentaError } = await supabase
            .from('cuenta')
            .select('id, id_plataforma')
            .eq('id', id_cuenta)
            .single();

        if (cuentaError || !cuenta) {
            return res.status(404).json({ error: 'Cuenta destino no encontrada' });
        }

        const permitidas = await plataformasPermitidas(pendiente.id_usuario, pendiente.id_plataforma);
        if (!permitidas.includes(cuenta.id_plataforma)) {
            return res.status(400).json({
                error: 'Solo puedes reubicar en plataformas donde esta persona ya estuvo.',
            });
        }

        await asegurarCupo(supabase, id_cuenta, 1);

        const { data: puesto, error: insertError } = await supabase
            .from('usuario_cuenta')
            .insert([{
                id_usuario: pendiente.id_usuario,
                id_cuenta,
                pin: pin || null,
                vencimiento_usuario: vencimiento_usuario || null,
                es_combo: !!es_combo,
                valor_venta: parseFloat(valor_venta) || 0,
                estado: 'activa',
                fecha_venta: new Date().toISOString(),
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        const { error: deleteError } = await supabase
            .from('usuario_por_ubicar')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        await actualizarEstadoCuenta(supabase, id_cuenta);

        res.status(200).json({ mensaje: 'Cliente reubicado', puesto });
    } catch (error) {
        console.error('Error reubicando:', error);
        const status = error.status || 500;
        res.status(status).json({ error: error.message });
    }
};

porUbicarController.eliminar = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('usuario_por_ubicar')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.status(200).json({ mensaje: 'Registro eliminado' });
    } catch (error) {
        console.error('Error eliminando por ubicar:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = porUbicarController;
