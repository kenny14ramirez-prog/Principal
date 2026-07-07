/**
 * CrozzoClienteRUT.js
 * Módulo para consulta y validación de RUT/NIT de empresas
 * 
 * Funcionalidades:
 * - Validación de formato NIT
 * - Consulta de datos empresariales via backend
 * - Detección de tipo de documento (empresa vs persona natural)
 */

// Configuración del endpoint backend
const BACKEND_CONFIG = {
    baseUrl: window.location.origin,
    endpoints: {
        consultarRUT: '/api/consultar-rut'
    },
    timeout: 10000 // 10 segundos
};

/**
 * Valida el formato de un NIT colombiano
 * @param {string} nit - Número de identificación tributaria
 * @returns {boolean} - true si el formato es válido
 */
function validarNIT(nit) {
    try {
        if (!nit || typeof nit !== 'string') {
            return false;
        }

        // Limpiar espacios y guiones
        const nitLimpio = nit.replace(/[\s-]/g, '');
        
        // Verificar que solo contenga números
        if (!/^\d+$/.test(nitLimpio)) {
            return false;
        }

        // Verificar longitud mínima (10 dígitos para empresas)
        if (nitLimpio.length < 10) {
            return false;
        }

        // Verificar longitud máxima (15 dígitos)
        if (nitLimpio.length > 15) {
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error validando NIT:', error);
        return false;
    }
}

/**
 * Detecta si un documento es de empresa o persona natural
 * @param {string} documento - Número de documento
 * @returns {string} - 'empresa' | 'persona_natural'
 */
function esEmpresa(documento) {
    try {
        if (!documento || typeof documento !== 'string') {
            return 'persona_natural';
        }

        const docLimpio = documento.replace(/[\s-]/g, '');
        
        // Si tiene 10 o más dígitos, probablemente es NIT de empresa
        if (docLimpio.length >= 10 && /^\d+$/.test(docLimpio)) {
            return 'empresa';
        }

        // Si tiene menos de 10 dígitos, probablemente es cédula
        return 'persona_natural';
    } catch (error) {
        console.error('Error detectando tipo de documento:', error);
        return 'persona_natural';
    }
}

/**
 * Consulta información de una empresa por su NIT
 * @param {string} nit - Número de identificación tributaria
 * @returns {Promise<Object>} - Datos de la empresa o error
 */
async function consultarRUT(nit) {
    try {
        // Validar formato antes de hacer la consulta
        if (!validarNIT(nit)) {
            throw new Error('Formato de NIT inválido');
        }

        const nitLimpio = nit.replace(/[\s-]/g, '');
        
        // Configurar la petición
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BACKEND_CONFIG.timeout);

        const response = await fetch(`${BACKEND_CONFIG.baseUrl}${BACKEND_CONFIG.endpoints.consultarRUT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ nit: nitLimpio }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();

        // Validar estructura de respuesta
        if (!data || typeof data !== 'object') {
            throw new Error('Respuesta inválida del servidor');
        }

        // Retornar datos estructurados
        return {
            success: true,
            data: {
                nit: nitLimpio,
                razon_social: data.razon_social || '',
                direccion: data.direccion || '',
                telefono: data.telefono || '',
                email: data.email || '',
                actividad: data.actividad || '',
                estado: data.estado || 'ACTIVO',
                fecha_consulta: new Date().toISOString()
            }
        };

    } catch (error) {
        console.error('Error consultando RUT:', error);
        
        // Manejar diferentes tipos de error
        let errorMessage = 'Error desconocido';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Tiempo de espera agotado';
        } else if (error.message.includes('fetch')) {
            errorMessage = 'Error de conexión con el servidor';
        } else if (error.message.includes('HTTP')) {
            errorMessage = 'Error del servidor';
        } else {
            errorMessage = error.message;
        }

        return {
            success: false,
            error: errorMessage,
            timestamp: new Date().toISOString()
        };
    }
}

// Exportar funciones para uso global
if (typeof window !== 'undefined') {
    window.CrozzoClienteRUT = {
        consultarRUT,
        validarNIT,
        esEmpresa
    };
}

// Exportar para módulos ES6 si es necesario
export { consultarRUT, validarNIT, esEmpresa };