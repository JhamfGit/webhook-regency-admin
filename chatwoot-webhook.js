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
// DEBUG: Obtener Phone Number ID correcto
// ================================
app.get('/get-phone-id', async (req, res) => {
  try {
    const businessResponse = await axios.get(
      'https://graph.facebook.com/v18.0/me/businesses',
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
        }
      }
    );

    const businessId = businessResponse.data.data[0]?.id;

    if (!businessId) {
      return res.json({ error: 'No business found', data: businessResponse.data });
    }

    const wabaResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${businessId}/client_whatsapp_business_accounts`,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
        }
      }
    );

    const wabaId = wabaResponse.data.data[0]?.id;

    if (!wabaId) {
      return res.json({ error: 'No WABA found', businessId, data: wabaResponse.data });
    }

    const phoneResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${wabaId}/phone_numbers`,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
        }
      }
    );

    res.json({
      businessId,
      wabaId,
      phoneNumbers: phoneResponse.data
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.response?.data || error.message,
      stack: error.stack
    });
  }
});

// ================================
// FUNCIONES AUXILIARES
// ================================

// Obtener el estado actual de la conversación
async function getConversationState(conversationId) {
  try {
    const response = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
      {
        headers: {
          api_access_token: API_KEY
        }
      }
    );
    
    return response.data.custom_attributes?.template_state || 'inicio';
  } catch (error) {
    console.error('Error obteniendo estado:', error.message);
    return 'inicio';
  }
}

// Actualizar el estado de la conversación
async function updateConversationState(conversationId, newState) {
  try {
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
      {
        custom_attributes: {
          template_state: newState
        }
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

// Enviar plantilla de WhatsApp
async function sendWhatsAppTemplate(userPhone, templateName) {
  const response = await axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: userPhone,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: "es_CO"
        }
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
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

    // 🚫 1. Ignorar eventos que no sean mensajes entrantes
    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: 'not incoming message' });
    }

    // 🚫 2. Ignorar mensajes generados por plantillas (anti-loop)
    if (additional_attributes?.template_params) {
      console.log('🔁 Mensaje de plantilla ignorado');
      return res.status(200).json({ ignored: 'template message' });
    }

    // 🚫 3. Ignorar mensajes vacíos
    if (!content || !content.trim()) {
      return res.status(200).json({ ignored: 'empty message' });
    }

    const conversationId = conversation.id;
    const userMessage = content.trim().toLowerCase();
    const userPhone = conversation.contact_inbox.source_id;

    // ================================
    // RESPUESTA "SI" → CONTINUAR FLUJO
    // ================================
    if (userMessage === 'si') {
      // Obtener estado actual
      const currentState = await getConversationState(conversationId);
      console.log(`📍 Estado actual: ${currentState}`);

      // Determinar siguiente plantilla
      const nextTemplate = TEMPLATE_FLOW[currentState];
      
      if (nextTemplate === 'fin') {
        console.log('✅ Flujo completado');
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content: '✅ Proceso de selección completado. Gracias por tu tiempo.',
            private: false
          },
          {
            headers: {
              api_access_token: API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );
        
        // Resetear estado
        await updateConversationState(conversationId, 'inicio');
        return res.status(200).json({ ok: true });
      }

      console.log(`🎯 Enviando plantilla: ${nextTemplate}`);

      try {
        // Enviar plantilla
        const whatsappResponse = await sendWhatsAppTemplate(userPhone, nextTemplate);
        console.log('✅ Plantilla WhatsApp enviada:', whatsappResponse);

        // Actualizar estado
        await updateConversationState(conversationId, nextTemplate);

        // Nota privada en Chatwoot
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

      } catch (whatsappError) {
        console.error('❌ ERROR WHATSAPP API:', whatsappError.response?.data);
        
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content: `⚠️ Error al enviar plantilla: ${JSON.stringify(whatsappError.response?.data)}`,
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
    }
    
    // ================================
    // RESPUESTA "NO" → TERMINAR FLUJO
    // ================================
    else if (userMessage === 'no') {
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
          content: 'Entendido, proceso de selección cancelado. Gracias por tu tiempo.'
        },
        {
          headers: {
            api_access_token: API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Resetear estado
      await updateConversationState(conversationId, 'inicio');
      console.log('❌ Proceso cancelado por el usuario');
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
      console.log('⚠️ Opción inválida');
    }

    res.status(200).json({ ok: true });
    
  } catch (error) {
    console.error('❌ ERROR COMPLETO:', error);
    console.error('❌ Error response:', error.response?.data);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
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
