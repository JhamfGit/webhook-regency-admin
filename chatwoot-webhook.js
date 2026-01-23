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
const CHATWOOT_API_URL = process.env.CHATWOOT_URL; // URL de Chatwoot
const CHATWOOT_API_TOKEN = process.env.API_KEY; // API Key de Chatwoot
const CHATWOOT_ACCOUNT_ID = process.env.ACCOUNT_ID; // Account ID de Chatwoot

// ================================
// MAPEO DE TEMPLATES
// ================================
const TEMPLATE_CONFIG = {
  // Templates simples (solo nombre)
  'seleccion_certificado_bachiller': {
    type: 'simple',
    name: 'seleccion_certificado_bachiller',
    chatwootMessage: '📤 Template enviado: Selección de certificado de bachiller'
  },
  'seleccion_ubicacion_desplazamiento': {
    type: 'simple',
    name: 'seleccion_ubicacion_desplazamiento',
    chatwootMessage: '📤 Template enviado: Selección de ubicación y desplazamiento'
  },
  'seleccion_familiares_empresa': {
    type: 'simple',
    name: 'seleccion_familiares_empresa',
    chatwootMessage: '📤 Template enviado: Selección de familiares en la empresa'
  },
  'seleccion_vinculacion_previa': {
    type: 'simple',
    name: 'seleccion_vinculacion_previa',
    chatwootMessage: '📤 Template enviado: Selección de vinculación previa'
  },
  'confirmacion_1': {
    type: 'simple',
    name: 'confirmacion_1',
    chatwootMessage: '📤 Template enviado: Confirmación 1'
  },
  
  // Templates con listas interactivas
  'seleccion_distancia_transporte': {
    type: 'list',
    name: 'seleccion_distancia_transporte',
    chatwootMessage: '📤 Template enviado: Selección de distancia al trabajo (lista interactiva)'
  },
  'seleccion_medio_transporte': {
    type: 'list',
    name: 'seleccion_medio_transporte',
    chatwootMessage: '📤 Template enviado: Selección de medio de transporte (lista interactiva)'
  }
};

// ================================
// HEALTH CHECK
// ================================
app.get('/', (_, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'WhatsApp Template Sender',
    templates: Object.keys(TEMPLATE_CONFIG),
    chatwoot_configured: !!(CHATWOOT_API_URL && CHATWOOT_API_TOKEN)
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
// FUNCIÓN: BUSCAR CONVERSACIÓN EN CHATWOOT
// ================================
async function findChatwootConversation(phone) {
  try {
    if (!CHATWOOT_API_URL || !CHATWOOT_API_TOKEN || !CHATWOOT_ACCOUNT_ID) {
      console.log('⚠️  Chatwoot no configurado:');
      console.log('   CHATWOOT_URL:', CHATWOOT_API_URL ? '✓' : '✗');
      console.log('   API_KEY:', CHATWOOT_API_TOKEN ? '✓' : '✗');
      console.log('   ACCOUNT_ID:', CHATWOOT_ACCOUNT_ID ? '✓' : '✗');
      return null;
    }

    console.log('🔍 Buscando conversación en Chatwoot...');
    console.log('   URL:', CHATWOOT_API_URL);
    console.log('   Account ID:', CHATWOOT_ACCOUNT_ID);
    
    const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '').replace(/-/g, '');
    
    // Buscar contacto por número de teléfono
    console.log('   🔎 Buscando contacto con teléfono:', cleanPhone);
    const searchResponse = await axios.get(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/search`,
      {
        params: { q: cleanPhone },
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    console.log('   📊 Respuesta de búsqueda:', JSON.stringify(searchResponse.data, null, 2));

    if (!searchResponse.data.payload || searchResponse.data.payload.length === 0) {
      console.log('ℹ️  No se encontró contacto en Chatwoot para:', cleanPhone);
      return null;
    }

    const contact = searchResponse.data.payload[0];
    console.log(`✅ Contacto encontrado en Chatwoot - ID: ${contact.id}, Nombre: ${contact.name}`);

    // Buscar conversaciones del contacto
    console.log('   🔎 Buscando conversaciones del contacto...');
    const conversationsResponse = await axios.get(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/${contact.id}/conversations`,
      {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    console.log('   📊 Conversaciones encontradas:', conversationsResponse.data.payload?.length || 0);

    // Buscar la conversación más reciente que esté abierta
    const conversations = conversationsResponse.data.payload || [];
    const openConversation = conversations.find(conv => conv.status === 'open');
    
    if (openConversation) {
      console.log(`✅ Conversación abierta encontrada - ID: ${openConversation.id}`);
      return openConversation.id;
    }

    // Si no hay conversación abierta, usar la más reciente
    if (conversations.length > 0) {
      const latestConversation = conversations[0];
      console.log(`✅ Usando conversación más reciente - ID: ${latestConversation.id}`);
      return latestConversation.id;
    }

    console.log('ℹ️  No se encontraron conversaciones para este contacto');
    return null;

  } catch (error) {
    console.error('❌ Error buscando conversación en Chatwoot:');
    console.error('   Mensaje:', error.message);
    console.error('   Status:', error.response?.status);
    console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
    return null;
  }
}

// ================================
// FUNCIÓN: ENVIAR NOTA PRIVADA A CHATWOOT
// ================================
async function sendChatwootPrivateNote(conversationId, message) {
  try {
    if (!CHATWOOT_API_URL || !CHATWOOT_API_TOKEN || !CHATWOOT_ACCOUNT_ID) {
      console.log('⚠️  Chatwoot no configurado, saltando envío de nota privada');
      return false;
    }

    if (!conversationId) {
      console.log('⚠️  No hay ID de conversación, no se puede enviar nota privada');
      return false;
    }

    console.log('📝 Enviando nota privada a conversación:', conversationId);
    console.log('   Mensaje:', message);

    const response = await axios.post(
      `${CHATWOOT_API_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: message,
        message_type: 'outgoing',
        private: true
      },
      {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );

    console.log('✅ Nota privada enviada a Chatwoot - ID:', response.data.id);
    return true;

  } catch (error) {
    console.error('❌ Error enviando nota privada a Chatwoot:');
    console.error('   Mensaje:', error.message);
    console.error('   Status:', error.response?.status);
    console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
    return false;
  }
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

    // Enviar nota privada a Chatwoot (no bloqueante)
    console.log('🔄 Procesando notificación a Chatwoot...');
    const conversationId = await findChatwootConversation(cleanPhone);
    
    if (conversationId) {
      const chatwootMessage = templateConfig.chatwootMessage || `📤 Template enviado: ${template}`;
      const timestamp = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
      const fullMessage = `${chatwootMessage}\n⏰ ${timestamp}\n📱 Teléfono: +${cleanPhone}`;
      
      const notificationSent = await sendChatwootPrivateNote(conversationId, fullMessage);
      console.log('📬 Notificación Chatwoot:', notificationSent ? 'Enviada ✅' : 'Fallida ❌');
    } else {
      console.log('⚠️  No se encontró conversación en Chatwoot para notificar');
    }

    res.json({ 
      success: true,
      template: template,
      phone: cleanPhone,
      message_id: response.data.messages?.[0]?.id,
      timestamp: new Date().toISOString(),
      chatwoot_notified: !!conversationId
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
    description: config.type === 'list' ? 'Lista interactiva' : 'Template simple',
    chatwoot_message: config.chatwootMessage
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
  console.log(`💬 Chatwoot: ${CHATWOOT_API_URL ? 'Configurado ✅' : 'No configurado ⚠️'}`);
  console.log(`🔗 Endpoints:`);
  console.log(`   POST /send-template - Enviar template`);
  console.log(`   GET  /templates     - Listar templates`);
  console.log(`   GET  /              - Health check`);
});
