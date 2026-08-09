const supabase = require('../config/supabase');

class TokenStorageService {
  /**
   * Guarda o actualiza tokens en Supabase.
   */
  async saveTokens(email, tokens) {
    const { data, error } = await supabase
      .from('gmail_accounts')
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
    return data;
  }

  /**
   * Carga tokens de Supabase por email.
   */
  async loadTokens(email) {
    const { data, error } = await supabase
      .from('gmail_accounts')
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

  /**
   * Lista todas las cuentas conectadas.
   */
  async listConnectedAccounts() {
    const { data, error } = await supabase
      .from('gmail_accounts')
      .select('email, created_at');

    if (error) throw error;
    return data.map(d => d.email);
  }

  /**
   * Elimina una cuenta (desconectar).
   */
  async deleteTokens(email) {
    const { error } = await supabase
      .from('gmail_accounts')
      .delete()
      .eq('email', email);

    if (error) throw error;
    return true;
  }
}

module.exports = new TokenStorageService();