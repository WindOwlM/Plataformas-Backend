const supabase = require('../config/supabase');

const ventasController = {};

// REGISTRAR VENTA/PUESTO
ventasController.registrarVenta = async (req, res) => {
    try {
        const { 
            id_usuario, 
            id_cuenta, 
            pin, 
            vencimiento_usuario, 
            es_combo, 
            valor_venta 
        } = req.body;

        const { data, error } = await supabase
            .from('usuario_cuenta')
            .insert([{
                id_usuario,
                id_cuenta,
                pin,
                vencimiento_usuario,
                es_combo,
                valor_venta,
                estado: id_usuario ? 'activa' : 'disponible',
                fecha_venta: id_usuario ? new Date().toISOString() : null
            }])
            .select();

        if (error) throw error;
        res.status(201).json({ mensaje: 'Puesto registrado', venta: data[0] });
    } catch (error) {
        console.error("Error registrando venta:", error);
        res.status(500).json({ error: error.message });
    }
};

// OBTENER VENTAS
ventasController.obtenerVentas = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuario_cuenta')
            .select(`
                *,
                usuario ( nombre, numero_telefono ),
                cuenta ( correo, plataforma ( nombre_plat ) )
            `);
            
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ACTUALIZAR VENTA/PUESTO
ventasController.actualizarVenta = async (req, res) => {
    try {
        const { id } = req.params;
        const { id_usuario, pin, vencimiento_usuario, es_combo, valor_venta } = req.body;
        
        let actualizaciones = {};
        
        if (id_usuario !== undefined) actualizaciones.id_usuario = id_usuario;
        if (pin !== undefined) actualizaciones.pin = pin;
        if (vencimiento_usuario !== undefined) actualizaciones.vencimiento_usuario = vencimiento_usuario;
        if (es_combo !== undefined) actualizaciones.es_combo = es_combo;
        if (valor_venta !== undefined) actualizaciones.valor_venta = valor_venta;

        const { data, error } = await supabase
            .from('usuario_cuenta')
            .update(actualizaciones)
            .eq('id', id)
            .select();

        if (error) throw error;
        if (data.length === 0) return res.status(404).json({ error: 'Registro no encontrado' });
        
        res.status(200).json({ mensaje: 'Puesto actualizado', venta: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ELIMINAR VENTA/PUESTO
ventasController.eliminarVenta = async (req, res) => {
    try {
        const { id } = req.params;
        
        const { error } = await supabase
            .from('usuario_cuenta')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        res.status(200).json({ mensaje: 'Puesto eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = ventasController;