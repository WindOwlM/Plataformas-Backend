const axios = require('axios');
const supabase = require('../config/supabase');

const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID;
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;
const OUTLOOK_REDIRECT_URI = process.env.OUTLOOK_REDIRECT_URI;

const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const AUTH_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';

class OutlookAuthService {
  getAuthUrl(email) {
    const params = new URLSearchParams({
      client_id: OUTLOOK_CLIENT_ID,
      response_type: 'code',
      redirect_uri: OUTLOOK_REDIRECT_URI,
      scope: 'https://graph.microsoft.com/Mail.Read offline_access openid profile email',
      state: Buffer.from(email).toString('base64'),
      prompt: 'select_account consent',
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async getTokens(code) {
    const params = new URLSearchParams({
      client_id: OUTLOOK_CLIENT_ID,
      client_secret: OUTLOOK_CLIENT_SECRET,
      code,
      redirect_uri: OUTLOOK_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const { data } = await axios.post(TOKEN_ENDPOINT, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + data.expires_in * 1000,
    };
  }

  async refreshAccessToken(refreshToken) {
    const params = new URLSearchParams({
      client_id: OUTLOOK_CLIENT_ID,
      client_secret: OUTLOOK_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Read offline_access',
    });

    const { data } = await axios.post(TOKEN_ENDPOINT, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Microsoft no siempre devuelve refresh_token
      expiry_date: Date.now() + data.expires_in * 1000,
    };
  }

  async saveTokens(email, tokens) {
    const { error } = await supabase
      .from('outlook_accounts')
      .upsert(
        {
          email,
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );
    if (error) throw error;
  }

  async loadTokens(email) {
    const { data, error } = await supabase
      .from('outlook_accounts')
      .select('*')
      .eq('email', email)
      .single();
    if (error || !data) return null;
    return {
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expiry_date: data.expiry_date,
    };
  }

  async listConnectedAccounts() {
    const { data, error } = await supabase.from('outlook_accounts').select('email');
    if (error) return [];
    return data.map(d => d.email);
  }

  async createAuthClient(email) {
  const tokens = await this.loadTokens(email);
  
  console.log('📂 Tokens cargados para', email, {
    has_refresh: !!tokens?.refresh_token,
    has_access: !!tokens?.access_token,
    expired: tokens?.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'no date',
    now: new Date().toISOString(),
  });

  if (!tokens) {
    throw new Error(`La cuenta ${email} no está conectada.`);
  }

  if (!tokens.refresh_token) {
    throw new Error(`La cuenta ${email} no tiene refresh_token.`);
  }

  // Si expiró o no hay access_token, refrescar
  if (!tokens.access_token || (tokens.expiry_date && Date.now() >= tokens.expiry_date)) {
    console.log('⏰ Token expirado o no hay access_token, refrescando...');
    try {
      const refreshed = await this.refreshAccessToken(tokens.refresh_token);
      console.log('✅ Refrescado exitoso:', { has_access: !!refreshed.access_token });
      await this.saveTokens(email, refreshed);
      return refreshed.access_token;
    } catch (refreshError) {
      console.error('❌ Error al refrescar:', refreshError.response?.data || refreshError.message);
      throw new Error(`No se pudo refrescar el token: ${refreshError.response?.data?.error_description || refreshError.message}`);
    }
  }

  console.log('✅ Access token aún válido, se reutiliza');
  return tokens.access_token;
}
}

module.exports = new OutlookAuthService();