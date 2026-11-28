const supabase = require('../config/supabase');
const { registrarPagoRenovacion, unirAvisos } = require('../lib/pagos');
const {
    actualizarEstadoCuenta,
    setCuentaInhabilitada,
    asegurarCupo,
    avisoSobrecupo,
    maxPuestosPlataforma,
    decorarCuenta,
    esCuentaInhabilitada,
    esPuestoQueOcupa,
} = require('../lib/cuentaEstado');
const { CUENTA_PUBLIC_SELECT, VENCIMIENTOS_SELECT } = require('../lib/cuentaSelect');
const { buildVencimientoItems } = require('../lib/vencimientos');

const cuentasController = {};

// CREAR CUENTA con puestos
cuentasController.crearCuenta = async (req, res) => {
    try {
        const {
            id_plataforma,
            id_proveedor,
            correo,
            contrasena,
            contrasena_plana,
            precio_costo,
            fecha_vencimiento,
            notas,
            puestos = []
        } = req.body;

        const password = contrasena || contrasena_plana;

        if (!password) {
            return res.status(400).json({ error: 'La contraseña es obligatoria.' });
        }

        const puestosValidos = puestos.filter(p => p.id_usuario);
        const maxPuestos = await maxPuestosPlataforma(supabase, id_plataforma);

        const ocupanCupo = puestosValidos.filter((p) => esPuestoQueOcupa({ ...p, estado: 'activa' })).length;
        if (ocupanCupo > maxPuestos) {
            return res.status(400).json({
                error: `Esta plataforma admite máximo ${maxPuestos} puestos.`,
            });
        }

        // 1. Crear la cuenta
        const { data: cuentaData, error: cuentaError } = await supabase
            .from('cuenta')
            .insert([{
                id_plataforma,
                id_proveedor,
                correo,
                contrasena: password,
                precio_costo,
                fecha_vencimiento: fecha_vencimiento || null,
                fecha_agregado: new Date().toISOString().split('T')[0],
                notas: notas || null,
                estado: 'disponible'
            }])
            .select();

        if (cuentaError) {
            console.error('Error creando cuenta:', cuentaError);
            throw cuentaError;
        }

        const cuenta = cuentaData[0];

        // 2. Crear los puestos en usuario_cuenta
        if (puestosValidos.length > 0) {
            const puestosParaInsertar = puestosValidos.map(p => ({
                id_usuario: p.id_usuario,
                id_cuenta: cuenta.id,
                pin: p.pin || null,
                vencimiento_usuario: p.vencimiento_usuario || null,
                es_combo: p.es_combo || false,
                valor_venta: p.valor_venta || 0,
                notas: p.notas || null,
                estado: 'activa',
                fecha_venta: new Date().toISOString()
            }));

            const { error: puestosError } = await supabase
                .from('usuario_cuenta')
                .insert(puestosParaInsertar);

            if (puestosError) {
                console.error('Error creando puestos:', puestosError);
                // Deshacer la cuenta para no dejarla creada sin sus puestos.
                await supabase.from('cuenta').delete().eq('id', cuenta.id);
                throw puestosError;
            }
        }

        const ocupacion = await actualizarEstadoCuenta(supabase, cuenta.id);
        const { contrasena: _omit, ...cuentaPublica } = cuenta;

        res.status(201).json({
            mensaje: 'Cuenta y puestos creados exitosamente',
            cuenta: {
                ...cuentaPublica,
                estado: ocupacion.estado,
                max_puestos: ocupacion.max,
                ocupados: ocupacion.ocupados,
            }
        });

    } catch (error) {
        console.error("Error al crear cuenta:", error);
        res.status(500).json({ error: error.message });
    }
};

// OBTENER CUENTAS con puestos
// Soporta filtros por:
// - estado, plataforma
// - correo (substring, case-insensitive)
// - usuario (nombre de usuario substring, case-insensitive)
// - fecha_inicio / fecha_fin -> filtra por cuenta.fecha_vencimiento
// - usuario_fecha_inicio / usuario_fecha_fin -> filtra puestos por vencimiento_usuario
cuentasController.obtenerCuentas = async (req, res) => {
    try {
        const {
            estado,
            plataforma,
            correo,
            usuario,
            id_usuario,
            fecha_inicio,
            fecha_fin,
            usuario_fecha_inicio,
            usuario_fecha_fin,
            limit
        } = req.query;

        let query = supabase
            .from('cuenta')
            .select(CUENTA_PUBLIC_SELECT);

        if (plataforma) query = query.eq('id_plataforma', plataforma);
        if (correo) query = query.ilike('correo', `%${correo}%`);
        if (fecha_inicio) query = query.gte('fecha_vencimiento', fecha_inicio);
        if (fecha_fin) query = query.lte('fecha_vencimiento', fecha_fin);

        const limite = Math.min(Number(limit) || 0, 50);
        if (limite > 0) query = query.limit(limite);

        const { data, error } = await query.order('fecha_vencimiento', { ascending: true });

        if (error) throw error;

        const cuentasFiltradas = (data || []).filter((c) => {
            if (id_usuario) {
                const usuariosCuenta = c.usuario_cuenta || [];
                const match = usuariosCuenta.some((uc) => uc.id_usuario === id_usuario);
                if (!match) return false;
            }

            if (usuario) {
                const nombreBuscado = usuario.toLowerCase();
                const usuariosCuenta = c.usuario_cuenta || [];
                const match = usuariosCuenta.some((uc) => {
                    const nombre = (uc.usuario && uc.usuario.nombre) ? uc.usuario.nombre.toLowerCase() : '';
                    return nombre.includes(nombreBuscado);
                });
                if (!match) return false;
            }

            if (usuario_fecha_inicio || usuario_fecha_fin) {
                const usuariosCuenta = c.usuario_cuenta || [];
                const anyInRange = usuariosCuenta.some((uc) => {
                    if (!uc.vencimiento_usuario) return false;
                    const v = new Date(uc.vencimiento_usuario);
                    if (usuario_fecha_inicio && new Date(usuario_fecha_inicio) > v) return false;
                    if (usuario_fecha_fin && new Date(usuario_fecha_fin) < v) return false;
                    return true;
                });
                if (!anyInRange) return false;
            }

            return true;
        }).map(decorarCuenta).filter((c) => {
            if (!estado) return true;
            return c.estado === estado;
        });

        res.status(200).json(cuentasFiltradas);
    } catch (error) {
        console.error("Error obteniendo cuentas:", error);
        res.status(500).json({ error: error.message });
    }
};

cuentasController.actualizarFechaVencimiento = async (req, res) => {
    try {
        const { fecha, tipo, id_cuenta, id_puesto, id_por_ubicar, renovaciones = [], pago, id_usuario, proveedor } = req.body;
        if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            return res.status(400).json({ error: 'La fecha es obligatoria (YYYY-MM-DD).' });
        }
        // Cuentas cuyos clientes se renovaron: un vencido que se renueva vuelve a ocupar puesto
        const cuentasRenovadas = new Set();

        if (tipo === 'por_ubicar') {
            if (!id_por_ubicar) return res.status(400).json({ error: 'Falta el registro por ubicar.' });
            const { error } = await supabase
                .from('usuario_por_ubicar')
                .update({ vencimiento_usuario: fecha })
                .eq('id', id_por_ubicar);
            if (error) throw error;
        } else if (tipo === 'cuenta') {
            if (!id_cuenta) return res.status(400).json({ error: 'Falta la cuenta.' });
            const { error } = await supabase
                .from('cuenta')
                .update({ fecha_vencimiento: fecha })
                .eq('id', id_cuenta);
            if (error) throw error;
        } else if (tipo === 'cuentas') {
            // Varias cuentas de un mismo proveedor, cada una con su fecha
            const filas = (Array.isArray(renovaciones) ? renovaciones : [])
                .filter((f) => f.id_cuenta && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha || fecha));
            if (filas.length === 0) {
                return res.status(400).json({ error: 'Elige al menos una cuenta para renovar.' });
            }
            const resultados = await Promise.all(filas.map((f) => supabase
                .from('cuenta')
                .update({ fecha_vencimiento: f.fecha || fecha })
                .eq('id', f.id_cuenta)));
            const fallo = resultados.find((r) => r.error);
            if (fallo) throw fallo.error;
        } else if (tipo === 'combo') {
            const filas = Array.isArray(renovaciones) ? renovaciones : [];
            if (filas.length === 0) {
                return res.status(400).json({ error: 'No hay puestos para renovar.' });
            }
            let actualizadas = 0;
            for (const fila of filas) {
                const fechaFila = fila.fecha || fecha;
                if (!fechaFila || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFila)) continue;
                if (fila.id_por_ubicar) {
                    const { error, data } = await supabase
                        .from('usuario_por_ubicar')
                        .update({ vencimiento_usuario: fechaFila })
                        .eq('id', fila.id_por_ubicar)
                        .select('id');
                    if (error) throw error;
                    if (data?.length) actualizadas += 1;
                    continue;
                }
                if (!fila.id_puesto || !fila.id_cuenta) continue;
                const { error, data } = await supabase
                    .from('usuario_cuenta')
                    .update({ vencimiento_usuario: fechaFila })
                    .eq('id', fila.id_puesto)
                    .eq('id_cuenta', fila.id_cuenta)
                    .select('id');
                if (error) throw error;
                if (data?.length) {
                    actualizadas += 1;
                    cuentasRenovadas.add(fila.id_cuenta);
                }
            }
            if (actualizadas === 0) {
                return res.status(400).json({ error: 'No se pudo actualizar ninguna cuenta.' });
            }
        } else {
            if (!id_cuenta || !id_puesto) {
                return res.status(400).json({ error: 'Falta el puesto o la cuenta.' });
            }
            const { error } = await supabase
                .from('usuario_cuenta')
                .update({ vencimiento_usuario: fecha })
                .eq('id', id_puesto)
                .eq('id_cuenta', id_cuenta);
            if (error) throw error;
            cuentasRenovadas.add(id_cuenta);
        }

        const esCuenta = tipo === 'cuenta' || tipo === 'cuentas';
        const avisoPago = await registrarPagoRenovacion(supabase, pago, {
            tipo: esCuenta ? 'gasto' : 'cobro',
            idUsuario: id_usuario || null,
            proveedor: proveedor || null,
        });
        const aviso = unirAvisos(await avisoSobrecupo(supabase, cuentasRenovadas), avisoPago);
        res.status(200).json({ mensaje: 'Fecha actualizada', ...(aviso ? { aviso } : {}) });
    } catch (error) {
        console.error('Error actualizando fecha de vencimiento:', error);
        res.status(500).json({ error: error.message });
    }
};

cuentasController.renovarAsignaciones = async (req, res) => {
    try {
        const { id_usuario, puestos_origen = [], lineas = [], pago } = req.body;

        if (!id_usuario) {
            return res.status(400).json({ error: 'Falta el cliente.' });
        }
        if (!Array.isArray(lineas) || lineas.length === 0) {
            return res.status(400).json({ error: 'Debes dejar al menos una plataforma.' });
        }

        for (const linea of lineas) {
            if (!linea.id_cuenta && !linea.id_por_ubicar) {
                return res.status(400).json({ error: 'Cada plataforma debe tener una cuenta con cupo.' });
            }
            if (!linea.vencimiento_usuario || !/^\d{4}-\d{2}-\d{2}$/.test(linea.vencimiento_usuario)) {
                return res.status(400).json({ error: 'Cada plataforma debe tener fecha de vencimiento.' });
            }
        }

        const { data: actuales, error: actualesError } = await supabase
            .from('usuario_cuenta')
            .select('id, id_cuenta, notas')
            .eq('id_usuario', id_usuario);
        if (actualesError) throw actualesError;

        const porId = new Map((actuales || []).map((fila) => [fila.id, fila]));

        // Se puede elegir la misma cuenta en varias líneas: revisar que haya cupo
        // para todos los puestos nuevos ANTES de guardar algo.
        const nuevosPorCuenta = new Map();
        for (const linea of lineas) {
            if (!linea.id_cuenta) continue;
            const actual = linea.id_puesto ? porId.get(linea.id_puesto) : null;
            if (actual && actual.id_cuenta === linea.id_cuenta) continue;
            nuevosPorCuenta.set(linea.id_cuenta, (nuevosPorCuenta.get(linea.id_cuenta) || 0) + 1);
        }
        for (const [idCuenta, cantidad] of nuevosPorCuenta) {
            await asegurarCupo(supabase, idCuenta, cantidad);
        }

        const origen = new Set((puestos_origen || []).filter(Boolean));
        const idsGuardar = new Set(lineas.map((linea) => linea.id_puesto).filter(Boolean));
        const esCombo = lineas.length > 1;
        const afectadas = new Set();
        const eliminados = new Set();

        // El perfil sigue existiendo en la cuenta vieja: no se borra, queda el
        // recordatorio para borrarlo del perfil (igual que Reubicar).
        async function dejarRecordatorio(idPuesto, idCuenta) {
            if (!idPuesto || eliminados.has(idPuesto)) return;
            const { error } = await supabase
                .from('usuario_cuenta')
                .update({ estado: 'cortado' })
                .eq('id', idPuesto)
                .eq('id_cuenta', idCuenta);
            if (error) throw error;
            eliminados.add(idPuesto);
            if (idCuenta) afectadas.add(idCuenta);
        }

        for (const linea of lineas) {
            const payload = {
                pin: linea.pin || null,
                vencimiento_usuario: linea.vencimiento_usuario,
                valor_venta: parseFloat(linea.valor_venta) || 0,
                es_combo: esCombo,
                estado: 'activa',
            };

            // Sigue por ubicar (sin cuenta elegida): solo se renuevan sus datos.
            if (linea.id_por_ubicar && !linea.id_cuenta) {
                const { error } = await supabase
                    .from('usuario_por_ubicar')
                    .update({
                        pin: payload.pin,
                        vencimiento_usuario: payload.vencimiento_usuario,
                        valor_venta: payload.valor_venta,
                        es_combo: esCombo,
                    })
                    .eq('id', linea.id_por_ubicar)
                    .eq('id_usuario', id_usuario);
                if (error) throw error;
                continue;
            }
            const actual = linea.id_puesto ? porId.get(linea.id_puesto) : null;

            if (actual && actual.id_cuenta === linea.id_cuenta) {
                const { error } = await supabase
                    .from('usuario_cuenta')
                    .update(payload)
                    .eq('id', linea.id_puesto)
                    .eq('id_cuenta', linea.id_cuenta);
                if (error) throw error;
                afectadas.add(linea.id_cuenta);
            } else {
                await asegurarCupo(supabase, linea.id_cuenta, 1);
                // Las notas viajan con el cliente (desde su puesto anterior o desde por ubicar)
                let notas = actual?.notas || null;
                if (!actual && linea.id_por_ubicar) {
                    const { data: pendiente } = await supabase
                        .from('usuario_por_ubicar')
                        .select('*')
                        .eq('id', linea.id_por_ubicar)
                        .maybeSingle();
                    notas = pendiente?.notas || null;
                }
                const { error } = await supabase
                    .from('usuario_cuenta')
                    .insert([{
                        id_usuario,
                        id_cuenta: linea.id_cuenta,
                        ...payload,
                        notas,
                        fecha_venta: new Date().toISOString(),
                    }]);
                if (error) throw error;
                afectadas.add(linea.id_cuenta);
                if (actual) {
                    await dejarRecordatorio(actual.id, actual.id_cuenta);
                }
                if (linea.id_por_ubicar) {
                    const { error: pendienteError } = await supabase
                        .from('usuario_por_ubicar')
                        .delete()
                        .eq('id', linea.id_por_ubicar)
                        .eq('id_usuario', id_usuario);
                    if (pendienteError) throw pendienteError;
                }
            }
        }

        for (const idPuesto of origen) {
            if (idsGuardar.has(idPuesto) || eliminados.has(idPuesto)) continue;
            const actual = porId.get(idPuesto);
            if (!actual) continue;
            await dejarRecordatorio(actual.id, actual.id_cuenta);
        }

        const avisoPago = await registrarPagoRenovacion(supabase, pago, { tipo: 'cobro', idUsuario: id_usuario });
        const aviso = unirAvisos(await avisoSobrecupo(supabase, afectadas), avisoPago);
        res.status(200).json({ mensaje: 'Renovación aplicada', ...(aviso ? { aviso } : {}) });
    } catch (error) {
        console.error('Error renovando asignaciones:', error);
        const status = error.status || 500;
        res.status(status).json({ error: error.message });
    }
};

cuentasController.obtenerVencimientos = async (req, res) => {
    try {
        const [cuentasRes, pendientesRes] = await Promise.all([
            supabase.from('cuenta').select(VENCIMIENTOS_SELECT),
            supabase.from('usuario_por_ubicar').select(`
                id,
                id_usuario,
                id_cuenta_anterior,
                id_plataforma,
                pin,
                vencimiento_usuario,
                es_combo,
                valor_venta,
                usuario ( nombre, numero_telefono ),
                plataforma ( nombre_plat ),
                cuenta:id_cuenta_anterior ( correo )
            `),
        ]);

        if (cuentasRes.error) throw cuentasRes.error;
        if (pendientesRes.error) throw pendientesRes.error;

        const { items, counts } = buildVencimientoItems(cuentasRes.data || [], pendientesRes.data || []);
        const bucket = req.query.bucket;
        const filtrados = bucket ? items.filter((i) => i.bucket === bucket) : items;

        res.status(200).json({ items: filtrados, counts });
    } catch (error) {
        console.error('Error obteniendo vencimientos:', error);
        res.status(500).json({ error: error.message });
    }
};

// ACTUALIZAR CUENTA
cuentasController.actualizarCuenta = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            correo,
            id_plataforma,
            id_proveedor,
            precio_costo,
            fecha_vencimiento,
            notas,
            contrasena,
            puestos = []
        } = req.body;

        const { data: cuentaActual, error: cuentaActualError } = await supabase
            .from('cuenta')
            .select('id, id_plataforma, estado')
            .eq('id', id)
            .maybeSingle();
        if (cuentaActualError) throw cuentaActualError;
        if (!cuentaActual) return res.status(404).json({ error: 'Cuenta no encontrada' });

        const existingPuestosResult = await supabase
            .from('usuario_cuenta')
            .select('id, estado, fecha_venta')
            .eq('id_cuenta', id);
        if (existingPuestosResult.error) throw existingPuestosResult.error;

        const existingPorId = new Map((existingPuestosResult.data || []).map((p) => [p.id, p]));

        // Un puesto sin cliente se trata como eliminado (no se guarda vacío).
        const puestosParaProcesar = (Array.isArray(puestos) ? puestos : [])
            .filter((p) => p.id_usuario)
            .map((p) => {
                const actual = p.id ? existingPorId.get(p.id) : null;
                return {
                    ...(actual ? { id: p.id } : {}),
                    id_usuario: p.id_usuario,
                    id_cuenta: id,
                    pin: p.pin || null,
                    vencimiento_usuario: p.vencimiento_usuario || null,
                    es_combo: p.es_combo || false,
                    valor_venta: p.valor_venta || 0,
                    notas: p.notas || null,
                    estado: p.estado || actual?.estado || 'activa',
                    fecha_venta: actual?.fecha_venta || p.fecha_venta || new Date().toISOString(),
                };
            });

        // Validar todo ANTES de guardar cambios.
        const maxPuestos = await maxPuestosPlataforma(
            supabase,
            id_plataforma !== undefined ? id_plataforma : cuentaActual.id_plataforma
        );
        // Clientes nuevos solo si hay cupo. Si se pasa por renovar a alguien que ya
        // estaba, se guarda y se avisa (seguramente falta cortar a otro).
        const ocupanCupo = puestosParaProcesar.filter(esPuestoQueOcupa).length;
        const nuevosQueOcupan = puestosParaProcesar.filter((p) => !p.id && esPuestoQueOcupa(p)).length;
        if (ocupanCupo > maxPuestos && nuevosQueOcupan > 0) {
            return res.status(400).json({
                error: `Esta plataforma admite máximo ${maxPuestos} puestos activos.`,
            });
        }

        const puestosConId = puestosParaProcesar.filter(p => p.id);
        const puestosSinId = puestosParaProcesar.filter(p => !p.id);

        if (puestosSinId.length > 0 && esCuentaInhabilitada(cuentaActual.estado)) {
            return res.status(400).json({
                error: 'Esta cuenta está inhabilitada. Habilítala antes de agregar clientes.',
            });
        }

        let actualizaciones = {};

        if (correo !== undefined) actualizaciones.correo = correo;
        if (id_plataforma !== undefined) actualizaciones.id_plataforma = id_plataforma;
        if (id_proveedor !== undefined) actualizaciones.id_proveedor = id_proveedor;
        if (precio_costo !== undefined) actualizaciones.precio_costo = precio_costo;
        if (fecha_vencimiento !== undefined) actualizaciones.fecha_vencimiento = fecha_vencimiento || null;
        if (notas !== undefined) actualizaciones.notas = notas;
        if (contrasena) actualizaciones.contrasena = contrasena;

        const { data, error } = await supabase
            .from('cuenta')
            .update(actualizaciones)
            .eq('id', id)
            .select();

        if (error) throw error;
        if (data.length === 0) return res.status(404).json({ error: 'Cuenta no encontrada' });

        const cuenta = data[0];
        const receivedIds = new Set(puestosConId.map((p) => p.id));
        const idsParaEliminar = [...existingPorId.keys()].filter((pid) => !receivedIds.has(pid));

        if (idsParaEliminar.length > 0) {
            const { error: errorEliminarPuestos } = await supabase
                .from('usuario_cuenta')
                .delete()
                .in('id', idsParaEliminar);

            if (errorEliminarPuestos) throw errorEliminarPuestos;
        }

        if (puestosConId.length > 0) {
            for (const puesto of puestosConId) {
                const { id, ...resto } = puesto;
                const { error: errorActualizarPuesto } = await supabase
                    .from('usuario_cuenta')
                    .update(resto)
                    .eq('id', id);

                if (errorActualizarPuesto) throw errorActualizarPuesto;
            }
        }

        if (puestosSinId.length > 0) {
            const { error: errorInsertarPuestos } = await supabase
                .from('usuario_cuenta')
                .insert(puestosSinId);

            if (errorInsertarPuestos) throw errorInsertarPuestos;
        }

        const aviso = await avisoSobrecupo(supabase, [cuenta.id]);

        const { data: cuentaActualizada, error: errorCuentaActualizada } = await supabase
            .from('cuenta')
            .select(CUENTA_PUBLIC_SELECT)
            .eq('id', cuenta.id)
            .single();

        if (errorCuentaActualizada) throw errorCuentaActualizada;

        res.status(200).json({
            mensaje: 'Cuenta actualizada',
            cuenta: decorarCuenta(cuentaActualizada),
            ...(aviso ? { aviso } : {}),
        });
    } catch (error) {
        console.error("Error actualizando cuenta:", error);
        res.status(500).json({ error: error.message });
    }
};

cuentasController.cambiarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const inhabilitada = req.body?.inhabilitada === true
            || req.body?.estado === 'inhabilitada';

        const { data: actual, error: actualError } = await supabase
            .from('cuenta')
            .select('id')
            .eq('id', id)
            .single();
        if (actualError || !actual) {
            return res.status(404).json({ error: 'Cuenta no encontrada' });
        }

        await setCuentaInhabilitada(supabase, id, inhabilitada);

        const { data, error } = await supabase
            .from('cuenta')
            .select(CUENTA_PUBLIC_SELECT)
            .eq('id', id)
            .single();
        if (error) throw error;

        res.status(200).json({
            mensaje: inhabilitada ? 'Cuenta inhabilitada' : 'Cuenta habilitada',
            cuenta: decorarCuenta(data),
        });
    } catch (error) {
        console.error('Error cambiando estado de cuenta:', error);
        res.status(500).json({ error: error.message });
    }
};

// ELIMINAR CUENTA
cuentasController.eliminarCuenta = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: puestos, error: puestosError } = await supabase
            .from('usuario_cuenta')
            .select('id, estado')
            .eq('id_cuenta', id);
        if (puestosError) throw puestosError;
        if (puestos?.length) {
            const recordatorios = puestos.filter((p) => String(p.estado || '').toLowerCase() === 'cortado').length;
            const clientes = puestos.length - recordatorios;
            const partes = [];
            if (clientes) partes.push(`${clientes} ${clientes === 1 ? 'cliente' : 'clientes'}`);
            if (recordatorios) partes.push(`${recordatorios} ${recordatorios === 1 ? 'recordatorio' : 'recordatorios'} para borrar`);
            return res.status(400).json({
                error: `No se puede eliminar: la cuenta todavía tiene ${partes.join(' y ')}. `
                    + 'Reubícalos, pásalos a por ubicar o bórralos de la cuenta primero.',
            });
        }

        const { error } = await supabase
            .from('cuenta')
            .delete()
            .eq('id', id);

        if (error) {
            // Clientes por ubicar que venían de esta cuenta
            if (/foreign key|23503/i.test(`${error.code} ${error.message}`)) {
                return res.status(400).json({
                    error: 'No se puede eliminar: hay clientes en "Por ubicar" que venían de esta cuenta. Ubícalos o bórralos de Por ubicar primero.',
                });
            }
            throw error;
        }

        res.status(200).json({ mensaje: 'Cuenta eliminada' });
    } catch (error) {
        console.error("Error eliminando cuenta:", error);
        res.status(500).json({ error: error.message });
    }
};

// OBTENER CONTRASEÑA (texto plano directo, sin descifrado)
cuentasController.obtenerContrasena = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('cuenta')
            .select('id, contrasena')
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Cuenta no encontrada' });

        res.status(200).json({ contrasena: data.contrasena });
    } catch (error) {
        console.error('Error obteniendo contraseña:', error);
        res.status(500).json({ error: error.message });
    }
};

const puestoSelect = `
    id,
    id_usuario,
    id_cuenta,
    pin,
    vencimiento_usuario,
    es_combo,
    valor_venta,
    notas,
    estado,
    fecha_venta,
    usuario ( nombre, numero_telefono )
`;

cuentasController.crearPuesto = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            id_usuario,
            pin,
            vencimiento_usuario,
            es_combo = false,
            valor_venta = 0,
            notas,
        } = req.body;

        if (!id_usuario) {
            return res.status(400).json({ error: 'Debes seleccionar un cliente ya creado.' });
        }

        const { data: cuenta, error: cuentaError } = await supabase
            .from('cuenta')
            .select('id')
            .eq('id', id)
            .single();

        if (cuentaError || !cuenta) {
            return res.status(404).json({ error: 'Cuenta no encontrada' });
        }

        await asegurarCupo(supabase, id, 1);

        const { data: puesto, error } = await supabase
            .from('usuario_cuenta')
            .insert([{
                id_usuario,
                id_cuenta: id,
                pin: pin || null,
                vencimiento_usuario: vencimiento_usuario || null,
                es_combo: !!es_combo,
                valor_venta: parseFloat(valor_venta) || 0,
                notas: notas || null,
                estado: 'activa',
                fecha_venta: new Date().toISOString(),
            }])
            .select(puestoSelect)
            .single();

        if (error) throw error;

        await actualizarEstadoCuenta(supabase, id);

        res.status(201).json({ mensaje: 'Puesto asignado', puesto });
    } catch (error) {
        console.error('Error creando puesto:', error);
        const status = error.status || 500;
        res.status(status).json({ error: error.message });
    }
};

cuentasController.actualizarPuesto = async (req, res) => {
    try {
        const { id, puestoId } = req.params;
        const {
            id_usuario,
            pin,
            vencimiento_usuario,
            es_combo,
            valor_venta,
            notas,
            estado,
        } = req.body;

        const actualizaciones = {};
        if (id_usuario !== undefined) actualizaciones.id_usuario = id_usuario;
        if (pin !== undefined) actualizaciones.pin = pin || null;
        if (vencimiento_usuario !== undefined) actualizaciones.vencimiento_usuario = vencimiento_usuario || null;
        if (es_combo !== undefined) actualizaciones.es_combo = !!es_combo;
        if (valor_venta !== undefined) actualizaciones.valor_venta = parseFloat(valor_venta) || 0;
        if (notas !== undefined) actualizaciones.notas = notas || null;
        if (estado !== undefined) actualizaciones.estado = estado;

        // Deshacer recordatorio: vuelve a ocupar puesto, así que revisamos el cupo
        if (estado !== undefined && String(estado).toLowerCase() !== 'cortado') {
            const { data: previo } = await supabase
                .from('usuario_cuenta')
                .select('id, estado, vencimiento_usuario')
                .eq('id', puestoId)
                .eq('id_cuenta', id)
                .maybeSingle();
            if (previo && String(previo.estado || '').toLowerCase() === 'cortado') {
                const vuelveAOcupar = esPuestoQueOcupa({ ...previo, ...actualizaciones });
                if (vuelveAOcupar) await asegurarCupo(supabase, id, 1);
            }
        }

        const { data: puesto, error } = await supabase
            .from('usuario_cuenta')
            .update(actualizaciones)
            .eq('id', puestoId)
            .eq('id_cuenta', id)
            .select(puestoSelect)
            .maybeSingle();

        if (error) throw error;
        if (!puesto) return res.status(404).json({ error: 'Puesto no encontrado' });

        const aviso = await avisoSobrecupo(supabase, [id]);
        res.status(200).json({ mensaje: 'Puesto actualizado', puesto, ...(aviso ? { aviso } : {}) });
    } catch (error) {
        console.error('Error actualizando puesto:', error);
        res.status(error.status || 500).json({ error: error.message });
    }
};

cuentasController.eliminarPuesto = async (req, res) => {
    try {
        const { id, puestoId } = req.params;

        const { data: puesto, error: puestoError } = await supabase
            .from('usuario_cuenta')
            .select('id, estado')
            .eq('id', puestoId)
            .eq('id_cuenta', id)
            .single();

        if (puestoError || !puesto) {
            return res.status(404).json({ error: 'Puesto no encontrado' });
        }

        const yaCortado = String(puesto.estado || '').toLowerCase() === 'cortado';
        if (!yaCortado) {
            const { error } = await supabase
                .from('usuario_cuenta')
                .update({ estado: 'cortado' })
                .eq('id', puestoId)
                .eq('id_cuenta', id);
            if (error) throw error;
            await actualizarEstadoCuenta(supabase, id);
            return res.status(200).json({ mensaje: 'Quedó como recordatorio para borrar del perfil' });
        }

        const { error } = await supabase
            .from('usuario_cuenta')
            .delete()
            .eq('id', puestoId)
            .eq('id_cuenta', id);

        if (error) throw error;

        await actualizarEstadoCuenta(supabase, id);

        res.status(200).json({ mensaje: 'Puesto eliminado' });
    } catch (error) {
        console.error('Error eliminando puesto:', error);
        res.status(500).json({ error: error.message });
    }
};

cuentasController.reubicarPuesto = async (req, res) => {
    try {
        const { id, puestoId } = req.params;
        const { id_cuenta, borrar_origen } = req.body;

        if (!id_cuenta) {
            return res.status(400).json({ error: 'Debes elegir la cuenta destino.' });
        }
        if (id_cuenta === id) {
            return res.status(400).json({ error: 'Elige una cuenta distinta a la actual.' });
        }

        const { data: puesto, error: puestoError } = await supabase
            .from('usuario_cuenta')
            .select('id, id_cuenta, id_usuario, pin, vencimiento_usuario, es_combo, valor_venta, notas, estado, fecha_venta')
            .eq('id', puestoId)
            .eq('id_cuenta', id)
            .single();

        if (puestoError || !puesto) {
            return res.status(404).json({ error: 'El cliente no está en esta cuenta.' });
        }
        if (String(puesto.estado || '').toLowerCase() === 'cortado') {
            return res.status(400).json({ error: 'Este registro es solo un recordatorio. Bórralo de esta cuenta.' });
        }

        const { data: origen, error: origenError } = await supabase
            .from('cuenta')
            .select('id, id_plataforma')
            .eq('id', id)
            .single();
        if (origenError || !origen) {
            return res.status(404).json({ error: 'Cuenta de origen no encontrada.' });
        }

        const { data: destino, error: destinoError } = await supabase
            .from('cuenta')
            .select('id, id_plataforma, correo')
            .eq('id', id_cuenta)
            .single();
        if (destinoError || !destino) {
            return res.status(404).json({ error: 'Cuenta destino no encontrada.' });
        }
        if (destino.id_plataforma !== origen.id_plataforma) {
            return res.status(400).json({ error: 'Solo puedes reubicar a una cuenta de la misma plataforma.' });
        }

        await asegurarCupo(supabase, id_cuenta, 1);

        const { error: insertError } = await supabase
            .from('usuario_cuenta')
            .insert([{
                id_usuario: puesto.id_usuario,
                id_cuenta,
                pin: puesto.pin || null,
                vencimiento_usuario: puesto.vencimiento_usuario || null,
                es_combo: !!puesto.es_combo,
                valor_venta: parseFloat(puesto.valor_venta) || 0,
                notas: puesto.notas || null,
                estado: 'activa',
                fecha_venta: (borrar_origen && puesto.fecha_venta) || new Date().toISOString(),
            }]);
        if (insertError) throw insertError;

        // borrar_origen: se quita de la cuenta vieja; si no, queda como recordatorio
        const { error: updateError } = borrar_origen
            ? await supabase
                .from('usuario_cuenta')
                .delete()
                .eq('id', puestoId)
                .eq('id_cuenta', id)
            : await supabase
                .from('usuario_cuenta')
                .update({ estado: 'cortado' })
                .eq('id', puestoId)
                .eq('id_cuenta', id);

        if (updateError) throw updateError;

        await actualizarEstadoCuenta(supabase, id);
        await actualizarEstadoCuenta(supabase, id_cuenta);

        res.status(200).json({ mensaje: 'Cliente reubicado', correo: destino.correo });
    } catch (error) {
        console.error('Error reubicando puesto:', error);
        const status = error.status || 500;
        res.status(status).json({ error: error.message });
    }
};

module.exports = cuentasController;