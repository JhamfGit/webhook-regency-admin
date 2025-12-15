const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// VARIABLES (Railway)
const CHATWOOT_URL = process.env.CHATWOOT_URL;
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID;

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content } = req.body;

    console.log('📩 Webhook recibido:', req.body);

    if (event === 'message_created' && message_type === 'incoming') {
      const conversationId = conversation.id;

      // 🔹 Normalizar mensaje
      const userMessage = (content || '').trim().toLowerCase();

      let responseMessage = '';

      if (userMessage === 'si') {
        responseMessage = 'aceptado';
      } else if (userMessage === 'no') {
        responseMessage = 'rechazado';
      } else {
        responseMessage = 'Por favor seleccione una opción válida (Si, No)';
      }

      // 👉 Enviar respuesta a Chatwoot
      await axios.post(
        `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
        { content: responseMessage },
        {
          headers: {
            api_access_token: API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Respuesta enviada: "${responseMessage}"`);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Error webhook:', error.response?.data || error.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on ${PORT}`);
});
