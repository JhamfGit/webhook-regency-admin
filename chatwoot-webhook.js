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
  'SUMAPAZ': 'op-vial',
  'GICA OP VIAL': 'op-vial',
  'RUTA AL SUR OP VIAL': 'op-vial',
  'VINUS OP VIAL': 'op-vial',

  'ACCENORTE': 'pyb-accenorte-iccu-vigilancia',
  'FRIGORINUS VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'MINEROS LA MARIA VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'GICA (VIGILANCIA)': 'pyb-accenorte-iccu-vigilancia',
  'VINUS VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'RUTAS DEL VALLE - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',

  'CONSORCIO PEAJES 2526 - PLANTA': 'planta-temporal-canguro',
  'GICA PLANTA': 'pyb-planta',

  'ADMINISTRACION': 'admin-tolis',
  'TOLIS': 'admin-tolis'
};

// ================================
// FLUJO
// ================================
const TEMPLATE_FLOW = {
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

const VALID_RESPONSES = {
  seleccion_distancia_transporte: ['menos_15', '15_30', '30_60', 'mas_60'],
  seleccion_medio_transporte: ['moto', 'carro', 'publico', 'bicicleta', 'pie']
};

// ================================
// CACHE SIMPLE
// ================================
const conversationCache = new Map();
const CACHE_TTL = 60000;

const getCachedData = key => {
  const c = conversationCache.get(key);
  return c && Date.now() - c.timestamp < CACHE_TTL ? c.data : null;
};

const setCachedData = (key, data) => {
  conversationCache.set(key, { data, timestamp: Date.now() });
};

// ================================
// CHATWOOT HELPERS
// ================================
async function getConversation(conversationId) {
  const cacheKey = `conv_${conversationId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const res = await axios.get(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
    { headers: { api_access_token: API_KEY } }
  );

  setCachedData(cacheKey, res.data);
  return res.data;
}

async function updateConversationAttributes(conversationId, attrs) {
  conversationCache.delete(`conv_${conversationId}`);
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
    { custom_attributes: attrs },
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

async function assignLabelByProject(conversationId, proyecto) {
  const team = PROJECT_TO_TEAM[proyecto?.toUpperCase()];
  if (!team) return;

  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
    { labels: [team] },
    { headers: { api_access_token: API_KEY } }
  );
}

// ================================
// WHATSAPP HELPERS
// ================================
const sendTemplate = (to, name) =>
  axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name, language: { code: 'es_CO' } }
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_API_TOKEN}` } }
  );

// ================================
// WEBHOOK
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content, additional_attributes } = req.body;
    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.json({ ignored: true });
    }

    const conversationId = conversation.id;
    const phone = conversation.contact_inbox?.source_id;
    if (!phone) return res.json({ ignored: true });

    const conv = await getConversation(conversationId);

    const proyecto =
      conv.custom_attributes?.proyecto?.trim() || null;

    const state =
      conv.custom_attributes?.template_state || null;

    console.log(`📍 Estado: ${state || 'sin estado'} | Proyecto: ${proyecto || 'NO DEFINIDO'}`);

    // 🔐 Bloqueo de estados finales
    if (['completado', 'rechazado', 'cancelado', 'error'].includes(state)) {
      return res.json({ ignored: 'finished' });
    }

    // 🚀 Inicio automático
    if (!state) {
      await updateConversationAttributes(conversationId, {
        ...conv.custom_attributes,
        template_state: 'seleccion_certificado_bachiller'
      });

      await sendTemplate(phone, 'seleccion_certificado_bachiller');
      return res.json({ started: true });
    }

    const userMessage =
      additional_attributes?.list_reply?.id ||
      content?.trim().toLowerCase();

    if (!userMessage) return res.json({ ignored: true });

    // ❌ Corte por familiares
    if (state === 'seleccion_familiares_empresa' && userMessage === 'si') {
      await updateConversationAttributes(conversationId, {
        ...conv.custom_attributes,
        template_state: 'rechazado'
      });

      if (proyecto) await assignLabelByProject(conversationId, proyecto);
      return res.json({ stopped: true });
    }

    const nextStep = TEMPLATE_FLOW[state];

    if (nextStep === 'fin') {
      await updateConversationAttributes(conversationId, {
        ...conv.custom_attributes,
        template_state: 'completado'
      });

      if (proyecto) await assignLabelByProject(conversationId, proyecto);
      return res.json({ completed: true });
    }

    await updateConversationAttributes(conversationId, {
      ...conv.custom_attributes,
      template_state: nextStep
    });

    await sendTemplate(phone, nextStep);
    res.json({ nextStep });

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    res.status(500).json({ error: true });
  }
});

// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on ${PORT}`);
});
