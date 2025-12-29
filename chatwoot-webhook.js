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
  // Op vial
  'SUMAPAZ': 'op-vial',
  'GICA OP VIAL': 'op-vial',
  'RUTA AL SUR OP VIAL': 'op-vial',
  'VINUS OP VIAL': 'op-vial',
  
  // PyB-accenorte-iccu-vigilancia
  'ACCENORTE': 'pyb-accenorte-iccu-vigilancia',
  'FRIGORINUS VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'MINEROS LA MARIA VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'APP GICA (VIGILANCIA)': 'pyb-accenorte-iccu-vigilancia',
  'DS EL FARO 118 VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'VINUS - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'RUTA AL SUR - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'RUTAS DEL VALLE - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'ACCENORTE - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  'CONSORCIO PEAJES 2526 - VIGILANCIA': 'pyb-accenorte-iccu-vigilancia',
  
  // planta temporal-canguro
  'CONSORCIO PEAJES 2526 - PLANTA': 'planta-temporal-canguro',
  'RUTA AL SUR - RECOLECTOR TEMPORADA': 'planta-temporal-canguro',
  'RUTAS DEL VALLE - RECOLECTOR TEMPORADA': 'planta-temporal-canguro',
  'GICA - RECOLECTOR TEMPORADA': 'planta-temporal-canguro',
  'CONSORCIO PEAJES 2526 - CANGUROS': 'planta-temporal-canguro',
  
  // pyb-planta
  'RUTA AL SUR PLANTA': 'pyb-planta',
  'RUTAS DEL VALLE PLANTA': 'pyb-planta',
  'RUTAS DEL VALLE': 'pyb-planta',
  'GICA PLANTA': 'pyb-planta',
  'VINUS PLANTA': 'pyb-planta',
  
  // Admin-tolis
  'ADMINISTRACION': 'admin-tolis',
  'TOLIS': 'admin-tolis'
};

// ================================
// FLUJO DE ESTADOS
// ================================
const TEMPLATE_FLOW = {
  iniciando: 'seleccion_certificado_bachiller',
  inicio: 'seleccion_certificado_bachiller',
  seleccion_certificado_bachiller: 'seleccion_ubicacion_desplazamiento',
  seleccion_ubicacion_desplazamiento: 'seleccion_familiares_empresa',
  seleccion_familiares_empresa: 'seleccion_distancia_transporte',
  seleccion_distancia_transporte: 'seleccion_medio_transporte',
  seleccion_medio_transporte: 'seleccion_vinculacion_previa',
  seleccion_vinculacion_previa: 'fin'
};

const TEMPLATE_NAMES = {
  iniciando: 'Iniciando proceso',
  seleccion_certificado_bachiller: 'Certificado de bachiller',
  seleccion_ubicacion_desplazamiento: 'Ubicación y desplazamiento',
  seleccion_familiares_empresa: 'Familiares en la empresa',
  seleccion_distancia_transporte: 'Distancia al trabajo',
  seleccion_medio_transporte: 'Medio de transporte',
  seleccion_vinculacion_previa: 'Vinculación previa'
};

// Opciones válidas para cada lista interactiva
const VALID_RESPONSES = {
  seleccion_distancia_transporte: ['menos_15', '15_30', '30_60', 'mas_60', 'menos de 15 minutos', '15 a 30 minutos', '30 minutos a 1 hora', 'más de 1 hora'],
  seleccion_medio_transporte: ['moto', 'carro', 'publico', 'transporte público', 'bicicleta', 'pie', 'a pie']
};

// ================================
// CONTROL DE HORARIO
// ================================
function isBusinessHours() {
  const now = new Date();
  const bogotaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const day = bogotaTime.getDay();
  const hour = bogotaTime.getHours();

  const isWeekday = day >= 1 && day <= 5;
  const isWorkingHours = hour >= 8 && hour < 17;

  console.log(`🕐 Hora actual en Bogotá: ${bogotaTime.toLocaleString('es-CO')} (Día: ${day}, Hora: ${hour})`);

  if (isWeekday && isWorkingHours) {
    console.log('✅ Lunes a Viernes - Dentro del horario (8 AM - 5 PM)');
    return true;
  } else {
    console.log('⏸️ Fuera del horario laboral');
    return false;
  }
}

// ================================
// CONTROL DE CONVERSACIONES PROCESADAS
// ================================
const processedConversations = new Set();

function isConversationProcessed(conversationId) {
  return processedConversations.has(conversationId);
}

function markConversationAsProcessed(conversationId) {
  processedConversations.add(conversationId);
}

// ================================
// CACHE SIMPLE PARA REDUCIR LLAMADAS
// ================================
const conversationCache = new Map();
const CACHE_TTL = 60000; // 1 minuto

function getCachedData(key) {
  const cached = conversationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  conversationCache.set(key, { data, timestamp: Date.now() });
}

// ================================
// HEALTH CHECK
// ================================
app.get('/', (_, res) => {
  res.status(200).send('OK');
});

// ================================
// FUNCIONES AUXILIARES CHATWOOT
// ================================
async function getConversationAttributes(conversationId) {
  const cacheKey = `attrs_${conversationId}`;
  
  // NO usar cache - siempre obtener datos frescos
  conversationCache.delete(cacheKey);

  try {
    const res = await axios.get(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}`,
      { 
        headers: { api_access_token: API_KEY },
        timeout: 5000
      }
    );
    const attrs = res.data.custom_attributes || {};
    console.log(`📦 Atributos obtenidos para conversación ${conversationId}:`, JSON.stringify(attrs));
    return attrs;
  } catch (error) {
    console.error('❌ Error obteniendo atributos:', error.message);
    return {};
  }
}

async function getConversationState(conversationId) {
  const attrs = await getConversationAttributes(conversationId);
  return attrs.template_state || null;
}

async function getConversationProject(conversationId) {
  const attrs = await getConversationAttributes(conversationId);
  return attrs.proyecto || null;
}

async function updateConversationAttributes(conversationId, attributes) {
  const cacheKey = `attrs_${conversationId}`;
  conversationCache.delete(cacheKey); // Invalidar cache
  
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/custom_attributes`,
    { custom_attributes: attributes },
    { 
      headers: { api_access_token: API_KEY },
      timeout: 5000
    }
  );
}

async function updateConversationState(conversationId, state) {
  const currentAttrs = await getConversationAttributes(conversationId);
  await updateConversationAttributes(conversationId, {
    ...currentAttrs,
    template_state: state
  });
}

async function sendChatwootMessage(conversationId, content, isPrivate = false) {
  await axios.post(
    `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`,
    { content, private: isPrivate },
    { 
      headers: { api_access_token: API_KEY },
      timeout: 5000
    }
  );
}

async function assignConversation(conversationId, assigneeId) {
  try {
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`,
      { assignee_id: assigneeId },
      {
        headers: { api_access_token: API_KEY },
        timeout: 5000
      }
    );
    console.log(`🎯 Conversación ${conversationId} asignada exitosamente.`);
  } catch (error) {
    console.error('❌ Error asignando conversación:', error.message);
  }
}

async function assignLabelByProject(conversationId, proyecto) {
  try {
    const normalizedProject = proyecto.trim().toUpperCase();
    const team = PROJECT_TO_TEAM[normalizedProject];
    
    if (!team) {
      console.log(`⚠️ Proyecto "${proyecto}" no encontrado en el mapeo`);
      await sendChatwootMessage(
        conversationId,
        `⚠️ Proyecto "${proyecto}" no mapeado a ningún equipo`,
        true
      );
      return null;
    }
    
    // Asignar la etiqueta
    await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/labels`,
      { labels: [team] },
      { 
        headers: { api_access_token: API_KEY },
        timeout: 5000
      }
    );
    
    console.log(`🎯 Proyecto "${proyecto}" → Equipo: ${team}`);
    
    await sendChatwootMessage(
      conversationId,
      `✅ Etiqueta asignada: ${team} (Proyecto: ${proyecto})`,
      true
    );
    
    return team;
      
  } catch (error) {
    console.error('⚠️ Error asignando etiqueta por proyecto:', error.response?.data || error.message);
    return null;
  }
}

// ================================
// WHATSAPP - TEMPLATE NORMAL
// ================================
async function sendWhatsAppTemplate(userPhone, templateName) {
  return axios.post(
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
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );
}

// ================================
// WHATSAPP - LISTA DISTANCIA
// ================================
async function sendWhatsAppDistancia(userPhone) {
  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: userPhone,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Distancia al trabajo" },
        body: {
          text: "¿Cuál es el tiempo aproximado de traslado entre su residencia y el lugar de trabajo?"
        },
        action: {
          button: "Ver opciones",
          sections: [
            {
              title: "Opciones",
              rows: [
                { id: "menos_15", title: "Menos de 15 minutos" },
                { id: "15_30", title: "15 a 30 minutos" },
                { id: "30_60", title: "30 minutos a 1 hora" },
                { id: "mas_60", title: "Más de 1 hora" }
              ]
            }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );
}

// ================================
// WHATSAPP - LISTA MEDIO TRANSPORTE
// ================================
async function sendWhatsAppMedioTransporte(userPhone) {
  return axios.post(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: userPhone,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Medio de transporte" },
        body: {
          text: "¿Qué medio de transporte utiliza para desplazarse al lugar de trabajo?"
        },
        action: {
          button: "Ver opciones",
          sections: [
            {
              title: "Opciones",
              rows: [
                { id: "moto", title: "Moto" },
                { id: "carro", title: "Carro" },
                { id: "publico", title: "Transporte público" },
                { id: "bicicleta", title: "Bicicleta" },
                { id: "pie", title: "A pie" }
              ]
            }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );
}

// ================================
// VALIDACIÓN DE RESPUESTAS (CORREGIDO)
// ================================
function isValidResponse(state, message) {
  const normalizedMessage = message.toLowerCase().trim();
  
  if (VALID_RESPONSES[state]) {
    return VALID_RESPONSES[state].some(option => 
      normalizedMessage.includes(option.toLowerCase())
    );
  }
  
  if (['seleccion_certificado_bachiller', 'seleccion_ubicacion_desplazamiento', 
       'seleccion_familiares_empresa', 'seleccion_vinculacion_previa'].includes(state)) {
    return normalizedMessage === 'si' || normalizedMessage === 'no';
  }
  
  return false;
}

// ================================
// EXTRACTOR DE RESPUESTA DE LISTA
// ================================
function extractListResponse(additionalAttributes) {
  if (additionalAttributes?.list_reply) {
    return additionalAttributes.list_reply.id || null;
  }
  if (additionalAttributes?.button_reply) {
    return additionalAttributes.button_reply.id || null;
  }
  return null;
}

// ================================
// WEBHOOK CHATWOOT
// ================================
app.post('/chatwoot-webhook', async (req, res) => {
  try {
    const { event, message_type, conversation, content, additional_attributes } = req.body;

    console.log('═══════════════════════════════════════');
    console.log(`📨 WEBHOOK RECIBIDO - Conversación: ${conversation.id}`);
    console.log(`   Evento: ${event}, Tipo: ${message_type}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════');

    // Verificar horario laboral
    if (!isBusinessHours()) {
      return res.status(200).json({ ignored: 'outside business hours' });
    }

    // Solo procesar mensajes entrantes
    if (event !== 'message_created' || message_type !== 'incoming') {
      return res.status(200).json({ ignored: 'not incoming message' });
    }

    const conversationId = conversation.id;
    const userPhone = conversation.contact_inbox?.source_id;

    if (!userPhone) {
      console.log('⚠️ No se encontró source_id (número de teléfono)');
      return res.status(200).json({ ignored: 'no phone number' });
    }

    // Verificar si la conversación ya fue procesada
    if (isConversationProcessed(conversationId)) {
      console.log(`🛑 Conversación ${conversationId} ya procesada. Ignorando.`);
      return res.status(200).json({ ignored: 'already processed' });
    }

    // Extraer respuesta de lista interactiva si existe
    const listResponse = extractListResponse(additional_attributes);
    let userMessage = '';

    if (listResponse) {
      console.log('📱 Respuesta de lista interactiva:', listResponse);
      userMessage = listResponse.toLowerCase().trim();
    } else if (content?.trim()) {
      userMessage = content.trim().toLowerCase();
    } else {
      return res.status(200).json({ ignored: 'empty message' });
    }

    console.log(`📝 Mensaje original: "${content}"`);
    console.log(`📝 Mensaje normalizado: "${userMessage}"`);

    // ============================
    // OBTENER ESTADO Y PROYECTO (SIEMPRE FRESCO)
    // ============================
    const currentState = await getConversationState(conversationId);
    let proyecto = await getConversationProject(conversationId);

    console.log(`📍 Estado actual: ${currentState || 'sin estado'}`);
    console.log(`📋 Proyecto almacenado: ${proyecto || 'no definido'}`);

    // ============================
    // BLOQUEAR CONVERSACIONES FINALIZADAS
    // ============================
    if (['completado', 'rechazado', 'cancelado', 'error', 'error_inicio'].includes(currentState)) {
      console.log(`🛑 Conversación en estado final (${currentState}). No se responde.`);
      markConversationAsProcessed(conversationId);
      return res.status(200).json({ ignored: 'conversation finished' });
    }

    // ============================
    // INICIAR FLUJO (CON MENSAJE PREVIO Y BLOQUEO)
    // ============================
    if (!currentState) {
      console.log('🔍 Sin estado actual. Verificando si ya se está procesando...');
      
      // ⚠️ BLOQUEO INMEDIATO
      try {
        await updateConversationState(conversationId, 'iniciando');
        console.log('🔒 Estado cambiado a "iniciando" para bloquear duplicados');
      } catch (error) {
        console.log('⚠️ No se pudo actualizar estado inicial, posible duplicado');
        return res.status(200).json({ ignored: 'already processing' });
      }
      
      // Pequeña pausa
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verificar de nuevo
      const stateCheck = await getConversationState(conversationId);
      if (stateCheck && stateCheck !== 'iniciando') {
        console.log(`🛑 Otro proceso ya avanzó el estado a: ${stateCheck}`);
        return res.status(200).json({ ignored: 'already started by another webhook' });
      }
      
      console.log('📝 Enviando mensaje de bienvenida...');
      
      try {
        // ✅ PASO 1: Enviar mensaje de texto informativo
        await sendChatwootMessage(
          conversationId,
          'A continuación se le harán unas preguntas relevantes para hacer el primer filtro del proceso de selección. Por favor responda con honestidad.',
          false
        );
        
        // ✅ PASO 2: Esperar 2 segundos para que n8n sincronice
        console.log('⏳ Esperando sincronización de proyecto (2 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // ✅ PASO 3: Obtener proyecto
        conversationCache.delete(`attrs_${conversationId}`);
        proyecto = await getConversationProject(conversationId);
        
        if (proyecto) {
          console.log(`✅ Proyecto sincronizado: ${proyecto}`);
        } else {
          console.log('⚠️ Proyecto aún no sincronizado, continuando de todos modos');
        }
        
        // ✅ PASO 4: Enviar primera plantilla
        console.log('📤 Enviando plantilla: Certificado de bachiller');
        await sendWhatsAppTemplate(userPhone, 'seleccion_certificado_bachiller');
        
        // ✅ PASO 5: Actualizar estado real
        await updateConversationState(conversationId, 'seleccion_certificado_bachiller');
        
        // ✅ PASO 6: Asignar si hay assignee
        if (conversation.meta?.assignee) {
          await assignConversation(conversationId, conversation.meta.assignee.id);
        }
        
        // ✅ PASO 7: Nota interna
        await sendChatwootMessage(
          conversationId,
          `✅ Flujo iniciado: Certificado de bachiller\n📋 Proyecto: ${proyecto || 'Pendiente de sincronizar'}`,
          true
        );
        
        // ✅ PASO 8: Marcar como procesada
        markConversationAsProcessed(conversationId);
        
        return res.json({ ok: true, started: true, proyecto: proyecto || 'pendiente' });
        
      } catch (error) {
        console.error('❌ Error iniciando flujo:', error.message);
        
        await updateConversationState(conversationId, 'error_inicio');
        
        await sendChatwootMessage(
          conversationId,
          '❌ Ocurrió un error al iniciar el proceso. Por favor contacta a soporte.',
          false
        );
        
        return res.status(500).json({ error: 'failed to start flow' });
      }
    }

    // ============================
    // VALIDAR RESPUESTA SEGÚN ESTADO
    // ============================
    console.log(`🔍 Validando respuesta para estado: ${currentState}`);
    const isValid = isValidResponse(currentState, userMessage);
    console.log(`✅ Respuesta válida: ${isValid}`);

    if (!isValid) {
      console.log(`⚠️ Respuesta inválida. Mensaje: "${userMessage}", Estado: ${currentState}`);

      let helpMessage = '';
      if (VALID_RESPONSES[currentState]) {
        helpMessage = '⚠️ Por favor selecciona una opción del menú usando el botón "Ver opciones".';
      } else {
        helpMessage = '⚠️ Por favor responde "Si" o "No".';
      }

      await sendChatwootMessage(conversationId, helpMessage);
      return res.status(200).json({ ok: true, message: 'invalid response' });
    }

    // ============================
    // GUARDAR RESPUESTAS INFORMATIVAS
    // ============================
    if (
      currentState === 'seleccion_distancia_transporte' ||
      currentState === 'seleccion_medio_transporte'
    ) {
      const displayValue =
        VALID_RESPONSES[currentState].find(opt =>
          opt.toLowerCase() === userMessage.toLowerCase()
        ) || userMessage;

      await sendChatwootMessage(
        conversationId,
        `📝 ${TEMPLATE_NAMES[currentState]}: ${displayValue}`,
        true
      );
    }

    // ============================
    // LÓGICA DE DECISIÓN
    // ============================

    // ❌ Corte por familiares
    if (userMessage === 'si' && currentState === 'seleccion_familiares_empresa') {
      await sendChatwootMessage(
        conversationId,
        '❌ Debido a que tienes familiares en la empresa, no es posible continuar con el proceso.'
      );
      await updateConversationState(conversationId, 'rechazado');

      markConversationAsProcessed(conversationId);
      console.log('🚫 Proceso rechazado por familiares. Sin etiquetado.');

      return res.json({ ok: true, stopped: true, reason: 'familiares' });
    }

    // ❌ Cancelación general
    if (
      userMessage === 'no' &&
      ![
        'seleccion_familiares_empresa',
        'seleccion_distancia_transporte',
        'seleccion_medio_transporte',
        'seleccion_vinculacion_previa'
      ].includes(currentState)
    ) {
      await sendChatwootMessage(
        conversationId,
        '❌ Proceso de selección cancelado. Gracias por tu tiempo.'
      );
      await updateConversationState(conversationId, 'cancelado');

      markConversationAsProcessed(conversationId);
      console.log('🚫 Proceso cancelado por usuario. Sin etiquetado.');

      return res.json({ ok: true, stopped: true, reason: 'usuario_cancelo' });
    }

    // ============================
    // AVANZAR FLUJO
    // ============================
    const nextStep = TEMPLATE_FLOW[currentState];

    if (nextStep === 'fin') {
      // ✅ PASO 1: MENSAJE DE CONFIRMACIÓN
      await sendChatwootMessage(
        conversationId,
        'Confirmamos que has superado esta fase inicial. Tu candidatura sigue activa y pasará a la siguiente etapa del proceso de selección.'
      );
      
      // ✅ PASO 2: ACTUALIZAR ESTADO A COMPLETADO
      await updateConversationState(conversationId, 'completado');
    
      // ✅ PASO 3: ESPERAR 3 SEGUNDOS para que n8n sincronice el proyecto
      console.log('⏳ Esperando 3 segundos para sincronización de proyecto...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    
      // ✅ PASO 4: OBTENER PROYECTO FRESCO (FORZAR LECTURA SIN CACHE)
      const cacheKey = `attrs_${conversationId}`;
      conversationCache.delete(cacheKey);
      
      proyecto = await getConversationProject(conversationId);
      console.log(`🔄 Proyecto verificado después de espera: ${proyecto || 'no definido'}`);
    
      // ✅ PASO 5: AHORA SÍ - ETIQUETAR LA CONVERSACIÓN
      if (proyecto) {
        console.log(`🏷️ Proceso completado. Etiquetando con proyecto: ${proyecto}`);
        const team = await assignLabelByProject(conversationId, proyecto);
        
        if (team) {
          console.log(`✅ Etiqueta asignada exitosamente: ${team}`);
        } else {
          console.log('⚠️ No se pudo asignar etiqueta');
          await sendChatwootMessage(
            conversationId,
            `⚠️ Proyecto "${proyecto}" no mapeado a ningún equipo`,
            true
          );
        }
      } else {
        console.log('⚠️ No hay proyecto definido después de espera. No se asignó etiqueta.');
        await sendChatwootMessage(
          conversationId,
          '⚠️ No se pudo asignar etiqueta: proyecto no definido después de sincronización',
          true
        );
      }
    
      // ✅ PASO 6: MARCAR COMO PROCESADA
      markConversationAsProcessed(conversationId);
    
      return res.json({ ok: true, completed: true, proyecto, etiquetado: !!proyecto });
    }

    // Enviar siguiente mensaje
    try {
      if (nextStep === 'seleccion_distancia_transporte') {
        await sendWhatsAppDistancia(userPhone);
      } else if (nextStep === 'seleccion_medio_transporte') {
        await sendWhatsAppMedioTransporte(userPhone);
      } else {
        await sendWhatsAppTemplate(userPhone, nextStep);
      }

      await updateConversationState(conversationId, nextStep);

      await sendChatwootMessage(
        conversationId,
        `✅ Mensaje enviado: ${TEMPLATE_NAMES[nextStep]}`,
        true
      );

      res.json({ ok: true, nextStep });
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error.response?.data || error.message);

      await sendChatwootMessage(
        conversationId,
        '❌ Ocurrió un error técnico. Por favor contacta al equipo de soporte.',
        false
      );

      await updateConversationState(conversationId, 'error');

      markConversationAsProcessed(conversationId);
      console.log('🚫 Error técnico. Sin etiquetado.');

      res.status(500).json({ error: 'send message failed' });
    }
  } catch (error) {
    console.error('❌ ERROR GENERAL:', error.response?.data || error.message);
    res.status(500).json({
