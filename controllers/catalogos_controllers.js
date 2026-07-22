const supabase = require('../config/supabase');

const catalogosController = {};

// --- PLATAFORMAS ---
catalogosController.crearPlataforma = async (req, res) => {
    try {
        const { nombre_plat } = req.body;
        const { data, error } = await supabase.from('plataforma').insert([{ nombre_plat }]).select();
        if (error) throw error;
        res.status(201).json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

catalogosController.obtenerPlataformas = async (req, res) => {
    try {
        const { data, error } = await supabase.from('plataforma').select('*');
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- PROVEEDORES ---
catalogosController.crearProveedor = async (req, res) => {
    try {
        const { nombre_prov } = req.body;
        const { data, error } = await supabase.from('proveedor').insert([{ nombre_prov }]).select();
        if (error) throw error;
        res.status(201).json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

catalogosController.obtenerProveedores = async (req, res) => {
    try {
        const { data, error } = await supabase.from('proveedor').select('*');
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = catalogosController;