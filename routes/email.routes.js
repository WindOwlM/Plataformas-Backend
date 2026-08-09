const express = require('express');
const router = express.Router();
const { injectAuthService } = require('../middlewares/auth.middleware');
const emailController = require('../controllers/email.controller');

router.use(injectAuthService);

router.get('/', emailController.getEmails);
router.get('/:id', emailController.getEmailById);
router.get('/profile', emailController.getProfile);
router.get('/search', emailController.searchEmails);

module.exports = router;