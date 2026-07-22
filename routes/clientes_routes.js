const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientes.controller.js');
const verificarAdmin = require('../middlewares/auth.middleware.js');

router.post('/', verificarAdmin, clientesController.crearCliente);
router.get('/', verificarAdmin, clientesController.obtenerClientes);

module.exports = router;