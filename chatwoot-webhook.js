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

// Etiquetas disponibles para asignar aleatoriamente
const AVAILABLE_LABELS = [
  'operacion-vial',
  'pyb-accenorte-vigilancia',
  'pyb-planta',
  'pyb-recolector-canguro',
  'admin-tolis'
];

// Opciones válidas para cada lista interactiva
const VALID_RESPONSES = {
  seleccion_distancia_transporte: ['menos_15', '15_30', '30_60', 'mas_60', 'menos de 15 minutos', '15 a 30 minutos', '30 minutos a 1 hora', 'más de 1 hora'],
  seleccion_medio_transporte: ['moto', 'carro', 'publico', 'transporte público', 'bicicleta', 'pie', 'a pie']
};

// ================================
// HEALTH CHECK
// ================================
app.get('/', (_, res) => {
  res.status(200).send('OK');
});

// ================================
// FUNCIONES AUXILIARES CHATWOOT
// ================================
async function getConversationState(conversationId) {
  try {
    const res = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
      { headers: { api_access_token: API_KEY } }
    );
    return res.data.custom_attributes?.template_state || null;
  } catch {
    return null;
  }
}

async function updateConversationState(conversationId, state) {
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
    { custom_attributes: { template_state: state } },
    { headers: { api_access_token: API_KEY } }
  );
}

async function sendChatwootMessage(conversationId, content, isPrivate = false) {
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
    { content, private: isPrivate },
    { headers: { api_access_token: API_KEY } }
  );
}

async function addRandomLabelToConversation(conversationId) {
  try {
    // Seleccionar etiqueta aleatoria
    const randomLabel = AVAILABLE_LABELS[Math.floor(Math.random() * AVAILABLE_LABELS.length)];
    
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
      { labels: [randomLabel] },
      { headers: { api_access_token: API_KEY } }
    );
    
    console.log(`🏷️ Etiqueta aleatoria agregada: ${randomLabel}`);
      
  } catch (error) {
    console.error('⚠️ Error agregando etiqueta:', error.response?.data || error.message);
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
      }
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
      }
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
      }
    }
  );
}

// ================================
// VALIDACIÓN DE RESPUESTAS
// ================================
function isValidResponse(state, message) {
  // Para estados con listas interactivas, validar opciones
  if (VALID_RESPONSES[state]) {
    return VALID_RESPONSES[state].some(option => 
      message.toLowerCase().includes(option.toLowerCase())
    );
  }
  
  // Para estados de si/no
  if (['seleccion_certificado_bachiller', 'seleccion_ubicacion_desplazamiento', 
       'seleccion_familiares_empresa', 'seleccion_vinculacion_previa'].includes(state)) {
    return message === 'si' || message === 'no';
  }
  
  return false;
}

// ================================
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content, additional_attributes } = req.body;

    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: 'not incoming message' });
    }

    // Ignorar mensajes de listas interactivas (vienen con button_reply)
    if (additional_attributes?.button_reply || additional_attributes?.list_reply) {
      console.log('📱 Respuesta de lista interactiva detectada');
    }

    if (!content?.trim()) {
      return res.status(200).json({ ignored: 'empty message' });
    }

    const userMessage = content.trim().toLowerCase();
    const conversationId = conversation.id;
    const userPhone = conversation.contact_inbox.source_id;
    const currentState = await getConversationState(conversationId);

    console.log(`📍 Estado: ${currentState || 'sin estado'} | Respuesta: "${userMessage}"`);

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
          '✅ Flujo iniciado: Certificado de bachiller',
          true
        );
        
        return res.json({ ok: true, started: true });
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
        helpMessage = '⚠️ Por favor responde únicamente "si" o "no".';
      }
      
      await sendChatwootMessage(conversationId, helpMessage);
      return res.status(200).json({ ok: true, message: 'invalid response' });
    }

    // Guardar respuestas informativas
    if (currentState === 'seleccion_distancia_transporte' || currentState === 'seleccion_medio_transporte') {
      await sendChatwootMessage(
        conversationId,
        `📝 ${TEMPLATE_NAMES[currentState]}: ${content}`,
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
      await addRandomLabelToConversation(conversationId);
      return res.json({ ok: true, stopped: true });
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
      await addRandomLabelToConversation(conversationId);
      return res.json({ ok: true, stopped: true });
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
      await addRandomLabelToConversation(conversationId);
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
      await addRandomLabelToConversation(conversationId);
      res.status(500).json({ error: 'send message failed' });
    }

  } catch (error) {
    console.error('❌ ERROR GENERAL:', error.response?.data || error.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ================================
// SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
  console.log(`📋 Flujo configurado con ${Object.keys(TEMPLATE_FLOW).length} estados`);
});
