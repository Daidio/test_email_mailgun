// Importa el cliente de Mailgun
const formData = require('form-data');
const Mailgun = require('mailgun.js');

// Configuración de Mailgun
// Estas variables deben ser configuradas en tu proyecto de Vercel
// como "Environment Variables" para mantenerlas seguras.
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const TO_EMAIL_ADDRESS = process.env.TO_EMAIL_ADDRESS;
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS; // Ej: 'noreply@tu-dominio-en-mailgun.com'

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

  // Validar que las variables de entorno estén configuradas
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !TO_EMAIL_ADDRESS || !FROM_EMAIL_ADDRESS) {
    console.error('Faltan variables de entorno de Mailgun');
    return res.status(500).json({ message: 'Error de configuración en el servidor.' });
  }

  try {
    const { message } = req.body;

    // Validar que el mensaje no esté vacío
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ message: 'El contenido del mensaje no puede estar vacío.' });
    }

    // Datos del correo
    const mailData = {
      from: `Notificación Rechazo <${FROM_EMAIL_ADDRESS}>`,
      to: [TO_EMAIL_ADDRESS],
      subject: 'Nuevo Rechazo de Circularización Recibido',
      text: `Se ha recibido un nuevo rechazo con el siguiente motivo:\n\n${message}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Nuevo Rechazo de Circularización</h2>
          <p>Se ha recibido un nuevo rechazo con el siguiente motivo:</p>
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
    console.error('Error al enviar el correo:', error);
    
    // Devolver un error genérico al cliente para no exponer detalles
    return res.status(500).json({ message: 'Hubo un error al procesar tu solicitud.' });
  }
}; 