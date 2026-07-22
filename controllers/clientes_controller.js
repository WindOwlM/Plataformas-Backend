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

clientesController.actualizarCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, numero_telefono } = req.body;
        
        // Armamos dinámicamente lo que se va a actualizar
        let actualizaciones = {};
        if (nombre !== undefined) actualizaciones.nombre = nombre;
        if (numero_telefono !== undefined) actualizaciones.numero_telefono = numero_telefono;
        actualizaciones.updated_at = new Date(); // Actualizamos la fecha de modificación

        const { data, error } = await supabase
            .from('usuario')
            .update(actualizaciones)
            .eq('id', id)
            .select();

        if (error) throw error;
        if (data.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
        
        res.status(200).json({ mensaje: 'Cliente actualizado', cliente: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = clientesController;