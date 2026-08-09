const googleAuthService = require('../services/googleAuth.service');

class AuthController {
  /**
   * GET /auth/google?email=usuario@gmail.com
   */
  redirectToGoogle(req, res) {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Debes proporcionar ?email=tu_cuenta@gmail.com',
      });
    }

    const url = googleAuthService.getAuthUrl(email);
    res.redirect(url);
  }

  /**
   * GET /auth/google/callback?state=...&code=...
   */
  async handleCallback(req, res) {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.status(400).json({
          success: false,
          message: 'Faltan parámetros de callback',
        });
      }

      // Decodificar el email del state
      const email = Buffer.from(state, 'base64').toString('utf8');

      const tokens = await googleAuthService.getTokens(code);
      await googleAuthService.saveTokens(email, tokens);

      res.json({
        success: true,
        message: `Cuenta ${email} conectada exitosamente.`,
        email,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al conectar cuenta',
        error: error.message,
      });
    }
  }

  /**
   * GET /auth/accounts
   * Lista todas las cuentas conectadas.
   */
  async listAccounts(req, res) {
    try {
      const accounts = await googleAuthService.listConnectedAccounts();
      res.json({
        success: true,
        count: accounts.length,
        accounts,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error al listar cuentas',
        error: error.message,
      });
    }
  }
}

module.exports = new AuthController();