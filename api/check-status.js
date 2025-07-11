const jwt = require('jsonwebtoken');
const { createClient } = require('@libsql/client');

// Variables de entorno
const JWT_SECRET = process.env.JWT_SECRET;
const TURSO_DB_URL = process.env.TURSO_DB_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

// Configuración de la base de datos
const db = createClient({
  url: TURSO_DB_URL,
  authToken: TURSO_AUTH_TOKEN,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  // Validar configuración de variables de entorno
  if (!JWT_SECRET || !TURSO_DB_URL || !TURSO_AUTH_TOKEN) {
    console.error('Faltan variables de entorno críticas (JWT o Turso).');
    return res.status(500).json({ message: 'Error de configuración en el servidor.' });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado.' });
    }

    // 1. Verificar y decodificar el token JWT
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      console.error('Error de verificación de JWT:', error.message);
      return res.status(401).json({ message: 'Token inválido o expirado.' });
    }

    // 2. Extraer información del token
    const userEmail = decodedToken.email;
    const userId = decodedToken.userId; // Puede ser null si no se incluyó en el token
    
    if (!userEmail) {
      return res.status(400).json({ message: 'Token inválido: falta información del usuario.' });
    }

    // 3. Consultar el estado en la base de datos
    // Buscamos por email y campaña específica (jun-2025)
    const query = `
      SELECT id, cliente_id, cliente_email, estado, fecha_respuesta, motivo_rechazo
      FROM circularizacion 
      WHERE cliente_email = ? AND campana_id = ?
      LIMIT 1
    `;
    
    const result = await db.execute({
      sql: query,
      args: [userEmail, 'jun-2025']
    });

    // 4. Analizar el resultado
    if (result.rows.length === 0) {
      // No existe registro para este usuario en esta campaña
      return res.status(404).json({ 
        message: 'No se encontró una circularización para este usuario en la campaña actual.' 
      });
    }

    const record = result.rows[0];
    const estado = record.estado;

    // 5. Determinar la respuesta según el estado
    if (estado === 'enviado') {
      // Usuario puede responder
      return res.status(200).json({
        canRespond: true,
        status: 'pending',
        message: 'El usuario puede responder a la circularización.'
      });
    } else if (estado === 'aceptado' || estado === 'rechazado') {
      // Usuario ya respondió
      return res.status(200).json({
        canRespond: false,
        status: 'completed',
        estado: estado,
        fecha_respuesta: record.fecha_respuesta,
        motivo_rechazo: record.motivo_rechazo,
        message: `El usuario ya ${estado} la circularización.`
      });
    } else {
      // Estado desconocido
      return res.status(500).json({
        message: 'Estado de circularización no reconocido.'
      });
    }

  } catch (error) {
    console.error('Error en check-status:', error);
    return res.status(500).json({ 
      message: 'Error interno del servidor al verificar el estado.' 
    });
  }
}; 