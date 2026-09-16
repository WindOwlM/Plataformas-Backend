const meController = {};

// Devuelve el perfil del administrador autenticado.
// El middleware verificarAdmin ya validó el token y trajo los datos,
// así que acá no hace falta ninguna consulta adicional.
meController.obtenerPerfil = (req, res) => {
    res.status(200).json(req.usuarioAuth);
};

module.exports = meController;