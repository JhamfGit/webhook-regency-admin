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
// FLUJO
// ================================
const TEMPLATE_FLOW = {
  inicio: 'seleccion_certificado_bachiller',
  seleccion_certificado_bachiller: 'seleccion_ubicacion_desplazamiento',
  seleccion_ubicacion_desplazamiento: 'seleccion_familiares_empresa',
  seleccion_familiares_empresa: 'seleccion_distancia_transporte',
  seleccion_distancia_transporte: 'seleccion_vinculacion_previa',
  seleccion_vinculacion_previa: 'fin'
};

const TEMPLATE_NAMES = {
  seleccion_certificado_bachiller: 'Certificado de bachiller',
  seleccion_ubicacion_desplazamiento: 'Ubicación y desplazamiento',
  seleccion_familiares_empresa: 'Familiares en la empresa',
  seleccion_distancia_transporte: 'Distancia al trabajo',
  seleccion_vinculacion_previa: 'Vinculación previa'
};

// ================================
// HEALTH CHECK
// ================================
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// ================================
// FUNCIONES AUXILIARES
// ================================
async function getConversationState(conversationId) {
  try {
    const res = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
      { headers: { api_access_token: API_KEY } }
    );
    return res.data.custom_attributes?.template_state || 'inicio';
  } catch {
    return 'inicio';
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
// WHATSAPP - LISTA INTERACTIVA
// ================================
async function sendWhatsAppList(userPhone) {
  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: userPhone,
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: "Distancia al trabajo"
        },
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
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content } = req.body;

    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: true });
    }

    if (!content?.trim()) {
      return res.status(200).json({ ignored: 'empty' });
    }

    const userMessage = content.trim().toLowerCase();
    const conversationId = conversation.id;
    const userPhone = conversation.contact_inbox.source_id;
    const currentState = await getConversationState(conversationId);

    console.log(`📍 Estado: ${currentState} | Respuesta: ${userMessage}`);

    // ============================
    // VALIDACIÓN SI / NO
    // ============================
    if (userMessage === 'si' && currentState === 'seleccion_familiares_empresa') {
      await sendChatwootMessage(
        conversationId,
        '❌ Debido a que tienes familiares en la empresa, no es posible continuar con el proceso.'
      );
      await updateConversationState(conversationId, 'inicio');
      return res.status(200).json({ ok: true });
    }

    if (userMessage === 'no' &&
        currentState !== 'seleccion_familiares_empresa' &&
        currentState !== 'seleccion_distancia_transporte' &&
        currentState !== 'seleccion_vinculacion_previa') {

      await sendChatwootMessage(
        conversationId,
        '❌ Proceso de selección cancelado. Gracias por tu tiempo.'
      );
      await updateConversationState(conversationId, 'inicio');
      return res.status(200).json({ ok: true });
    }

    // ============================
    // AVANZAR FLUJO
    // ============================
    const nextStep = TEMPLATE_FLOW[currentState];

    if (nextStep === 'fin') {
      await sendChatwootMessage(
        conversationId,
        '✅ Proceso de selección completado. Gracias por tu tiempo.'
      );
      await updateConversationState(conversationId, 'inicio');
      return res.status(200).json({ ok: true });
    }

    // 👉 DISTANCIA = LISTA
    if (nextStep === 'seleccion_distancia_transporte') {
      await sendWhatsAppList(userPhone);
    } else {
      await sendWhatsAppTemplate(userPhone, nextStep);
    }

    await updateConversationState(conversationId, nextStep);
    await sendChatwootMessage(
      conversationId,
      `📋 Mensaje enviado: ${TEMPLATE_NAMES[nextStep] || nextStep}`,
      true
    );

    res.status(200).json({ ok: true });

  } catch (error) {
    console.error('❌ ERROR:', error.response?.data || error.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ================================
// SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on ${PORT}`);
});
