const CUENTA_PUBLIC_SELECT = `
    id,
    id_plataforma,
    id_proveedor,
    correo,
    contrasena,
    precio_costo,
    fecha_vencimiento,
    fecha_agregado,
    notas,
    estado,
    plataforma ( id, nombre_plat, max_puestos ),
    proveedor ( nombre_prov ),
    usuario_cuenta (
        id,
        id_usuario,
        pin,
        vencimiento_usuario,
        es_combo,
        valor_venta,
        notas,
        estado,
        fecha_venta,
        usuario ( nombre, numero_telefono )
    )
`;

const VENCIMIENTOS_SELECT = `
    id,
    id_plataforma,
    correo,
    precio_costo,
    fecha_vencimiento,
    plataforma ( id, nombre_plat ),
    proveedor ( nombre_prov ),
    usuario_cuenta (
        id,
        id_usuario,
        pin,
        vencimiento_usuario,
        es_combo,
        valor_venta,
        notas,
        estado,
        usuario ( nombre, numero_telefono )
    )
`;

module.exports = { CUENTA_PUBLIC_SELECT, VENCIMIENTOS_SELECT };
