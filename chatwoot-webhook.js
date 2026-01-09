// ================================
// CÓDIGO 2: WEBHOOK (Express.js)
// ================================

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ================================
// VARIABLES DE ENTORNO
// ================================
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// ================================
// MAPEO DE TEMPLATES
// ================================
const TEMPLATE_CONFIG = {
  // Templates simples (solo nombre)
  'seleccion_certificado_bachiller': {
    type: 'simple',
    name: 'seleccion_certificado_bachiller'
  },
  'seleccion_ubicacion_desplazamiento': {
    type: 'simple',
    name: 'seleccion_ubicacion_desplazamiento'
  },
  'seleccion_familiares_empresa': {
    type: 'simple',
    name: 'seleccion_familiares_empresa'
  },
  'seleccion_vinculacion_previa': {
    type: 'simple',
    name: 'seleccion_vinculacion_previa'
  },
  'confirmacion_respuesta': {
    type: 'simple',
    name: 'confirmacion_respuesta'
  },
  
  // Templates con listas interactivas
  'seleccion_distancia_transporte': {
    type: 'list',
    name: 'seleccion_distancia_transporte'
  },
  'seleccion_medio_transporte': {
    type: 'list',
    name: 'seleccion_medio_transporte'
  }
};

// ================================
// HEALTH CHECK
// ================================
app.get('/', (_, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'WhatsApp Template Sender',
    templates: Object.keys(TEMPLATE_CONFIG)
  });
});

// ================================
// FUNCIÓN: ENVIAR TEMPLATE SIMPLE
// ================================
async function sendSimpleTemplate(phone, templateName, params = []) {
  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: "es_CO" }
    }
  };

  // Si hay parámetros, agregarlos
  if (params.length > 0) {
    payload.template.components = [
      {
        type: "body",
        parameters: params.map(text => ({
          type: "text",
          text: String(text)
        }))
      }
    ];
  }

  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );
}

// ================================
// FUNCIÓN: ENVIAR LISTA DISTANCIA
// ================================
async function sendDistanciaList(phone) {
  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Distancia al trabajo" },
        body: {
          text: "¿Cuál es el tiempo aproximado de traslado entre su residencia y el lugar de trabajo?"
        },
        action: {
          button: "Ver opciones",
          sections: [
            {
              title: "Opciones",
              rows: [
                { id: "menos_15", title: "Menos de 15 minutos" },
                { id: "15_30", title: "15 a 30 minutos" },
                { id: "30_60", title: "30 minutos a 1 hora" },
                { id: "mas_60", title: "Más de 1 hora" }
              ]
            }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );
}

// ================================
// FUNCIÓN: ENVIAR LISTA MEDIO TRANSPORTE
// ================================
async function sendTransporteList(phone) {
  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Medio de transporte" },
        body: {
          text: "¿Qué medio de transporte utiliza para desplazarse al lugar de trabajo?"
        },
        action: {
          button: "Ver opciones",
          sections: [
            {
              title: "Opciones",
              rows: [
                { id: "moto", title: "Moto" },
                { id: "carro", title: "Carro" },
                { id: "publico", title: "Transporte público" },
                { id: "bicicleta", title: "Bicicleta" },
                { id: "pie", title: "A pie" }
              ]
            }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );
}

// ================================
// ENDPOINT PRINCIPAL: ENVIAR TEMPLATE
// ================================
app.post('/send-template', async (req, res) => {
  try {
    const { phone, template, params } = req.body;

    // Validaciones básicas
    if (!phone) {
      return res.status(400).json({ 
        error: 'phone is required',
        example: { phone: '573001234567', template: 'seleccion_certificado_bachiller' }
      });
    }

    if (!template) {
      return res.status(400).json({ 
        error: 'template is required',
        available_templates: Object.keys(TEMPLATE_CONFIG)
      });
    }

    // Verificar que el template existe
    const templateConfig = TEMPLATE_CONFIG[template];
    if (!templateConfig) {
      return res.status(404).json({ 
        error: `Template '${template}' not found`,
        available_templates: Object.keys(TEMPLATE_CONFIG)
      });
    }

    // Limpiar número de teléfono
    const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '').replace(/-/g, '');

    console.log(`📤 Enviando template: ${template}`);
    console.log(`📱 Teléfono: ${cleanPhone}`);
    if (params) {
      console.log(`📝 Parámetros:`, params);
    }

    // Enviar según el tipo
    let response;
    
    if (templateConfig.type === 'list') {
      // Listas interactivas
      if (template === 'seleccion_distancia_transporte') {
        response = await sendDistanciaList(cleanPhone);
      } else if (template === 'seleccion_medio_transporte') {
        response = await sendTransporteList(cleanPhone);
      }
    } else {
      // Templates simples
      response = await sendSimpleTemplate(cleanPhone, templateConfig.name, params || []);
    }

    console.log(`✅ Template enviado exitosamente`);
    console.log(`📊 Response ID: ${response.data.messages?.[0]?.id || 'N/A'}`);

    res.json({ 
      success: true,
      template: template,
      phone: cleanPhone,
      message_id: response.data.messages?.[0]?.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error enviando template:', error.response?.data || error.message);
    
    const errorDetail = error.response?.data?.error || {};
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to send template',
      details: {
        message: errorDetail.message || error.message,
        code: errorDetail.code,
        type: errorDetail.type,
        fbtrace_id: errorDetail.fbtrace_id
      }
    });
  }
});

// ================================
// ENDPOINT: LISTAR TEMPLATES DISPONIBLES
// ================================
app.get('/templates', (req, res) => {
  const templates = Object.entries(TEMPLATE_CONFIG).map(([key, config]) => ({
    name: key,
    type: config.type,
    description: config.type === 'list' ? 'Lista interactiva' : 'Template simple'
  }));

  res.json({
    total: templates.length,
    templates: templates
  });
});

// ================================
// SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp Template Sender running on port ${PORT}`);
  console.log(`📋 Templates disponibles: ${Object.keys(TEMPLATE_CONFIG).length}`);
  console.log(`🔗 Endpoints:`);
  console.log(`   POST /send-template - Enviar template`);
  console.log(`   GET  /templates     - Listar templates`);
  console.log(`   GET  /              - Health check`);
});
