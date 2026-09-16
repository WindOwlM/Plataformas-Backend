const express = require('express');
const router = express.Router();
const meController = require('../controllers/me_controller.js');
const verificarAdmin = require('../middlewares/auth_middleware.js');

router.get('/', verificarAdmin, meController.obtenerPerfil);

module.exports = router;