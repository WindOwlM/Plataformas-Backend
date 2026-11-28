const express = require('express');
const router = express.Router();
const pagosController = require('../controllers/pagos_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

router.get('/', verificarAdmin, pagosController.listarMes);
router.get('/pendientes', verificarAdmin, pagosController.pendientes);
router.get('/cliente/:idUsuario', verificarAdmin, pagosController.deCliente);
router.get('/clientes-estado', verificarAdmin, pagosController.estadoClientes);
router.post('/saldo', verificarAdmin, pagosController.agregarSaldo);
router.patch('/:id/pagado', verificarAdmin, pagosController.marcarPagado);
router.delete('/:id', verificarAdmin, pagosController.eliminar);

module.exports = router;
