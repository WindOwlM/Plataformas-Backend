const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Backend Supabase URL:', supabaseUrl);
console.log('Backend Supabase Key exists:', !!supabaseServiceKey);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;