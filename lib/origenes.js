// Orígenes del frontend que pueden llamar al backend (CORS y regreso tras conectar un correo)
const origenesPermitidos = [
    'http://localhost:5173',
    'https://plataformas-frontend.vercel.app',
];

function origenPermitido(origin) {
    if (!origin) return true;
    if (origenesPermitidos.includes(origin)) return true;
    try {
        const { hostname } = new URL(origin);
        return hostname.endsWith('.vercel.app');
    } catch {
        return false;
    }
}

module.exports = { origenesPermitidos, origenPermitido };
