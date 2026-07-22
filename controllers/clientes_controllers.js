const supabase = require('../config/supabase');

const clientesController = {};

clientesController.crearCliente = async (req, res) => {
    try {
        const { nombre, numero_telefono } = req.body;
        const { data, error } = await supabase
            .from('usuario')
            .insert([{ nombre, numero_telefono }])
            .select();
            
        if (error) throw error;
        res.status(201).json({ mensaje: 'Cliente creado', cliente: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

clientesController.obtenerClientes = async (req, res) => {
    try {
        const { data, error } = await supabase.from('usuario').select('*');
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = clientesController;