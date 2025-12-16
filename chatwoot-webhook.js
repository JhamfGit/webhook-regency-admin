const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ================================
// VARIABLES DE ENTORNO (Railway)
// ================================
const CHATWOOT_URL = process.env.CHATWOOT_URL;
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// ================================
// FLUJO DE PLANTILLAS
// ================================
const TEMPLATE_FLOW = {
  inicio: 'seleccion_certificado_bachiller',
  seleccion_certificado_bachiller: 'seleccion_ubicacion_desplazamiento',
  seleccion_ubicacion_desplazamiento: 'seleccion_familiares_empresa',
  seleccion_familiares_empresa: 'seleccion_vinculacion_previa',
  seleccion_vinculacion_previa: 'fin'
};

const TEMPLATE_NAMES = {
  seleccion_certificado_bachiller: 'certificado de bachiller',
  seleccion_ubicacion_desplazamiento: 'ubicación y desplazamiento',
  seleccion_familiares_empresa: 'familiares en la empresa',
  seleccion_vinculacion_previa: 'vinculación previa'
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
    const response = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
      {
        headers: { api_access_token: API_KEY }
      }
    );
    return response.data.custom_attributes?.template_state || 'inicio';
  } catch {
    return 'inicio';
  }
}

async function updateConversationState(conversationId, newState) {
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
    { custom_attributes: { template_state: newState } },
    {
      headers: {
        api_access_token: API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
}

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
        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

// ================================
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content, additional_attributes } = req.body;

    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: true });
    }

    if (additional_attributes?.template_params) {
      return res.status(200).json({ ignored: 'template' });
    }

    if (!content?.trim()) {
      return res.status(200).json({ ignored: 'empty' });
    }

    const conversationId = conversation.id;
    const userMessage = content.trim().toLowerCase();
    const userPhone = conversation.contact_inbox.source_id;
    const currentState = await getConversationState(conversationId);

    // ================================
    // RESPUESTA "SI"
    // ================================
    if (userMessage === 'si') {

      // ❌ familiares en empresa → TERMINA
      if (currentState === 'seleccion_familiares_empresa') {
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content: 'Gracias por tu respuesta. Debido a que tienes familiares en la empresa, no es posible continuar con el proceso.'
          },
          { headers: { api_access_token: API_KEY } }
        );

        await updateConversationState(conversationId, 'inicio');
        return res.status(200).json({ ok: true });
      }

      // ✅ flujo normal
      const nextTemplate = TEMPLATE_FLOW[currentState];

      if (nextTemplate === 'fin') {
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content: '✅ Proceso de selección completado. Gracias por tu tiempo.'
          },
          { headers: { api_access_token: API_KEY } }
        );
        await updateConversationState(conversationId, 'inicio');
        return res.status(200).json({ ok: true });
      }

      await sendWhatsAppTemplate(userPhone, nextTemplate);
      await updateConversationState(conversationId, nextTemplate);

      return res.status(200).json({ ok: true });
    }

    // ================================
    // RESPUESTA "NO"
    // ================================
    if (userMessage === 'no') {

      // ✅ familiares en empresa → CONTINÚA
      // ✅ vinculación previa → CONTINÚA
      if (
        currentState === 'seleccion_familiares_empresa' ||
        currentState === 'seleccion_vinculacion_previa'
      ) {
        const nextTemplate = TEMPLATE_FLOW[currentState];

        if (nextTemplate === 'fin') {
          await axios.post(
            `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
            {
              content: '✅ Proceso de selección completado. Gracias por tu tiempo.'
            },
            { headers: { api_access_token: API_KEY } }
          );
          await updateConversationState(conversationId, 'inicio');
          return res.status(200).json({ ok: true });
        }

        await sendWhatsAppTemplate(userPhone, nextTemplate);
        await updateConversationState(conversationId, nextTemplate);
        return res.status(200).json({ ok: true });
      }

      // ❌ NO en otras plantillas → TERMINA
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
          content: 'Entendido, proceso de selección cancelado. Gracias por tu tiempo.'
        },
        { headers: { api_access_token: API_KEY } }
      );

      await updateConversationState(conversationId, 'inicio');
      return res.status(200).json({ ok: true });
    }

    // ================================
    // RESPUESTA INVÁLIDA
    // ================================
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
      {
        content: 'Por favor responde únicamente con "Si" o "No".'
      },
      { headers: { api_access_token: API_KEY } }
    );

    res.status(200).json({ ok: true });

  } catch (error) {
    console.error('❌ ERROR:', error.message);
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
