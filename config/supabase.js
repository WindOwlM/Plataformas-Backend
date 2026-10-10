const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function looksLikeServiceRole(key) {
    if (!key) return false;
    if (key.startsWith('sb_secret_')) return true;
    try {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
        return payload.role === 'service_role';
    } catch {
        return false;
    }
}

if (!looksLikeServiceRole(supabaseServiceKey)) {
    console.warn(
        'SUPABASE_SERVICE_ROLE_KEY no parece service_role. El lookup de administrador puede devolver 403 por RLS.'
    );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});

function createUserClient(accessToken) {
    return createClient(supabaseUrl, supabaseServiceKey, {
        global: {
            headers: { Authorization: `Bearer ${accessToken}` },
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}

console.log('Backend Supabase URL:', supabaseUrl);
console.log('Backend service role key:', looksLikeServiceRole(supabaseServiceKey) ? 'ok' : 'invalid/anon');

module.exports = supabase;
module.exports.createUserClient = createUserClient;
