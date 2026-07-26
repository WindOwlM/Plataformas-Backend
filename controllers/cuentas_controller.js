const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');

const cuentasController = {};

// CREAR CUENTA con puestos
cuentasController.crearCuenta = async (req, res) => {
    try {
        const { 
            id_plataforma, 
            id_proveedor, 
            correo, 
            contrasena_plana,
            precio_costo,
            fecha_vencimiento,
            notas,
            puestos = []
        } = req.body;

        console.log('Recibido:', { correo, puestosCount: puestos.length });

        if (!fecha_vencimiento) {
            return res.status(400).json({ error: 'La fecha de vencimiento es obligatoria.' });
        }

        if (!contrasena_plana) {
            return res.status(400).json({ error: 'La contraseña es obligatoria.' });
        }

        const saltRounds = 10;
        const hash = await bcrypt.hash(contrasena_plana, saltRounds);

        // 1. Crear la cuenta
        const { data: cuentaData, error: cuentaError } = await supabase
            .from('cuenta')
            .insert([{
                id_plataforma,
                id_proveedor,
                correo,
                contrasena_encriptada: hash,
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
        console.log('Cuenta creada:', cuenta.id);

        // 2. Crear los puestos en usuario_cuenta
        const puestosValidos = puestos.filter(p => p.pin || p.id_usuario);
        
        if (puestosValidos.length > 0) {
            const puestosParaInsertar = puestosValidos.map(p => ({
                id_usuario: p.id_usuario || null,
                id_cuenta: cuenta.id,
                pin: p.pin || null,
                vencimiento_usuario: p.vencimiento_usuario || null,
                es_combo: p.es_combo || false,
                valor_venta: p.valor_venta || 0,
                estado: p.id_usuario ? 'activa' : 'disponible',
                fecha_venta: p.id_usuario ? new Date().toISOString() : null
            }));

            console.log('Insertando puestos:', puestosParaInsertar.length);

            const { data: puestosData, error: puestosError } = await supabase
                .from('usuario_cuenta')
                .insert(puestosParaInsertar)
                .select();

            if (puestosError) {
                console.error('Error creando puestos:', puestosError);
            } else {
                console.log('Puestos creados:', puestosData?.length);
            }
        }

        // 3. Actualizar estado si hay ventas
        const tieneVentas = puestos.some(p => p.id_usuario);
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
cuentasController.obtenerCuentas = async (req, res) => {
    try {
        const { estado, plataforma } = req.query;
        
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

        const { data, error } = await query.order('fecha_vencimiento', { ascending: true });

        if (error) throw error;
        
        const cuentasFormateadas = data.map(c => ({
            ...c,
            usuarios_cuenta: c.usuario_cuenta || []
        }));

        res.status(200).json(cuentasFormateadas);
    } catch (error) {
        console.error("Error obteniendo cuentas:", error);
        res.status(500).json({ error: error.message });
    }
};

// ACTUALIZAR CUENTA
cuentasController.actualizarCuenta = async (req, res) => {
    try {
        const { id } = req.params;
        const { correo, id_plataforma, id_proveedor, precio_costo, fecha_vencimiento, notas, contrasena_plana } = req.body;
        
        let actualizaciones = {};
        
        if (correo !== undefined) actualizaciones.correo = correo;
        if (id_plataforma !== undefined) actualizaciones.id_plataforma = id_plataforma;
        if (id_proveedor !== undefined) actualizaciones.id_proveedor = id_proveedor;
        if (precio_costo !== undefined) actualizaciones.precio_costo = precio_costo;
        if (fecha_vencimiento !== undefined) actualizaciones.fecha_vencimiento = fecha_vencimiento;
        if (notas !== undefined) actualizaciones.notas = notas;

        if (contrasena_plana) {
            const saltRounds = 10;
            actualizaciones.contrasena_encriptada = await bcrypt.hash(contrasena_plana, saltRounds);
        }

        const { data, error } = await supabase
            .from('cuenta')
            .update(actualizaciones)
            .eq('id', id)
            .select();

        if (error) throw error;
        if (data.length === 0) return res.status(404).json({ error: 'Cuenta no encontrada' });
        
        res.status(200).json({ mensaje: 'Cuenta actualizada', cuenta: data[0] });
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

module.exports = cuentasController;