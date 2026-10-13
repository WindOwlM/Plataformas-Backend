const express = require('express');
const router = express.Router();
const porUbicarController = require('../controllers/por_ubicar_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

router.get('/', verificarAdmin, porUbicarController.listar);
router.get('/:id/opciones', verificarAdmin, porUbicarController.opcionesReubicar);
router.post('/:id/reubicar', verificarAdmin, porUbicarController.reubicar);
router.delete('/:id', verificarAdmin, porUbicarController.eliminar);

module.exports = router;
