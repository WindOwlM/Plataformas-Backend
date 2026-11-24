const express = require('express');
const router = express.Router();
const correosController = require('../controllers/correos_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

// Sin verificarAdmin: es la vuelta desde Google/Microsoft; se valida con el "state" firmado
router.get('/callback/:provider', correosController.callback);

router.get('/vinculados', verificarAdmin, correosController.listarVinculados);
router.post('/conectar', verificarAdmin, correosController.conectar);
router.post('/leer', verificarAdmin, correosController.leer);
router.delete('/vinculados/:correo', verificarAdmin, correosController.desvincular);

module.exports = router;
