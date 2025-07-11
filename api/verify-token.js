const jwt = require('jsonwebtoken');

// La misma clave secreta que usarás para GENERAR los tokens.
// Debe ser configurada como una variable de entorno en Vercel.
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  if (!JWT_SECRET) {
    console.error('La variable de entorno JWT_SECRET no está configurada.');
    return res.status(500).json({ message: 'Error de configuración en el servidor.' });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'No se ha proporcionado un token.' });
  }

  try {
    // jwt.verify se encarga de todo:
    // 1. Comprueba que el token fue firmado con la misma clave secreta (autenticidad).
    // 2. Comprueba si el token ha expirado (si se configuró una expiración).
    // 3. Lanza un error si algo falla.
    const decoded = jwt.verify(token, JWT_SECRET);

    // Opcional: Podrías añadir validaciones extra aquí,
    // por ejemplo, comprobar que el `aud` (audience) o `iss` (issuer) del token son los correctos.
    
    // Si la verificación es exitosa, devolvemos los datos decodificados.
    // El frontend no necesita los datos, pero es útil para depurar.
    res.status(200).json({ success: true, data: decoded });

  } catch (error) {
    // Los errores más comunes son TokenExpiredError y JsonWebTokenError.
    console.error('Error de verificación de JWT:', error.name, error.message);
    return res.status(401).json({ message: 'El enlace ha expirado o no es válido.' });
  }
}; 