const supabase = require('../config/supabase');

const ventasController = {};

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
                valor_venta
            }])
            .select();

        if (error) throw error;
        res.status(201).json({ mensaje: 'Venta registrada con éxito', venta: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Esta consulta usa joins (select de relaciones en Supabase) para traerte todo armado
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

module.exports = ventasController;