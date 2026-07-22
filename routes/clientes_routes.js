const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientes_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

router.post('/', verificarAdmin, clientesController.crearCliente);
router.get('/', verificarAdmin, clientesController.obtenerClientes);
router.patch('/:id', verificarAdmin, clientesController.actualizarCliente);

module.exports = router;