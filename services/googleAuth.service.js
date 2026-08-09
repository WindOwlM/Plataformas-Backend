const { google } = require('googleapis');
const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  SCOPES,
} = require('../config/gmail');
const tokenStorageService = require('./tokenStorage.service');

class GoogleAuthService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
  }

  getAuthUrl(email) {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: Buffer.from(email).toString('base64'),
    });
  }

  async getTokens(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  async saveTokens(email, tokens) {
    await tokenStorageService.saveTokens(email, tokens);
  }

  async loadTokens(email) {
    return await tokenStorageService.loadTokens(email);
  }

  async listConnectedAccounts() {
    return await tokenStorageService.listConnectedAccounts();
  }

  async createAuthClient(email) {
    const tokens = await this.loadTokens(email);

    if (!tokens) {
      throw new Error(
        `La cuenta ${email} no está conectada. Ve a /auth/google?email=${email}`
      );
    }

    const client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    client.setCredentials(tokens);

    client.on('tokens', async (newTokens) => {
      console.log(`🔄 Token refrescado para ${email}`);
      const updated = { ...tokens, ...newTokens };
      await this.saveTokens(email, updated);
    });

    if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
      console.log(`⏰ Token expirado para ${email}, refrescando...`);
      const { credentials } = await client.refreshAccessToken();
      const updated = { ...tokens, ...credentials };
      await this.saveTokens(email, updated);
      client.setCredentials(updated);
    }

    return client;
  }
}

module.exports = new GoogleAuthService();