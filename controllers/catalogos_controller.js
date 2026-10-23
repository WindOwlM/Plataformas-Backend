const supabase = require('../config/supabase');

function normalizarCelulares(value) {
    const lista = Array.isArray(value)
        ? value
        : String(value || '').split(/[\n,;|]/);
    return [...new Set(lista.map((n) => String(n || '').trim()).filter(Boolean))];
}

const catalogosController = {};

// --- PLATAFORMAS ---
catalogosController.crearPlataforma = async (req, res) => {
    try {
        const { nombre_plat, max_puestos } = req.body;
        const payload = {
            nombre_plat,
            max_puestos: Number(max_puestos) > 0 ? Number(max_puestos) : 5,
        };
        let { data, error } = await supabase.from('plataforma').insert([payload]).select();
        if (error) {
            ({ data, error } = await supabase.from('plataforma').insert([{ nombre_plat }]).select());
        }
        if (error) throw error;
        res.status(201).json({ ...data[0], max_puestos: payload.max_puestos });
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
        const { nombre_prov, celulares } = req.body;
        const numeros = normalizarCelulares(celulares);
        let { data, error } = await supabase
            .from('proveedor')
            .insert([{ nombre_prov, celulares: numeros }])
            .select();
        if (error) {
            ({ data, error } = await supabase.from('proveedor').insert([{ nombre_prov }]).select());
        }
        if (error) throw error;
        res.status(201).json({ ...data[0], celulares: data[0].celulares || numeros });
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

catalogosController.actualizarPlataforma = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_plat, max_puestos } = req.body;
        const actualizaciones = {};
        if (nombre_plat !== undefined) actualizaciones.nombre_plat = nombre_plat;
        if (max_puestos !== undefined) actualizaciones.max_puestos = Number(max_puestos) || 5;

        let { data, error } = await supabase
            .from('plataforma')
            .update(actualizaciones)
            .eq('id', id)
            .select();

        if (error && actualizaciones.max_puestos !== undefined) {
            const { max_puestos: _omit, ...resto } = actualizaciones;
            ({ data, error } = await supabase
                .from('plataforma')
                .update(resto)
                .eq('id', id)
                .select());
        }

        if (error) throw error;
        if (data.length === 0) return res.status(404).json({ error: 'Plataforma no encontrada' });
        
        res.status(200).json({ mensaje: 'Plataforma actualizada', plataforma: data[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

catalogosController.actualizarProveedor = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_prov, celulares } = req.body;
        const actualizaciones = {};
        if (nombre_prov !== undefined) actualizaciones.nombre_prov = nombre_prov;
        if (celulares !== undefined) actualizaciones.celulares = normalizarCelulares(celulares);

        let { data, error } = await supabase
            .from('proveedor')
            .update(actualizaciones)
            .eq('id', id)
            .select();

        if (error && actualizaciones.celulares !== undefined) {
            const { celulares: _omit, ...resto } = actualizaciones;
            ({ data, error } = await supabase
                .from('proveedor')
                .update(resto)
                .eq('id', id)
                .select());
        }

        if (error) throw error;
        if (data.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });

        res.status(200).json({
            mensaje: 'Proveedor actualizado',
            proveedor: {
                ...data[0],
                celulares: data[0].celulares || actualizaciones.celulares || [],
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


module.exports = catalogosController;