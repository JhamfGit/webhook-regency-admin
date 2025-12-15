const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.post('/chatwoot-webhook', (req, res) => {
  console.log('Webhook recibido:', req.body);
  res.status(200).json({ ok: true });
});

const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on ${PORT}`);
});
