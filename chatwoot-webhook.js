const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Configuración - REEMPLAZA CON TUS DATOS
const CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://support.jhamf.com';
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID || '9';

// Webhook endpoint
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content } = req.body;

    console.log(`📨 Evento recibido: ${event}, tipo: ${message_type}`);

    // Solo responder a mensajes entrantes del usuario
    if (event === 'message_created' && message_type === 'incoming') {
      const conversationId = conversation.id;

      // Enviar mensaje de validación
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        {
          content: '✅ Entró al webhook'
        },
        { headers: { 'api_access_token': API_KEY } }
      );

      console.log(`✅ Mensaje de validación enviado a conversación ${conversationId}`);
      console.log(`📝 Usuario escribió: ${content}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    res.status(500).send('Error');
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Webhook server running on port ${PORT}`);
  console.log('📍 Endpoint: POST /chatwoot-webhook');
});
