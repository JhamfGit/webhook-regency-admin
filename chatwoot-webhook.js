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

// Obtener estado actual
async function getConversationState(conversationId) {
  try {
    const response = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
      {
        headers: { api_access_token: API_KEY }
      }
    );

    return response.data.custom_attributes?.template_state || 'inicio';
  } catch (error) {
    console.error('Error obteniendo estado:', error.message);
    return 'inicio';
  }
}

// Actualizar estado
async function updateConversationState(conversationId, newState) {
  try {
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
      {
        custom_attributes: { template_state: newState }
      },
      {
        headers: {
          api_access_token: API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Estado actualizado a: ${newState}`);
  } catch (error) {
    console.error('Error actualizando estado:', error.message);
  }
}

// Enviar plantilla WhatsApp
async function sendWhatsAppTemplate(userPhone, templateName) {
  const response = await axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: userPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'es_CO' }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

// ================================
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const {
      event,
      message_type,
      conversation,
      content,
      additional_attributes
    } = req.body;

    console.log('📩 Webhook recibido:', JSON.stringify(req.body, null, 2));

    // 1. Solo mensajes entrantes
    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: 'not incoming message' });
    }

    // 2. Anti-loop (mensajes plantilla)
    if (additional_attributes?.template_params) {
      console.log('🔁 Mensaje de plantilla ignorado');
      return res.status(200).json({ ignored: 'template message' });
    }

    // 3. Mensajes vacíos
    if (!content || !content.trim()) {
      return res.status(200).json({ ignored: 'empty message' });
    }

    const conversationId = conversation.id;
    const userMessage = content.trim().toLowerCase();
    const userPhone = conversation.contact_inbox.source_id;

    const currentState = await getConversationState(conversationId);
    console.log(`📍 Estado actual: ${currentState}`);

    // ================================
    // RESPUESTA "SI"
    // ================================
    if (userMessage === 'si') {

      // ❌ Regla especial
      if (currentState === 'seleccion_familiares_empresa') {
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content:
              'Gracias por tu respuesta. Debido a que tienes familiares en la empresa, no es posible continuar con el proceso.'
          },
          {
            headers: {
              api_access_token: API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );

        await updateConversationState(conversationId, 'inicio');
        console.log('❌ Proceso finalizado por familiares en la empresa');
        return res.status(200).json({ ok: true });
      }

      // 👉 Flujo normal
      const nextTemplate = TEMPLATE_FLOW[currentState];

      if (nextTemplate === 'fin') {
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content: '✅ Proceso de selección completado. Gracias por tu tiempo.'
          },
          {
            headers: {
              api_access_token: API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );

        await updateConversationState(conversationId, 'inicio');
        return res.status(200).json({ ok: true });
      }

      await sendWhatsAppTemplate(userPhone, nextTemplate);
      await updateConversationState(conversationId, nextTemplate);

      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
          content: `📋 Plantilla enviada: ${TEMPLATE_NAMES[nextTemplate] || nextTemplate}`,
          private: true
        },
        {
          headers: {
            api_access_token: API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // ================================
    // RESPUESTA "NO"
    // ================================
    else if (userMessage === 'no') {

      // ✅ ÚNICO CASO donde NO continúa
      if (currentState === 'seleccion_familiares_empresa') {
        const nextTemplate = TEMPLATE_FLOW[currentState];

        await sendWhatsAppTemplate(userPhone, nextTemplate);
        await updateConversationState(conversationId, nextTemplate);

        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content: `📋 Plantilla enviada: ${TEMPLATE_NAMES[nextTemplate] || nextTemplate}`,
            private: true
          },
          {
            headers: {
              api_access_token: API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );

        return res.status(200).json({ ok: true });
      }

      // ❌ NO en cualquier otro punto
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
          content:
            'Entendido, proceso de selección cancelado. Gracias por tu tiempo.'
        },
        {
          headers: {
            api_access_token: API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      await updateConversationState(conversationId, 'inicio');
    }

    // ================================
    // RESPUESTA INVÁLIDA
    // ================================
    else {
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
          content: 'Por favor seleccione una opción válida (Si, No)'
        },
        {
          headers: {
            api_access_token: API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ ERROR COMPLETO:', error);
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
