const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const CHATWOOT_URL = process.env.CHATWOOT_URL || 'https://support.jhamf.com';
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID || '9';

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.post('/chatwoot-webhook', (req, res) => {
  res.status(200).send('OK');

  (async () => {
    try {
      const { event, message_type, conversation, content } = req.body;

      console.log(`📨 Evento: ${event}, tipo: ${message_type}`);

      if (event === 'message_created' && message_type === 'incoming') {
        if (!API_KEY) {
          console.error('❌ API_KEY no definida');
          return;
        }

        const conversationId = conversation.id;

        await axios.post(
          `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
          { content: '✅ Entró al webhook' },
          { headers: { api_access_token: API_KEY } }
        );

        console.log(`✅ Mensaje enviado a ${conversationId}`);
        console.log(`📝 Usuario escribió: ${content}`);
      }
    } catch (error) {
      console.error('❌ Error webhook:', error.response?.data || error.message);
    }
  })();
});

const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on ${PORT}`);
});
