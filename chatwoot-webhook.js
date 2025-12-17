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
// CONFIGURACIÓN DEL FLUJO
// ================================
const FLOW_CONFIG = {
  inicio: {
    next: 'seleccion_certificado_bachiller',
    displayName: 'Inicio'
  },
  seleccion_certificado_bachiller: {
    next: 'seleccion_ubicacion_desplazamiento',
    displayName: 'Certificado de bachiller',
    stopOnNo: true // Detiene el flujo si responde "no"
  },
  seleccion_ubicacion_desplazamiento: {
    next: 'seleccion_familiares_empresa',
    displayName: 'Ubicación y desplazamiento',
    stopOnNo: true
  },
  seleccion_familiares_empresa: {
    next: 'seleccion_distancia_transporte',
    displayName: 'Familiares en la empresa',
    stopOnYes: true // Detiene el flujo si responde "si"
  },
  seleccion_distancia_transporte: {
    next: 'seleccion_vinculacion_previa',
    displayName: 'Distancia y transporte',
    stopOnNo: false // Continúa aunque responda "no"
  },
  seleccion_vinculacion_previa: {
    next: 'fin',
    displayName: 'Vinculación previa',
    stopOnNo: false // Continúa aunque responda "no"
  }
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
async function getConversationState(conversationId) {
  try {
    const response = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
      { headers: { api_access_token: API_KEY } }
    );
    return response.data.custom_attributes?.template_state || 'inicio';
  } catch (error) {
    console.error('⚠️ Error obteniendo estado:', error.message);
    return 'inicio';
  }
}

async function updateConversationState(conversationId, newState) {
  try {
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
      { custom_attributes: { template_state: newState } },
      { headers: { api_access_token: API_KEY } }
    );
  } catch (error) {
    console.error('⚠️ Error actualizando estado:', error.message);
  }
}

async function sendChatwootMessage(conversationId, content, isPrivate = false) {
  try {
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
      { content, private: isPrivate },
      { headers: { api_access_token: API_KEY } }
    );
  } catch (error) {
    console.error('⚠️ Error enviando mensaje a Chatwoot:', error.message);
  }
}

async function sendWhatsAppTemplate(userPhone, templateName) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: userPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: "es_CO" }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return { success: true, data: response.data };
  } catch (error) {
    const errorDetail = error.response?.data || error.message;
    console.error(`❌ Error enviando plantilla "${templateName}":`, errorDetail);
    return { success: false, error: errorDetail };
  }
}

async function endFlow(conversationId, message) {
  await sendChatwootMessage(conversationId, message);
  await updateConversationState(conversationId, 'inicio');
}

// ================================
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content, additional_attributes } = req.body;

    // Filtrar mensajes no relevantes
    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: 'not incoming message' });
    }

    if (additional_attributes?.template_params) {
      return res.status(200).json({ ignored: 'template message' });
    }

    if (!content?.trim()) {
      return res.status(200).json({ ignored: 'empty message' });
    }

    const userMessage = content.trim().toLowerCase();
    const conversationId = conversation.id;
    const userPhone = conversation.contact_inbox.source_id;
    const currentState = await getConversationState(conversationId);

    console.log(`📍 Estado: ${currentState} | Respuesta: "${userMessage}"`);

    // Validar respuesta
    if (userMessage !== 'si' && userMessage !== 'no') {
      await sendChatwootMessage(
        conversationId,
        '⚠️ Por favor responde únicamente "si" o "no"'
      );
      return res.status(200).json({ ok: true, message: 'invalid response' });
    }

    // Obtener configuración del estado actual
    const currentConfig = FLOW_CONFIG[currentState];
    
    if (!currentConfig) {
      console.error(`❌ Estado desconocido: ${currentState}`);
      await endFlow(conversationId, '❌ Error en el flujo. Por favor inicia nuevamente.');
      return res.status(200).json({ ok: true, error: 'unknown state' });
    }

    // ============================
    // LÓGICA DE DECISIÓN
    // ============================
    let shouldStop = false;
    let stopMessage = '';

    if (userMessage === 'si' && currentConfig.stopOnYes) {
      shouldStop = true;
      stopMessage = '❌ Debido a que tienes familiares en la empresa, no es posible continuar con el proceso. Gracias por tu tiempo.';
    }

    if (userMessage === 'no' && currentConfig.stopOnNo) {
      shouldStop = true;
      stopMessage = '❌ Entendido, el proceso de selección ha sido cancelado. Gracias por tu tiempo.';
    }

    if (shouldStop) {
      await endFlow(conversationId, stopMessage);
      return res.status(200).json({ ok: true, stopped: true });
    }

    // ============================
    // AVANZAR AL SIGUIENTE PASO
    // ============================
    const nextStep = currentConfig.next;

    if (nextStep === 'fin') {
      await endFlow(
        conversationId,
        '✅ ¡Proceso de selección completado exitosamente! Gracias por tu tiempo. Nos pondremos en contacto contigo pronto.'
      );
      return res.status(200).json({ ok: true, completed: true });
    }

    // Enviar siguiente plantilla
    const templateResult = await sendWhatsAppTemplate(userPhone, nextStep);

    if (!templateResult.success) {
      // Si falla el envío de la plantilla
      await sendChatwootMessage(
        conversationId,
        `⚠️ Error al enviar plantilla "${FLOW_CONFIG[nextStep].displayName}". Verifica la configuración en Meta Business.`,
        true
      );
      
      await sendChatwootMessage(
        conversationId,
        '❌ Ocurrió un error técnico. Por favor contacta al equipo de soporte.'
      );
      
      await updateConversationState(conversationId, 'inicio');
      return res.status(200).json({ ok: false, error: 'template send failed' });
    }

    // Actualizar estado y notificar
    await updateConversationState(conversationId, nextStep);
    await sendChatwootMessage(
      conversationId,
      `✅ Plantilla enviada: ${FLOW_CONFIG[nextStep].displayName}`,
      true
    );

    res.status(200).json({ ok: true, nextStep });

  } catch (error) {
    console.error('❌ ERROR GENERAL:', error.response?.data || error.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ================================
// SERVER
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook listening on port ${PORT}`);
  console.log(`📋 Flujo configurado con ${Object.keys(FLOW_CONFIG).length} estados`);
});
