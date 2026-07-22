const supabase = require('../config/supabase');
const bcrypt = require('bcrypt');

const cuentasController = {};

// Función para crear una nueva cuenta de streaming
cuentasController.crearCuenta = async (req, res) => {
    try {
        const { 
            id_plataforma, 
            id_proveedor, 
            correo, 
            contrasena_plana, // La contraseña que escribes en el frontend
            precio_costo 
        } = req.body;

        // 1. Encriptar la contraseña de la cuenta (Netflix, Max, etc.)
        const saltRounds = 10; // 10 es el estándar recomendado para velocidad/seguridad
        const hash = await bcrypt.hash(contrasena_plana, saltRounds);

        // 2. Guardar en Supabase
        const { data, error } = await supabase
            .from('cuenta')
            .insert([
                {
                    id_plataforma,
                    id_proveedor,
                    correo,
                    contrasena_encriptada: hash, // Guardamos el hash, NUNCA la contraseña real
                    precio_costo
                }
            ])
            .select(); // Le decimos a Supabase que nos devuelva el registro creado

        if (error) throw error;

        // 3. Responder al frontend
        res.status(201).json({
            mensaje: 'Cuenta guardada exitosamente',
            cuenta: data[0]
        });

    } catch (error) {
        console.error("Error al crear cuenta:", error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = cuentasController;