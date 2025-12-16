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

// ================================
// HEALTH CHECK
// ================================
app.get('/', (req, res) => {
  res.status(200).send('OK');
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

    console.log('📩 Webhook recibido:', req.body);

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

    // ================================
    // RESPUESTA "SI" → ENVIAR PLANTILLA
    // ================================
    if (userMessage === 'si') {
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
          content_type: 'text',
          content: '',
          template_params: {
            name: 'seleccion_certificado_bachiller_es_CO', // ✅ nombre real
            category: 'UTILITY',
            language: 'es_CO', // ✅ idioma exacto
            components: []
          }
        },
        {
          headers: {
            api_access_token: API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
    
      console.log('✅ Plantilla WhatsApp enviada correctamente');
    }


    // ================================
    // RESPUESTA "NO"
    // ================================
    else if (userMessage === 'no') {
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        { content: 'rechazado' },
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
    console.error('❌ Error webhook:', error.response?.data || error.message);
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

