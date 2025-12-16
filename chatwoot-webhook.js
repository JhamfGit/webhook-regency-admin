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

// 🆕 NECESITAS AGREGAR ESTAS VARIABLES:
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN; // Token de WhatsApp Business API
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;   // Phone number ID de WhatsApp

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
    // Primero obtener el Business Account ID
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

    // Luego obtener los números de WhatsApp
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

    // Finalmente obtener los phone numbers
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
    const userPhone = conversation.contact_inbox.source_id; // Número del usuario

    // ================================
    // LÓGICA DE FLUJO CON PLANTILLAS
    // ================================
    
    // Obtener el último mensaje del agente para determinar el contexto
    const lastAgentMessage = conversation.messages?.[conversation.messages.length - 2];
    const isAfterCertificadoBachiller = lastAgentMessage?.content?.includes('certificado de bachiller');

    // ================================
    // RESPUESTA "SI" → ENVIAR PLANTILLA
    // ================================
    if (userMessage === 'si') {
      let templateName = '';
      let successMessage = '';

      // Determinar qué plantilla enviar según el contexto
      if (isAfterCertificadoBachiller) {
        templateName = 'seleccion_ubicacion_desplazamiento';
        successMessage = '📋 Plantilla de ubicación/desplazamiento enviada';
      } else {
        // Primera plantilla (por defecto)
        templateName = 'seleccion_certificado_bachiller';
        successMessage = '📋 Plantilla de certificado enviada';
      }

      console.log(`🎯 Contexto detectado, enviando plantilla: ${templateName}`);
      console.log('🔍 Detectado "Si", intentando enviar plantilla...');
      console.log('📞 Phone ID:', WHATSAPP_PHONE_ID);
      console.log('🔑 Token configurado:', WHATSAPP_API_TOKEN ? 'SÍ' : 'NO');
      console.log('👤 Usuario:', userPhone);

      try {
        // 🆕 ENVIAR DIRECTO A WHATSAPP API
        const whatsappResponse = await axios.post(
          `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: userPhone,
            type: "template",
            template: {
              name: templateName, // ✅ Nombre dinámico según contexto
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

        console.log('✅ Plantilla WhatsApp enviada:', whatsappResponse.data);

        // Opcional: Registrar en Chatwoot que enviaste una plantilla
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content: successMessage, // ✅ Mensaje dinámico
            private: true // Nota privada solo para agentes
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
        console.error('❌ Status:', whatsappError.response?.status);
        
        // Enviar mensaje de error en Chatwoot
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
    // RESPUESTA "NO"
    // ================================
    else if (userMessage === 'no') {
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        { content: 'Entendido, solicitud cancelada.' },
        {
          headers: {
            api_access_token: API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('❌ Respuesta: rechazado');
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
