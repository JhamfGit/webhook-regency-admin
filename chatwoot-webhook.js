const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ================================
// VARIABLES DE ENTORNO
// ================================
const CHATWOOT_URL = process.env.CHATWOOT_URL;
const API_KEY = process.env.API_KEY;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// ================================
// MAPEO DE PROYECTOS A EQUIPOS
// ================================
const PROJECT_TO_TEAM = {
  'SUMAPAZ': 'op-vial',
  'GICA OP VIAL': 'op-vial',
  'RUTA AL SUR OP VIAL': 'op-vial',
  'VINUS OP VIAL': 'op-vial',

  'ACCENORTE': 'pyb-accenorte-iccu-vigilancia',
  'FRIGORINUS VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',

  'RUTA AL SUR PLANTA': 'pyb-planta',
  'RUTAS DEL VALLE PLANTA': 'pyb-planta',
  'GICA PLANTA': 'pyb-planta',

  'ADMINISTRACION': 'admin-tolis',
  'TOLIS': 'admin-tolis'
};

// ================================
// HEALTH CHECK
// ================================
app.get('/', (_, res) => res.status(200).send('OK'));

// ================================
// ASIGNAR EQUIPO (SOLO UNA VEZ)
// ================================
async function assignTeam(conversationId, proyecto) {
  const normalized = proyecto.trim().toUpperCase();
  const team = PROJECT_TO_TEAM[normalized];

  if (!team) {
    console.log(`⚠️ Proyecto sin mapeo: ${proyecto}`);
    return;
  }

  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
    { labels: [team] },
    { headers: { api_access_token: API_KEY } }
  );

  console.log(`🎯 Proyecto "${proyecto}" → Equipo: ${team}`);
}

// ================================
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, conversation } = req.body;

    // ============================
    // 🔥 CLAVE: SOLO conversation_updated
    // ============================
    if (event !== 'conversation_updated') {
      return res.sendStatus(200);
    }

    const conversationId = conversation.id;
    const proyecto = conversation.custom_attributes?.proyecto;

    if (!proyecto) {
      console.log('⏳ conversation_updated sin proyecto aún');
      return res.sendStatus(200);
    }

    // ============================
    // ASIGNAR EQUIPO DEFINITIVO
    // ============================
    await assignTeam(conversationId, proyecto);

    return res.sendStatus(200);

  } catch (error) {
    console.error('❌ ERROR WEBHOOK:', error.message);
    return res.sendStatus(500);
  }
});

// ================================
// SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
});
