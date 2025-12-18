const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ================================
// VARIABLES DE ENTORNO
// ================================
const CHATWOOT_URL = process.env.CHATWOOT_URL;
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// ================================
// MAPEO DE PROYECTOS A EQUIPOS
// ================================
const PROJECT_TO_TEAM = {
  // Admin-tolis
  'SUMAPAZ': 'admin-tolis',
  'GICA OP VIAL': 'admin-tolis',
  'RUTA AL SUR OP VIAL': 'admin-tolis',
  'VINUS OP VIAL': 'admin-tolis',
  
  // Operación vial
  'ACCENORTE': 'operacion-vial',
  'FRIGORINUS VIGILANCIA': 'operacion-vial',
  'MINEROS LA MARIA VIGILANCIA': 'operacion-vial',
  'APP GICA (VIGILANCIA)': 'operacion-vial',
  'DS EL FARO 118 VIGILANCIA': 'operacion-vial',
  'VINUS - VIGILANCIA': 'operacion-vial',
  'RUTA AL SUR - VIGILANCIA': 'operacion-vial',
  'RUTAS DEL VALLE - VIGILANCIA': 'operacion-vial',
  'ACCENORTE - VIGILANCIA': 'operacion-vial',
  'CONSORCIO PEAJES 2526 - VIGILANCIA': 'operacion-vial',
  
  // PyB Accenorte Vigilancia
  'CONSORCIO PEAJES 2526 - PLANTA': 'pyb-accenorte-vigilancia',
  'RUTA AL SUR - RECOLECTOR TEMPORADA': 'pyb-accenorte-vigilancia',
  'RUTAS DEL VALLE - RECOLECTOR TEMPORADA': 'pyb-accenorte-vigilancia',
  'GICA - RECOLECTOR TEMPORADA': 'pyb-accenorte-vigilancia',
  'CONSORCIO PEAJES 2526 - CANGUROS': 'pyb-accenorte-vigilancia',
  
  // PyB Planta
  'RUTA AL SUR PLANTA': 'pyb-planta',
  'RUTAS DEL VALLE PLANTA': 'pyb-planta',
  'RUTAS DEL VALLE': 'pyb-planta',
  'GICA PLANTA': 'pyb-planta',
  'VINUS PLANTA': 'pyb-planta',
  
  // PyB Recolector Canguro
  'ADMINISTRACION': 'pyb-recolector-canguro',
  'TOLIS': 'pyb-recolector-canguro'
};

// ================================
// FLUJO DE ESTADOS
// ================================
const TEMPLATE_FLOW = {
  inicio: 'seleccion_certificado_bachiller',
  seleccion_certificado_bachiller: 'seleccion_ubicacion_desplazamiento',
  seleccion_ubicacion_desplazamiento: 'seleccion_familiares_empresa',
  seleccion_familiares_empresa: 'seleccion_distancia_transporte',
  seleccion_distancia_transporte: 'seleccion_medio_transporte',
  seleccion_medio_transporte: 'seleccion_vinculacion_previa',
  seleccion_vinculacion_previa: 'fin'
};

const TEMPLATE_NAMES = {
  seleccion_certificado_bachiller: 'Certificado de bachiller',
  seleccion_ubicacion_desplazamiento: 'Ubicación y desplazamiento',
  seleccion_familiares_empresa: 'Familiares en la empresa',
  seleccion_distancia_transporte: 'Distancia al trabajo',
  seleccion_medio_transporte: 'Medio de transporte',
  seleccion_vinculacion_previa: 'Vinculación previa'
};

// Opciones válidas para cada lista interactiva
const VALID_RESPONSES = {
  seleccion_distancia_transporte: ['menos_15', '15_30', '30_60', 'mas_60', 'menos de 15 minutos', '15 a 30 minutos', '30 minutos a 1 hora', 'más de 1 hora'],
  seleccion_medio_transporte: ['moto', 'carro', 'publico', 'transporte público', 'bicicleta', 'pie', 'a pie']
};

// ================================
// CACHE SIMPLE PARA REDUCIR LLAMADAS
// ================================
const conversationCache = new Map();
const CACHE_TTL = 60000; // 1 minuto

function getCachedData(key) {
  const cached = conversationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  conversationCache.set(key, { data, timestamp: Date.now() });
}

// ================================
// HEALTH CHECK
// ================================
app.get('/', (_, res) => {
  res.status(200).send('OK');
});

// ================================
// FUNCIONES AUXILIARES CHATWOOT
// ================================
async function getConversationAttributes(conversationId) {
  const cacheKey = `attrs_${conversationId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
      { 
        headers: { api_access_token: API_KEY },
        timeout: 5000
      }
    );
    const attrs = res.data.custom_attributes || {};
    setCachedData(cacheKey, attrs);
    return attrs;
  } catch (error) {
    console.error('❌ Error obteniendo atributos:', error.message);
    return {};
  }
}

async function getConversationState(conversationId) {
  const attrs = await getConversationAttributes(conversationId);
  return attrs.template_state || null;
}

async function getConversationProject(conversationId) {
  const attrs = await getConversationAttributes(conversationId);
  return attrs.proyecto || null;
}

async function updateConversationAttributes(conversationId, attributes) {
  const cacheKey = `attrs_${conversationId}`;
  conversationCache.delete(cacheKey); // Invalidar cache
  
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
    { custom_attributes: attributes },
    { 
      headers: { api_access_token: API_KEY },
      timeout: 5000
    }
  );
}

async function updateConversationState(conversationId, state) {
  const currentAttrs = await getConversationAttributes(conversationId);
  await updateConversationAttributes(conversationId, {
    ...currentAttrs,
    template_state: state
  });
}

async function sendChatwootMessage(conversationId, content, isPrivate = false) {
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
    { content, private: isPrivate },
    { 
      headers: { api_access_token: API_KEY },
      timeout: 5000
    }
  );
}

async function assignLabelByProject(conversationId, proyecto) {
  try {
    const normalizedProject = proyecto.trim().toUpperCase();
    const team = PROJECT_TO_TEAM[normalizedProject];
    
    if (!team) {
      console.log(`⚠️ Proyecto "${proyecto}" no encontrado en el mapeo`);
      await sendChatwootMessage(
        conversationId,
        `⚠️ Proyecto "${proyecto}" no mapeado a ningún equipo`,
        true
      );
      return null;
    }
    
    // Asignar la etiqueta
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
      { labels: [team] },
      { 
        headers: { api_access_token: API_KEY },
        timeout: 5000
      }
    );
    
    console.log(`🎯 Proyecto "${proyecto}" → Equipo: ${team}`);
    
    await sendChatwootMessage(
      conversationId,
      `✅ Etiqueta asignada: ${team} (Proyecto: ${proyecto})`,
      true
    );
    
    return team;
      
  } catch (error) {
    console.error('⚠️ Error asignando etiqueta por proyecto:', error.response?.data || error.message);
    return null;
  }
}

// ================================
// WHATSAPP - TEMPLATE NORMAL
// ================================
async function sendWhatsAppTemplate(userPhone, templateName) {
  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: userPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es_CO" }
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
// WHATSAPP - LISTA DISTANCIA
// ================================
async function sendWhatsAppDistancia(userPhone) {
  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: userPhone,
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
// WHATSAPP - LISTA MEDIO TRANSPORTE
// ================================
async function sendWhatsAppMedioTransporte(userPhone) {
  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: userPhone,
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
// VALIDACIÓN DE RESPUESTAS
// ================================
function isValidResponse(state, message) {
  if (VALID_RESPONSES[state]) {
    return VALID_RESPONSES[state].some(option => 
      message.toLowerCase().includes(option.toLowerCase())
    );
  }
  
  if (['seleccion_certificado_bachiller', 'seleccion_ubicacion_desplazamiento', 
       'seleccion_familiares_empresa', 'seleccion_vinculacion_previa'].includes(state)) {
    return message === 'si' || message === 'no';
  }
  
  return false;
}

// ================================
// EXTRACTOR DE RESPUESTA DE LISTA
// ================================
function extractListResponse(additionalAttributes) {
  if (additionalAttributes?.list_reply) {
    return additionalAttributes.list_reply.id || null;
  }
  if (additionalAttributes?.button_reply) {
    return additionalAttributes.button_reply.id || null;
  }
  return null;
}

// ================================
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content, additional_attributes } = req.body;

    // Solo procesar mensajes entrantes
    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: 'not incoming message' });
    }

    const conversationId = conversation.id;
    const userPhone = conversation.contact_inbox?.source_id;
    
    if (!userPhone) {
      console.log('⚠️ No se encontró source_id (número de teléfono)');
      return res.status(200).json({ ignored: 'no phone number' });
    }

    // Extraer respuesta de lista interactiva si existe
    const listResponse = extractListResponse(additional_attributes);
    let userMessage = '';

    if (listResponse) {
      console.log('📱 Respuesta de lista interactiva:', listResponse);
      userMessage = listResponse;
    } else if (content?.trim()) {
      userMessage = content.trim().toLowerCase();
    } else {
      return res.status(200).json({ ignored: 'empty message' });
    }

    const currentState = await getConversationState(conversationId);
    const proyecto = await getConversationProject(conversationId);
    // ============================
    // BLOQUEAR CONVERSACIONES FINALIZADAS
    // ============================
    if (['completado', 'rechazado', 'cancelado', 'error'].includes(currentState)) {
      console.log(`🛑 Conversación en estado final (${currentState}). No se responde.`);
      return res.status(200).json({ ignored: 'conversation finished' });
    }


    console.log(`📍 Estado: ${currentState || 'sin estado'} | Respuesta: "${userMessage}"`);
    console.log(`📋 Proyecto almacenado: ${proyecto || 'no definido'}`);

    // ============================
    // INICIAR FLUJO AUTOMÁTICAMENTE
    // ============================
    if (!currentState) {
      console.log('🚀 Iniciando flujo automáticamente...');
      
      try {
        await sendWhatsAppTemplate(userPhone, 'seleccion_certificado_bachiller');
        await updateConversationState(conversationId, 'seleccion_certificado_bachiller');
        
        await sendChatwootMessage(
          conversationId,
          `✅ Flujo iniciado: Certificado de bachiller\n📋 Proyecto: ${proyecto || 'No definido'}`,
          true
        );
        
        return res.json({ ok: true, started: true, proyecto });
      } catch (error) {
        console.error('❌ Error iniciando flujo:', error.message);
        return res.status(500).json({ error: 'failed to start flow' });
      }
    }

    // ============================
    // VALIDAR RESPUESTA SEGÚN ESTADO
    // ============================
    if (!isValidResponse(currentState, userMessage)) {
      console.log(`⚠️ Respuesta inválida para estado: ${currentState}`);
      
      let helpMessage = '';
      if (VALID_RESPONSES[currentState]) {
        helpMessage = '⚠️ Por favor selecciona una opción del menú usando el botón "Ver opciones".';
      } else {
        helpMessage = '⚠️ Espere mientras un asesor lo atiende';
      }
      
      await sendChatwootMessage(conversationId, helpMessage);
      return res.status(200).json({ ok: true, message: 'invalid response' });
    }

    // Guardar respuestas informativas
    if (currentState === 'seleccion_distancia_transporte' || currentState === 'seleccion_medio_transporte') {
      const displayValue = VALID_RESPONSES[currentState].find(opt => 
        opt.toLowerCase() === userMessage.toLowerCase()
      ) || userMessage;
      
      await sendChatwootMessage(
        conversationId,
        `📝 ${TEMPLATE_NAMES[currentState]}: ${displayValue}`,
        true
      );
    }

    // ============================
    // LÓGICA DE DECISIÓN
    // ============================

    // ❌ Corte por familiares
    if (userMessage === 'si' && currentState === 'seleccion_familiares_empresa') {
      await sendChatwootMessage(
        conversationId,
        '❌ Debido a que tienes familiares en la empresa, no es posible continuar con el proceso.'
      );
      await updateConversationState(conversationId, 'rechazado');
      
      if (proyecto) {
        await assignLabelByProject(conversationId, proyecto);
      }
      
      return res.json({ ok: true, stopped: true, reason: 'familiares' });
    }

    // ❌ Cancelación general
    if (
      userMessage === 'no' &&
      !['seleccion_familiares_empresa', 'seleccion_distancia_transporte', 
        'seleccion_medio_transporte', 'seleccion_vinculacion_previa'].includes(currentState)
    ) {
      await sendChatwootMessage(
        conversationId,
        '❌ Proceso de selección cancelado. Gracias por tu tiempo.'
      );
      await updateConversationState(conversationId, 'cancelado');
      
      if (proyecto) {
        await assignLabelByProject(conversationId, proyecto);
      }
      
      return res.json({ ok: true, stopped: true, reason: 'usuario_cancelo' });
    }

    // ============================
    // AVANZAR FLUJO
    // ============================
    const nextStep = TEMPLATE_FLOW[currentState];

    if (nextStep === 'fin') {
      await sendChatwootMessage(
        conversationId,
        'Confirmamos que has superado esta fase inicial. Tu candidatura sigue activa y pasará a la siguiente etapa del proceso de selección.'
      );
      await updateConversationState(conversationId, 'completado');
      
      if (proyecto) {
        await assignLabelByProject(conversationId, proyecto);
      } else {
        console.log('⚠️ No hay proyecto definido, no se asignó etiqueta');
      }
      
      return res.json({ ok: true, completed: true });
    }

    // Enviar siguiente mensaje
    try {
      if (nextStep === 'seleccion_distancia_transporte') {
        await sendWhatsAppDistancia(userPhone);
      } else if (nextStep === 'seleccion_medio_transporte') {
        await sendWhatsAppMedioTransporte(userPhone);
      } else {
        await sendWhatsAppTemplate(userPhone, nextStep);
      }

      await updateConversationState(conversationId, nextStep);

      await sendChatwootMessage(
        conversationId,
        `✅ Mensaje enviado: ${TEMPLATE_NAMES[nextStep]}`,
        true
      );

      res.json({ ok: true, nextStep });

    } catch (error) {
      console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
      
      await sendChatwootMessage(
        conversationId,
        '❌ Ocurrió un error técnico. Por favor contacta al equipo de soporte.',
        false
      );
      
      await updateConversationState(conversationId, 'error');
      
      if (proyecto) {
        await assignLabelByProject(conversationId, proyecto);
      }
      
      res.status(500).json({ error: 'send message failed' });
    }

  } catch (error) {
    console.error('❌ ERROR GENERAL:', error.response?.data || error.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ================================
// ENDPOINT PARA INICIAR FLUJO MANUALMENTE
// ================================
app.post('/start-flow', async (req, res) => {
  try {
    const { phone, proyecto } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }

    // Buscar conversación activa por teléfono
    const conversations = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations`,
      { 
        headers: { api_access_token: API_KEY },
        params: { status: 'open' }
      }
    );

    const conversation = conversations.data.find(
      c => c.contact_inbox?.source_id === phone
    );

    if (!conversation) {
      return res.status(404).json({ error: 'conversation not found' });
    }

    const conversationId = conversation.id;

    // Actualizar proyecto si se proporciona
    if (proyecto) {
      await updateConversationAttributes(conversationId, { proyecto });
    }

    // Iniciar flujo
    await sendWhatsAppTemplate(phone, 'seleccion_certificado_bachiller');
    await updateConversationState(conversationId, 'seleccion_certificado_bachiller');
    
    await sendChatwootMessage(
      conversationId,
      `✅ Flujo iniciado manualmente\n📋 Proyecto: ${proyecto || 'No especificado'}`,
      true
    );

    res.json({ ok: true, conversationId, proyecto });

  } catch (error) {
    console.error('❌ Error en start-flow:', error.message);
    res.status(500).json({ error: 'failed to start flow' });
  }
});

// ================================
// LIMPIEZA DE CACHE PERIÓDICA
// ================================
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of conversationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      conversationCache.delete(key);
    }
  }
}, 60000); // Cada minuto

// ================================
// SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
  console.log(`📋 Flujo configurado con ${Object.keys(TEMPLATE_FLOW).length} estados`);
  console.log(`🏷️ Proyectos mapeados: ${Object.keys(PROJECT_TO_TEAM).length}`);
});
