const supabase = require('../config/supabase');

const cuentasController = {};

// CREAR CUENTA con puestos
cuentasController.crearCuenta = async (req, res) => {
    try {
        const {
            id_plataforma,
            id_proveedor,
            correo,
            contrasena,
            precio_costo,
            fecha_vencimiento,
            notas,
            puestos = []
        } = req.body;

        if (!fecha_vencimiento) {
            return res.status(400).json({ error: 'La fecha de vencimiento es obligatoria.' });
        }

        if (!contrasena) {
            return res.status(400).json({ error: 'La contraseña es obligatoria.' });
        }

        // 1. Crear la cuenta
        const { data: cuentaData, error: cuentaError } = await supabase
            .from('cuenta')
            .insert([{
                id_plataforma,
                id_proveedor,
                correo,
                contrasena,
                precio_costo,
                fecha_vencimiento,
                fecha_agregado: new Date().toISOString().split('T')[0],
                notas: notas || null,
                estado: 'disponible'
            }])
            .select();

        if (cuentaError) {
            console.error('Error creando cuenta:', cuentaError);
            throw cuentaError;
        }

        const cuenta = cuentaData[0];

        // 2. Crear los puestos en usuario_cuenta
        const puestosValidos = puestos.filter(p => p.id_usuario);

        if (puestosValidos.length > 0) {
            const puestosParaInsertar = puestosValidos.map(p => ({
                id_usuario: p.id_usuario,
                id_cuenta: cuenta.id,
                pin: p.pin || null,
                vencimiento_usuario: p.vencimiento_usuario || null,
                es_combo: p.es_combo || false,
                valor_venta: p.valor_venta || 0,
                estado: 'activa',
                fecha_venta: new Date().toISOString()
            }));

            const { error: puestosError } = await supabase
                .from('usuario_cuenta')
                .insert(puestosParaInsertar);

            if (puestosError) {
                console.error('Error creando puestos:', puestosError);
                throw puestosError;
            }
        }

        // 3. Actualizar estado si hay ventas
        const tieneVentas = puestosValidos.length > 0;
        if (tieneVentas) {
            await supabase
                .from('cuenta')
                .update({ estado: 'vendida' })
                .eq('id', cuenta.id);
        }

        res.status(201).json({
            mensaje: 'Cuenta y puestos creados exitosamente',
            cuenta: {
                ...cuenta,
                estado: tieneVentas ? 'vendida' : 'disponible'
            }
        });

    } catch (error) {
        console.error("Error al crear cuenta:", error);
        res.status(500).json({ error: error.message });
    }
};

// OBTENER CUENTAS con puestos
// Soporta filtros por:
// - estado, plataforma
// - correo (substring, case-insensitive)
// - usuario (nombre de usuario substring, case-insensitive)
// - fecha_inicio / fecha_fin -> filtra por cuenta.fecha_vencimiento
// - usuario_fecha_inicio / usuario_fecha_fin -> filtra puestos por vencimiento_usuario
cuentasController.obtenerCuentas = async (req, res) => {
    try {
        const {
            estado,
            plataforma,
            correo,
            usuario,
            fecha_inicio,
            fecha_fin,
            usuario_fecha_inicio,
            usuario_fecha_fin
        } = req.query;

        let query = supabase
            .from('cuenta')
            .select(`
                *,
                plataforma ( nombre_plat ),
                proveedor ( nombre_prov ),
                usuario_cuenta (
                    id,
                    id_usuario,
                    pin,
                    vencimiento_usuario,
                    es_combo,
                    valor_venta,
                    estado,
                    usuario ( nombre, numero_telefono )
                )
            `);

        if (estado) query = query.eq('estado', estado);
        if (plataforma) query = query.eq('id_plataforma', plataforma);
        if (fecha_inicio) query = query.gte('fecha_vencimiento', fecha_inicio);
        if (fecha_fin) query = query.lte('fecha_vencimiento', fecha_fin);

        const { data, error } = await query.order('fecha_vencimiento', { ascending: true });

        if (error) throw error;

        // Filtrado adicional en memoria para búsquedas por correo y nombre de usuario
        const cuentasFiltradas = (data || []).filter((c) => {
            if (correo) {
                const correoNorm = (c.correo || '').toLowerCase();
                if (!correoNorm.includes(correo.toLowerCase())) return false;
            }

            if (usuario) {
                const nombreBuscado = usuario.toLowerCase();
                const usuariosCuenta = c.usuario_cuenta || [];
                const match = usuariosCuenta.some((uc) => {
                    const nombre = (uc.usuario && uc.usuario.nombre) ? uc.usuario.nombre.toLowerCase() : '';
                    return nombre.includes(nombreBuscado);
                });
                if (!match) return false;
            }

            if (usuario_fecha_inicio || usuario_fecha_fin) {
                const usuariosCuenta = c.usuario_cuenta || [];
                const anyInRange = usuariosCuenta.some((uc) => {
                    if (!uc.vencimiento_usuario) return false;
                    const v = new Date(uc.vencimiento_usuario);
                    if (usuario_fecha_inicio && new Date(usuario_fecha_inicio) > v) return false;
                    if (usuario_fecha_fin && new Date(usuario_fecha_fin) < v) return false;
                    return true;
                });
                if (!anyInRange) return false;
            }

            return true;
        }).map(c => ({ ...c, usuarios_cuenta: c.usuario_cuenta || [] }));

        res.status(200).json(cuentasFiltradas);
    } catch (error) {
        console.error("Error obteniendo cuentas:", error);
        res.status(500).json({ error: error.message });
    }
};

// ACTUALIZAR CUENTA
cuentasController.actualizarCuenta = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            correo,
            id_plataforma,
            id_proveedor,
            precio_costo,
            fecha_vencimiento,
            notas,
            contrasena,
            puestos = []
        } = req.body;

        let actualizaciones = {};

        if (correo !== undefined) actualizaciones.correo = correo;
        if (id_plataforma !== undefined) actualizaciones.id_plataforma = id_plataforma;
        if (id_proveedor !== undefined) actualizaciones.id_proveedor = id_proveedor;
        if (precio_costo !== undefined) actualizaciones.precio_costo = precio_costo;
        if (fecha_vencimiento !== undefined) actualizaciones.fecha_vencimiento = fecha_vencimiento;
        if (notas !== undefined) actualizaciones.notas = notas;
        if (contrasena) actualizaciones.contrasena = contrasena;

        const { data, error } = await supabase
            .from('cuenta')
            .update(actualizaciones)
            .eq('id', id)
            .select();

        if (error) throw error;
        if (data.length === 0) return res.status(404).json({ error: 'Cuenta no encontrada' });

        const cuenta = data[0];
        const puestosPayload = Array.isArray(puestos) ? puestos : [];

        const existingPuestosResult = await supabase
            .from('usuario_cuenta')
            .select('id')
            .eq('id_cuenta', cuenta.id);

        if (existingPuestosResult.error) throw existingPuestosResult.error;

        const existingPuestosIds = (existingPuestosResult.data || []).map((p) => p.id);
        const puestosParaProcesar = puestosPayload
            .filter(p => p.id_usuario || p.id)
            .map(p => ({
                ...(p.id ? { id: p.id } : {}),
                id_usuario: p.id_usuario,
                id_cuenta: cuenta.id,
                pin: p.pin || null,
                vencimiento_usuario: p.vencimiento_usuario || null,
                es_combo: p.es_combo || false,
                valor_venta: p.valor_venta || 0,
                estado: p.estado || 'activa',
                fecha_venta: p.fecha_venta || new Date().toISOString()
            }));

        const puestosConId = puestosParaProcesar.filter(p => p.id);
        const puestosSinId = puestosParaProcesar.filter(p => !p.id);
        const receivedIds = puestosConId.map((p) => p.id);
        const idsParaEliminar = existingPuestosIds.filter((id) => !receivedIds.includes(id));

        if (idsParaEliminar.length > 0) {
            const { error: errorEliminarPuestos } = await supabase
                .from('usuario_cuenta')
                .delete()
                .in('id', idsParaEliminar);

            if (errorEliminarPuestos) throw errorEliminarPuestos;
        }

        if (puestosConId.length > 0) {
            for (const puesto of puestosConId) {
                const { id, ...resto } = puesto;
                const { error: errorActualizarPuesto } = await supabase
                    .from('usuario_cuenta')
                    .update(resto)
                    .eq('id', id);

                if (errorActualizarPuesto) throw errorActualizarPuesto;
            }
        }

        if (puestosSinId.length > 0) {
            const { error: errorInsertarPuestos } = await supabase
                .from('usuario_cuenta')
                .insert(puestosSinId);

            if (errorInsertarPuestos) throw errorInsertarPuestos;
        }

        const tieneVentas = puestosPayload.some(p => p.id_usuario);
        await supabase
            .from('cuenta')
            .update({ estado: tieneVentas ? 'vendida' : 'disponible' })
            .eq('id', cuenta.id);

        const { data: cuentaActualizada, error: errorCuentaActualizada } = await supabase
            .from('cuenta')
            .select(`
                *,
                plataforma ( nombre_plat ),
                proveedor ( nombre_prov ),
                usuario_cuenta (
                    id,
                    id_usuario,
                    pin,
                    vencimiento_usuario,
                    es_combo,
                    valor_venta,
                    estado,
                    usuario ( nombre, numero_telefono )
                )
            `)
            .eq('id', cuenta.id)
            .single();

        if (errorCuentaActualizada) throw errorCuentaActualizada;

        res.status(200).json({
            mensaje: 'Cuenta actualizada',
            cuenta: {
                ...cuentaActualizada,
                usuarios_cuenta: cuentaActualizada.usuario_cuenta || []
            }
        });
    } catch (error) {
        console.error("Error actualizando cuenta:", error);
        res.status(500).json({ error: error.message });
    }
};

// ELIMINAR CUENTA
cuentasController.eliminarCuenta = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('cuenta')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({ mensaje: 'Cuenta eliminada' });
    } catch (error) {
        console.error("Error eliminando cuenta:", error);
        res.status(500).json({ error: error.message });
    }
};

// OBTENER CONTRASEÑA (texto plano directo, sin descifrado)
cuentasController.obtenerContrasena = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('cuenta')
            .select('id, contrasena')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Cuenta no encontrada' });

        res.status(200).json({ contrasena: data.contrasena });
    } catch (error) {
        console.error('Error obteniendo contraseña:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = cuentasController;