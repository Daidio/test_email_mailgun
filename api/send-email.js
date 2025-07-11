// Importa el cliente de Mailgun
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const jwt = require('jsonwebtoken');

// Configuración de Mailgun
// Estas variables deben ser configuradas en tu proyecto de Vercel
// como "Environment Variables" para mantenerlas seguras.
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const TO_EMAIL_ADDRESS = process.env.TO_EMAIL_ADDRESS;
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS; // Ej: 'noreply@tu-dominio-en-mailgun.com'
const JWT_SECRET = process.env.JWT_SECRET; // La misma clave secreta


// Inicializa el cliente de Mailgun
const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

// El handler de la función serverless
module.exports = async (req, res) => {
  // Solo permitir peticiones POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  // Validar configuración de variables de entorno
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !TO_EMAIL_ADDRESS || !FROM_EMAIL_ADDRESS || !JWT_SECRET) {
    console.error('Faltan variables de entorno críticas (Mailgun o JWT).');
    return res.status(500).json({ message: 'Error de configuración en el servidor.' });
  }

  try {
    const { message, token } = req.body;

    // 1. Verificar el token ANTES de hacer nada más
    if (!token) {
      return res.status(401).json({ message: 'Acceso no autorizado. Token no proporcionado.' });
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      console.error('Error de verificación de JWT en send-email:', error.message);
      return res.status(401).json({ message: 'El token es inválido o ha expirado.' });
    }

    // El token es válido. Extraemos el email del usuario.
    // Asumimos que el email está en la propiedad 'email' del payload del token.
    const userEmail = decodedToken.email;
    if (!userEmail) {
        console.error("El token verificado no contiene la propiedad 'email'.");
        return res.status(400).json({ message: 'Token inválido: falta información del usuario.' });
    }

    // Validar que el mensaje no esté vacío
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ message: 'El contenido del mensaje no puede estar vacío.' });
    }

    // Datos del correo, ahora incluyendo el email del usuario
    const mailData = {
      from: `Notificación Rechazo <${FROM_EMAIL_ADDRESS}>`,
      to: [TO_EMAIL_ADDRESS],
      subject: `Nuevo Rechazo de Circularización de: ${userEmail}`,
      text: `El usuario ${userEmail} ha enviado un rechazo con el siguiente motivo:\n\n${message}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Nuevo Rechazo de Circularización</h2>
          <p>El usuario <strong>${userEmail}</strong> ha enviado un rechazo con el siguiente motivo:</p>
          <blockquote style="background: #f9f9f9; border-left: 10px solid #ccc; margin: 1.5em 10px; padding: 0.5em 10px;">
            <p style="white-space: pre-wrap;">${message}</p>
          </blockquote>
          <p>Por favor, revisa esta información y ponte en contacto con el usuario si es necesario.</p>
          <hr>
          <p style="color: #888;">Este es un mensaje automático enviado desde la página de rechazo de Patrimore.</p>
        </div>
      `,
    };

    // Enviar el correo usando Mailgun
    await mg.messages.create(MAILGUN_DOMAIN, mailData);

    // Enviar respuesta de éxito
    return res.status(200).json({ message: 'Correo enviado correctamente.' });

  } catch (error) {
    console.error('Error al procesar la solicitud de envío de correo:', error);
    return res.status(500).json({ message: 'Hubo un error al procesar tu solicitud.' });
  }
}; 