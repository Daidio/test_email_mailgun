const formData = require('form-data');
const Mailgun = require('mailgun.js');
const jwt = require('jsonwebtoken');
const { createClient } = require('@libsql/client');

// Variables de entorno
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const TO_EMAIL_ADDRESS = process.env.TO_EMAIL_ADDRESS;
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS;
const JWT_SECRET = process.env.JWT_SECRET;
const TURSO_DB_URL = process.env.TURSO_DB_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

// Inicializa el cliente de Mailgun
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

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
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !TO_EMAIL_ADDRESS || !FROM_EMAIL_ADDRESS || !JWT_SECRET || !TURSO_DB_URL || !TURSO_AUTH_TOKEN) {
    console.error('Faltan variables de entorno críticas.');
    return res.status(500).json({ message: 'Error de configuración en el servidor.' });
  }

  try {
    const { token } = req.body;

    // 1. Verificar el token ANTES de hacer nada más
    if (!token) {
      return res.status(401).json({ message: 'Acceso no autorizado. Token no proporcionado.' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      console.error('Error de verificación de JWT en accept-confirmation:', error.message);
      return res.status(401).json({ message: 'El token es inválido o ha expirado.' });
    }

    // El token es válido. Extraemos el email del usuario.
    const userEmail = decodedToken.email;
    if (!userEmail) {
        console.error("El token verificado no contiene la propiedad 'email'.");
        return res.status(400).json({ message: 'Token inválido: falta información del usuario.' });
    }

    // 2. DOBLE VERIFICACIÓN: Consultar la base de datos para asegurarse de que no haya respondido ya
    const checkQuery = `
      SELECT id, estado, fecha_respuesta 
      FROM circularizacion 
      WHERE cliente_email = ? AND campana_id = ?
      LIMIT 1
    `;
    
    const checkResult = await db.execute({
      sql: checkQuery,
      args: [userEmail, 'jun-2025']
    });

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        message: 'No se encontró una circularización para este usuario en la campaña actual.' 
      });
    }

    const record = checkResult.rows[0];
    
    // Verificar si ya respondió
    if (record.estado !== 'enviado') {
      return res.status(409).json({ 
        message: 'Esta circularización ya ha sido respondida anteriormente.' 
      });
    }

    // 3. ACTUALIZAR EL ESTADO EN LA BASE DE DATOS (Operación atómica)
    const updateQuery = `
      UPDATE circularizacion 
      SET estado = 'aceptado', 
          fecha_respuesta = datetime('now')
      WHERE cliente_email = ? AND campana_id = ? AND estado = 'enviado'
    `;
    
    const updateResult = await db.execute({
      sql: updateQuery,
      args: [userEmail, 'jun-2025']
    });

    // Verificar que la actualización fue exitosa
    if (updateResult.rowsAffected === 0) {
      return res.status(409).json({ 
        message: 'No se pudo actualizar el estado. Es posible que ya haya sido respondida.' 
      });
    }

    // 4. ENVIAR EL CORREO DE NOTIFICACIÓN
    const mailData = {
      from: `Notificación Confirmación <${FROM_EMAIL_ADDRESS}>`,
      to: [TO_EMAIL_ADDRESS],
      subject: `Nueva Confirmación de Circularización - ${userEmail}`,
      text: `El usuario ${userEmail} ha ACEPTADO la circularización.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Nueva Confirmación de Circularización</h2>
          <p>El usuario <strong>${userEmail}</strong> ha <strong style="color: #27ae60;">ACEPTADO</strong> la circularización.</p>
          <div style="background: #e8f5e8; border-left: 10px solid #27ae60; margin: 1.5em 10px; padding: 0.5em 10px;">
            <p><strong>Estado:</strong> Confirmado</p>
            <p><strong>Acción requerida:</strong> Ninguna. La circularización ha sido aceptada.</p>
          </div>
          <hr>
          <p style="color: #888;">
            <strong>Campaña:</strong> jun-2025<br>
            <strong>Fecha de confirmación:</strong> ${new Date().toLocaleString('es-ES')}
          </p>
          <p style="color: #888;">Este es un mensaje automático enviado desde la página de confirmación de Patrimore.</p>
        </div>
      `,
    };

    // Enviar el correo usando Mailgun
    await mg.messages.create(MAILGUN_DOMAIN, mailData);

    // 5. REGISTRO DE AUDITORÍA (Opcional: log del evento)
    console.log(`Confirmación procesada exitosamente para ${userEmail} en campaña jun-2025`);

    // Enviar respuesta de éxito
    return res.status(200).json({ 
      message: 'Confirmación registrada y correo enviado correctamente.' 
    });

  } catch (error) {
    console.error('Error al procesar la confirmación:', error);
    return res.status(500).json({ message: 'Hubo un error al procesar tu solicitud.' });
  }
}; 