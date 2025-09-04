const WebSocket = require('ws');
const { EventEmitter } = require('events');
const { mockAPI } = require('./mock-data.js');

function RealtimeEngine() {
  this.ws = null;
  this.isConnected = false;
  this.conversationCallback = null;
  this.audioQueue = [];
  this.isProcessing = false;
  this.sessionId = null;
  this.conversationHistory = [];
  this.audioFormat = 'pcm16';
  this.currentPatient = null;
  
  EventEmitter.call(this);
  return this;
}

// Inherit from EventEmitter
RealtimeEngine.prototype = Object.create(EventEmitter.prototype);
RealtimeEngine.prototype.constructor = RealtimeEngine;

Object.assign(RealtimeEngine.prototype, {
  
  createRealtimeSession: function(callback, systemPrompt = null) {
    this.conversationCallback = callback;
    
    const defaultPrompt = systemPrompt || `You are a professional medical office assistant helping patients with their inquiries.

CONVERSATION STYLE:
- Keep responses brief and conversational
- Speak naturally and professionally
- Be helpful and empathetic

CAPABILITIES:
- Help patients check appointment details
- Provide lab test results information
- Answer billing questions
- Transfer to human agents when needed

IMPORTANT INSTRUCTIONS:
- When patients ask about appointments, lab results, or billing, say "Let me check that for you" then pause
- Never make up medical information or appointment details
- Always be accurate with the information provided
- If you cannot help, offer to transfer to a human agent

CONVERSATION FLOW:
1. Greet the caller warmly
2. Listen to their request
3. For specific queries (appointments/labs/billing), say you'll check their information
4. Provide accurate information or transfer to appropriate department

Stay focused on helping patients efficiently and accurately.`;
    
    this._connect(defaultPrompt);
  },

  _connect: function(systemPrompt) {
    console.log('🔄 Connecting to OpenAI Realtime API...');
    
    this.ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
      headers: {
        'Authorization': `Bearer ${process.env.GPT_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    this.ws.on('open', () => {
      console.log('✅ Connected to OpenAI Realtime API');
      this.isConnected = true;
      
      // Configure the session
      this._sendMessage({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: systemPrompt,
          voice: 'alloy',
          // Switch to mulaw end-to-end to avoid resampling latency
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5, // Balanced threshold for responsiveness
            prefix_padding_ms: 150,
            silence_duration_ms: 600 // Faster response time
          },
          tools: [],
          tool_choice: 'none',
          temperature: 0.6,
          max_response_output_tokens: 80
        }
      });
      
      if (this.conversationCallback) {
        this.conversationCallback('READY', 'Realtime API ready');
      }
      // Track audio format for downstream consumers
      this.audioFormat = 'mulaw';
    });

    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        this._handleRealtimeEvent(event);
      } catch (error) {
        console.log('Error parsing realtime message:', error.message);
      }
    });

    this.ws.on('error', (error) => {
      console.log('❌ Realtime API WebSocket error:', error.message);
      this.isConnected = false;
      if (this.conversationCallback) {
        this.conversationCallback('ERROR', error);
      }
    });

    this.ws.on('close', () => {
      console.log('🔌 Realtime API connection closed');
      this.isConnected = false;
    });
  },

  _handleRealtimeEvent: function(event) {
    console.log(`📡 Realtime event: ${event.type}`);
    
    switch (event.type) {
      case 'session.created':
        this.sessionId = event.session.id;
        console.log(`Session created: ${this.sessionId}`);
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        const userText = event.transcript.trim();
        console.log(`👤 User said: "${userText}"`);
        if (this.conversationCallback) {
          this.conversationCallback('USER_TRANSCRIPT', userText);
        }
        
        // Detect intent and handle API calls
        this._handleIntent(userText);
        break;
        
      case 'response.audio_transcript.delta':
        // AI is speaking - we can show partial transcript
        break;
        
      case 'response.audio_transcript.done':
        const aiText = event.transcript.trim();
        console.log(`🤖 AI said: "${aiText}"`);
        if (this.conversationCallback) {
          this.conversationCallback('AI_TRANSCRIPT', aiText);
        }
        break;
        
      case 'response.audio.delta':
        // Stream audio data to the call
        if (event.delta && this.conversationCallback) {
          this.conversationCallback('AUDIO_DELTA', Buffer.from(event.delta, 'base64'));
        }
        break;
        
      case 'response.done':
        console.log('🎯 AI response completed');
        if (this.conversationCallback) {
          this.conversationCallback('RESPONSE_DONE', null);
        }
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log('🎤 User started speaking');
        if (this.conversationCallback) {
          this.conversationCallback('USER_SPEAKING_STARTED', null);
        }
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log('🤐 User stopped speaking');
        if (this.conversationCallback) {
          this.conversationCallback('USER_SPEAKING_STOPPED', null);
        }
        break;
        
      case 'error':
        console.log('❌ Realtime API error:', event.error);
        if (this.conversationCallback) {
          this.conversationCallback('ERROR', event.error);
        }
        break;
    }
  },

  sendAudio: function(audioBuffer) {
    if (!this.isConnected || !this.ws) {
      console.log('⚠️ Realtime API not connected, skipping audio');
      return;
    }

    try {
      // Convert audio buffer to base64 and send
      const base64Audio = audioBuffer.toString('base64');
      this._sendMessage({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      });
    } catch (error) {
      console.log('Error sending audio to Realtime API:', error.message);
    }
  },

  sendText: function(text) {
    if (!this.isConnected || !this.ws) {
      console.log('⚠️ Realtime API not connected, skipping text');
      return;
    }

    try {
      // Add user message to conversation
      this._sendMessage({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: text
            }
          ]
        }
      });
      
      // Generate response
      this._sendMessage({
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
          instructions: 'Respond conversationally and briefly.'
        }
      });
    } catch (error) {
      console.log('Error sending text to Realtime API:', error.message);
    }
  },

  interruptAssistant: function() {
    if (!this.isConnected || !this.ws) {
      return;
    }

    try {
      this._sendMessage({
        type: 'response.cancel'
      });
      console.log('🛑 Interrupted AI response');
    } catch (error) {
      console.log('Error interrupting assistant:', error.message);
    }
  },

  closeConnection: function() {
    console.log('🔌 Closing Realtime API connection...');
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.conversationCallback = null;
    this.audioQueue = [];
    this.sessionId = null;
  },

  _sendMessage: function(message) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  },

  // Method to check verification codes
  checkPasscode: function(expectedCode) {
    // The realtime API will handle this through conversation
    // We can analyze the transcript in the callback
    return new Promise((resolve) => {
      // Set up a temporary listener for the next user transcript
      const tempCallback = this.conversationCallback;
      this.conversationCallback = (event, data) => {
        if (tempCallback) tempCallback(event, data);
        
        if (event === 'USER_TRANSCRIPT' && data) {
          // Extract numbers from the transcript
          const numbers = data.match(/\d/g);
          if (numbers) {
            const spokenCode = numbers.join('');
            const matched = spokenCode === expectedCode;
            resolve({ matched, number: spokenCode });
          } else {
            resolve({ matched: false, number: null });
          }
        }
      };
    });
  },

  // Set patient information for context
  setPatient: function(patientInfo) {
    this.currentPatient = patientInfo;
  },

  // Detect user intent and trigger appropriate API calls
  _handleIntent: async function(userText) {
    if (!this.currentPatient) return;
    
    const text = userText.toLowerCase();
    
    try {
      // Appointment queries
      if (text.includes('appointment') || text.includes('scheduled') || text.includes('visit')) {
        const appointments = await mockAPI.getAppointments(this.currentPatient.id);
        this._respondWithAppointments(appointments);
        return;
      }
      
      // Lab results queries  
      if (text.includes('lab') || text.includes('test') || text.includes('result')) {
        const labResults = await mockAPI.getLabResults(this.currentPatient.id);
        this._respondWithLabResults(labResults);
        return;
      }
      
      // Billing queries
      if (text.includes('bill') || text.includes('payment') || text.includes('invoice') || text.includes('owe')) {
        const billing = await mockAPI.getBilling(this.currentPatient.id);
        this._respondWithBilling(billing);
        return;
      }
    } catch (error) {
      console.log('Error handling intent:', error.message);
      this._respondWithError();
    }
  },

  // Generate appointment response
  _respondWithAppointments: function(appointments) {
    if (appointments.length === 0) {
      this.sendText("I don't see any upcoming appointments scheduled for you. Would you like me to transfer you to scheduling?");
      return;
    }
    
    const nextAppt = appointments[0];
    const response = `Your next appointment is ${nextAppt.date} at ${nextAppt.time} with ${nextAppt.doctor} at ${nextAppt.location}.`;
    this.sendText(response);
  },

  // Generate lab results response
  _respondWithLabResults: function(labResults) {
    if (labResults.length === 0) {
      this.sendText("I don't see any recent lab results. Would you like me to transfer you to the lab department?");
      return;
    }
    
    const latestResult = labResults[0];
    const response = `Your latest ${latestResult.testName} from ${latestResult.date} shows ${latestResult.status}. ${latestResult.notes}`;
    this.sendText(response);
  },

  // Generate billing response
  _respondWithBilling: function(billing) {
    const outstanding = billing.filter(b => b.status === 'Outstanding');
    
    if (outstanding.length === 0) {
      this.sendText("Your account is current with no outstanding balances.");
      return;
    }
    
    const bill = outstanding[0];
    const response = `You have an outstanding balance of ${bill.amount} for ${bill.description}, due ${bill.dueDate}.`;
    this.sendText(response);
  },

  // Handle API errors
  _respondWithError: function() {
    this.sendText("I'm having trouble accessing your information right now. Let me transfer you to someone who can help.");
  }
});

module.exports = RealtimeEngine;
