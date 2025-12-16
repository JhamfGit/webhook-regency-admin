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
      const userMessage = (content || '').trim().toLowerCase();

      // 👉 RESPUESTA "SI" → DISPARAR PLANTILLA
      
      if (userMessage === 'si') {
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          {
            content_type: 'text',
            content: '',
            template_params: {
              name: 'seleccion_certificado_bachiller',
              category: 'UTILITY',
              language: 'es',
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
      

      // 👉 RESPUESTA "NO"
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
      }

      // 👉 RESPUESTA INVÁLIDA
      else {
        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          { content: 'Por favor seleccione una opción válida (Si, No)' },
          {
            headers: {
              api_access_token: API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Error webhook:', error.response?.data || error.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on ${PORT}`);
});

