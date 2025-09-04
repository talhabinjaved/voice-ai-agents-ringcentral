require('dotenv').config()
const fs = require('fs')
const RtpPacket = require('werift-rtp')
const Softphone = require('ringcentral-softphone').default
const RealtimeEngine = require('./realtime-engine.js');
const RingCentral = require('@ringcentral/sdk').SDK
const { mockAPI } = require('./mock-data.js');


var MAXBUFFERSIZE = 160 * 25  // Reduced buffer size for lower latency

const rcsdk = new RingCentral({
  server: process.env.RINGCENTRAL_SERVER_URL,
  clientId: process.env.RINGCENTRAL_CLIENT_ID,
  clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET
})

var platform = rcsdk.platform();

// Simplified phone system for medical office AI assistant

let blockedNumbers = [
    "234567890",
    "2092841212",
    "6505131145"
]

function PhoneEngine() {
  this.softphone = null
  this.customersList = []
  this.agentsList = []
  return this
}

PhoneEngine.prototype = {
  initializePhoneEngine: async function(){
    try {
      var deviceInfo = await this.readPhoneSettings()
      if (deviceInfo) {
        this.softphone = new Softphone({
          domain: deviceInfo.domain,
          username: deviceInfo.username,
          password: deviceInfo.password,
          authorizationId: deviceInfo.authorizationId,
          codec: 'PCMU/8000' // Use PCMU/8000 for direct mulaw compatibility
        });
      }

      if (this.softphone){
        console.log("Has been initialized")
      }else{
        console.log("SP initialization failed")
        return
      }

      if (process.env.NODE_ENV === 'development') {
        this.softphone.enableDebugMode();
      }

      try {
        await this.softphone.register();
        console.log("✅ Softphone registered successfully")
      }catch(e){
        console.log("FAILED REGISTER:", e)
        throw e
      }

      this.setupEventHandlers();
    } catch (error) {
      console.log("Error during phone engine initialization:", error.message);
      throw error;
    }
  },

  setupEventHandlers: function() {
    if (!this.softphone) return;

    this.softphone.on('invite', async (inviteMessage) => {
      console.log('📞 Incoming call received');
      await this.handleIncomingCall(inviteMessage);
    });
  },

  handleIncomingCall: async function(inviteMessage) {
    try {
      await this.readCustomersList()
      await this.readAgentsList()
      console.log("SIP Invite")
      var header = inviteMessage.headers['Contact']
      var fromNumber = header.substring(5, header.indexOf('@'))

      // answer the call
      var callSession = await this.softphone.answer(inviteMessage);

      // detect blocked caller
      if (this.isBlockedCaller(fromNumber)){
        console.log("known blocked number => terminate the call immediately")
        callSession.hangup()
        return
      }
      var activeCall = await this.createActiveCall(callSession, fromNumber)

      // Create Realtime AI conversation engine
      activeCall.realtimeEngine.createRealtimeSession((event, data) => {
          if (event == "READY") {
            activeCall.realtimeEngineReady = true
            console.log("🤖 Realtime AI conversation engine ready!")
            
            // Start the conversation based on caller status
            if (activeCall.screeningStatus === "verified") {
              this.startVerifiedConversation(activeCall)
            } else {
              this.startSecurityVerification(activeCall)
            }
          } else if (event == "ERROR"){
            console.log("❌ Realtime AI engine failed:", data)
          } else if (event == "USER_TRANSCRIPT"){
            this.handleUserInput(activeCall, data)
          } else if (event == "AI_TRANSCRIPT"){
          } else if (event == "AUDIO_DELTA"){
            // Stream AI audio response to the call
            this.streamAudioToCall(activeCall, data)
          } else if (event == "USER_SPEAKING_STARTED"){
            // User started speaking - can interrupt AI if needed
            if (activeCall.isAISpeaking) {
              activeCall.realtimeEngine.interruptAssistant()
              activeCall.isAISpeaking = false
              if (activeCall.speechStreamer && !activeCall.speechStreamer.finished && typeof activeCall.speechStreamer.stop === 'function') {
                activeCall.speechStreamer.stop()
              }
              if (activeCall.audioFlushTimer) {
                clearTimeout(activeCall.audioFlushTimer)
                activeCall.audioFlushTimer = null
              }
              activeCall.aiAudioBuffer = []
              activeCall.queuedAudioBuffers = []
            }
          } else if (event == "RESPONSE_DONE"){
            // Flush any remaining audio chunks
            if (activeCall.aiAudioBuffer && activeCall.aiAudioBuffer.length > 0) {
              setTimeout(() => this.flushAudioBuffer(activeCall), 100);
            }
          }
      })

      activeCall.callSession.on('audioPacket', (rtpPacket) => {
          try {
            if (!rtpPacket || !rtpPacket.payload || rtpPacket.payload.length === 0) {
              return;
            }
            
            // Send mulaw audio directly to Realtime API (no conversion)
            if (activeCall.realtimeEngineReady && activeCall.realtimeEngine) {
              const mulawBuffer = Buffer.from(rtpPacket.payload);
              
              if (mulawBuffer.length === 0) return;
              
              // Noise gate disabled
              const cleanedMulaw = mulawBuffer;
              
              if (cleanedMulaw && cleanedMulaw.length > 0) {
                activeCall.realtimeEngine.sendAudio(cleanedMulaw);
              }
            }
          } catch (error) {
            console.log('Error processing audio packet:', error.message);
          }
      });

      // receive DTMF
      activeCall.callSession.on('dtmf', (digit) => {
        console.log('dtmf', digit);
        this.handleDTMFResponse(activeCall, digit)
      });

      // Either the agent or the customer hang up
      activeCall.callSession.once('disposed', () => {
        console.log("RECEIVE BYE MESSAGE => Hanged up now for this channel:")
        activeCall.isConnected = false
        activeCall.realtimeEngine.closeConnection()
        activeCall = null
      });
    } catch (error) {
      console.error('Error handling incoming call:', error);
      await this.softphone.decline(inviteMessage);
    }
  },
  login: async function(){
    var loggedIn = await platform.loggedIn()
    if (loggedIn){
      console.log("Still logged in => good to call APIs")
    }else{
      await platform.login({jwt: process.env.RINGCENTRAL_JWT})
    }
  },
  readAgentsList: function(){
    this.agentsList = JSON.parse(fs.readFileSync('./agents.json', 'utf8'))
  },
  readCustomersList: function(){
    this.customersList = JSON.parse(fs.readFileSync('./customers.json', 'utf8'))
  },
  identifyCallerByPhoneNumber: function(phoneNumber){
    let customer = this.customersList.find(o => o.phoneNumber === phoneNumber)
    return customer
  },
  isBlockedCaller: function(fromNumber){
    let blocked = blockedNumbers.includes(fromNumber)
    return (blocked) ? true : false
  },
  createActiveCall: async function(callSession, fromNumber){
    let customer = this.identifyCallerByPhoneNumber(fromNumber)
    var activeCall = {
      fromNumber: fromNumber,
      callSession: callSession,
      telSessionId: "",
      partyId: "",
      transcript: "",
      dtmf: "",
      delayTimer: null,
      assignedAgent: null,
      speechStreamer: null,
      realtimeEngine: new RealtimeEngine(),
      realtimeEngineReady: false,
      isAISpeaking: false,
      aiAudioBuffer: [],
      audioFlushTimer: null,
      screeningStatus: 'verified', // "robocall_defend" || "verified"
      passCode: "",
      customerInfo: customer,
      screeningFailedCount: 0,
      maxScreeningFailedCount: 3
    }
    // Always start with verified status for testing - remove robocall defense for now
    activeCall.screeningStatus = "verified"
    // if (customer){ // known number
    //   activeCall.screeningStatus = "verified"
    // }else{ // unknown number => turn on robocall_defend mode
    //   activeCall.screeningStatus = "robocall_defend"
    //   activeCall.passCode = makePassCode()
    // }
    // Initial greeting will be handled by RealtimeEngine callback

    await this.getCallInfo(activeCall)
    return activeCall
  },
  handleDTMFResponse: async function(activeCall, digit){
    switch (activeCall.screeningStatus) {
      case "robocall_defend":
        activeCall.dtmf += digit
        if (activeCall.dtmf.length >= 4){
          if (activeCall.dtmf == activeCall.passCode){
            activeCall.screeningFailedCount = 0
            activeCall.dtmf = ""
            activeCall.screeningStatus = "verified"
            await this.playInlineResponse(activeCall, `Thank you for your verification! I can help answer your questions relating to our products and services. I can also forward your call to a proper team or a person if you tell me what you need to do.`)
          }else{
            // reject this call
            console.log("Reject this call after max failure times")
            activeCall.screeningFailedCount++
            activeCall.dtmf = ""
            if (activeCall.screeningFailedCount >= activeCall.maxScreeningFailedCount){
              console.log("Reject and hangup")
              activeCall.callSession.hangup()
            }else{
              this.playInlineResponse(activeCall, `Sorry, the passcode is incorrect. Can you repeat the number ${activeCall.passCode}?`)
            }
          }
        }
        break
      default:
        break
    }
  },
  // Note: Old conversation methods removed - now handled by Realtime API
  startVerifiedConversation: async function(activeCall) {
    // Look up patient information by phone number
    const patient = await mockAPI.getPatientByPhone(activeCall.fromNumber);
    if (patient) {
      activeCall.realtimeEngine.setPatient(patient);
    }
    
    const greeting = patient 
      ? `Hello ${patient.name}! Thank you for calling. How can I help you today?`
      : `Hello! Thank you for calling. How can I help you today?`;
      
    activeCall.realtimeEngine.sendText(greeting);
    activeCall.isAISpeaking = true;
  },

  startSecurityVerification: function(activeCall) {
    const securityPrompt = `Hello! For security, please say this 4-digit code: ${activeCall.passCode.split('').join(', ')}`;
    activeCall.realtimeEngine.sendText(securityPrompt);
    activeCall.isAISpeaking = true;
  },

  handleUserInput: function(activeCall, transcript) {
    if (activeCall.screeningStatus === "robocall_defend") {
      // Check if user said the passcode
      const numbers = transcript.match(/\d/g);
      if (numbers) {
        const spokenCode = numbers.join('');
        if (spokenCode === activeCall.passCode) {
          activeCall.screeningStatus = "verified";
          activeCall.realtimeEngine.sendText("Thank you! How can I help you today?");
          activeCall.isAISpeaking = true;
        } else {
          activeCall.screeningFailedCount++;
          if (activeCall.screeningFailedCount >= activeCall.maxScreeningFailedCount) {
            activeCall.callSession.hangup();
          } else {
            activeCall.realtimeEngine.sendText(`Sorry, that's not correct. Please say: ${activeCall.passCode.split('').join(', ')}`);
            activeCall.isAISpeaking = true;
          }
        }
      }
    } else if (activeCall.screeningStatus === "verified") {
      // Check for transfer requests
      const text = transcript.toLowerCase();
      if (text.includes('transfer') || text.includes('human') || text.includes('representative') || text.includes('person')) {
        this.handleTransferRequest(activeCall, transcript);
      }
    }
  },

  // Handle transfer requests
  handleTransferRequest: function(activeCall, transcript) {
    const text = transcript.toLowerCase();
    
    // Determine which department based on context
    if (text.includes('billing') || text.includes('payment')) {
      activeCall.realtimeEngine.sendText("I'll transfer you to our billing department. Please hold on.");
      // Mock transfer - in real implementation, would call blindTransferCall with billing extension
      setTimeout(() => {
        console.log("📞 Mock transfer to billing department (ext 103)");
      }, 2000);
    } else if (text.includes('schedule') || text.includes('appointment')) {
      activeCall.realtimeEngine.sendText("I'll connect you with our scheduling team. One moment please.");
      setTimeout(() => {
        console.log("📞 Mock transfer to scheduling department (ext 102)");
      }, 2000);
    } else if (text.includes('lab') || text.includes('test')) {
      activeCall.realtimeEngine.sendText("Let me transfer you to our lab department. Please hold.");
      setTimeout(() => {
        console.log("📞 Mock transfer to lab department (ext 104)");
      }, 2000);
    } else {
      activeCall.realtimeEngine.sendText("I'll connect you with a representative who can better assist you. Please hold.");
      setTimeout(() => {
        console.log("📞 Mock transfer to general support");
      }, 2000);
    }
  },

  streamAudioToCall: function(activeCall, audioBuffer) {
    try {
      if (!activeCall.callSession || activeCall.callSession.disposed) {
        return;
      }
      
      // With mulaw end-to-end, audioBuffer is already mulaw bytes from Realtime API
      const mulawBuffer = audioBuffer;
      
      if (!mulawBuffer || mulawBuffer.length === 0) {
        console.log('⚠️ Empty mulaw buffer, skipping audio chunk');
        return;
      }
      
      // Accumulate audio chunks for smoother playback
      if (!activeCall.aiAudioBuffer) {
        activeCall.aiAudioBuffer = [];
      }
      
      activeCall.aiAudioBuffer.push(mulawBuffer);
      
      // Accumulate audio chunks before streaming to avoid cutting off speech
      if (activeCall.aiAudioBuffer.length >= 5) { // Wait for more chunks
        this.flushAudioBuffer(activeCall);
      } else if (activeCall.aiAudioBuffer.length === 1) {
        // Start a timer to flush after a delay
        if (activeCall.audioFlushTimer) {
          clearTimeout(activeCall.audioFlushTimer);
        }
        activeCall.audioFlushTimer = setTimeout(() => {
          if (activeCall.aiAudioBuffer && activeCall.aiAudioBuffer.length > 0) {
            this.flushAudioBuffer(activeCall);
          }
        }, 500); // Wait 500ms to accumulate more audio
      }
      
    } catch (error) {
      console.log('Error streaming AI audio to call:', error.message);
    }
  },

  attachAudioStreamHandlers: function(activeCall) {
    if (activeCall.speechStreamer && typeof activeCall.speechStreamer.on === 'function') {
      activeCall.speechStreamer.on('finished', () => {
        console.log('🎵 AI audio streaming completed');
        activeCall.isAISpeaking = false;
        
        // Process queued audio buffers first
        if (activeCall.queuedAudioBuffers && activeCall.queuedAudioBuffers.length > 0) {
          console.log(`📋 Playing queued audio: ${activeCall.queuedAudioBuffers.length} chunks`);
          const nextBuffer = activeCall.queuedAudioBuffers.shift();
          activeCall.speechStreamer = activeCall.callSession.streamAudio(nextBuffer);
          activeCall.isAISpeaking = true;
          // Re-attach the finished handler for the next chunk
          this.attachAudioStreamHandlers(activeCall);
          return;
        }
        
        // Then process any remaining audio chunks in buffer
        if (activeCall.aiAudioBuffer && activeCall.aiAudioBuffer.length > 0) {
          setTimeout(() => this.flushAudioBuffer(activeCall), 50);
        }
      });
      
      activeCall.speechStreamer.on('error', (error) => {
        console.log('❌ Audio streaming error:', error.message);
        activeCall.isAISpeaking = false;
        
        // Reset the speech streamer state
        activeCall.speechStreamer = null;
      });
    } else {
      // Fallback if speech streamer doesn't support events
      setTimeout(() => {
        activeCall.isAISpeaking = false;
      }, 1000); // Estimate completion time
    }
  },

  flushAudioBuffer: function(activeCall) {
    try {
      if (!activeCall.aiAudioBuffer || activeCall.aiAudioBuffer.length === 0) {
        return;
      }
      
      // Clear any pending flush timer
      if (activeCall.audioFlushTimer) {
        clearTimeout(activeCall.audioFlushTimer);
        activeCall.audioFlushTimer = null;
      }
      
      // Concatenate all audio chunks
      const combinedBuffer = Buffer.concat(activeCall.aiAudioBuffer);
      activeCall.aiAudioBuffer = [];
      
      // Validate combined buffer before streaming
      if (combinedBuffer.length === 0) {
        console.log('⚠️ Empty combined audio buffer, skipping');
        return;
      }
      
      console.log(`🎵 Streaming ${combinedBuffer.length} bytes of AI audio to call`);
      
      // DON'T stop existing audio - let it complete to avoid cutting off speech
      // Only start new audio if no audio is currently playing
      if (!activeCall.speechStreamer || activeCall.speechStreamer.finished) {
        console.log(`🎵 Starting new audio stream: ${combinedBuffer.length} bytes`);
        activeCall.speechStreamer = activeCall.callSession.streamAudio(combinedBuffer);
        activeCall.isAISpeaking = true;
      } else {
        // If audio is already playing, queue this buffer for later
        console.log(`📋 Queueing audio chunk for later: ${combinedBuffer.length} bytes`);
        if (!activeCall.queuedAudioBuffers) {
          activeCall.queuedAudioBuffers = [];
        }
        activeCall.queuedAudioBuffers.push(combinedBuffer);
        return; // Exit early, don't set up event listeners again
      }
      
      this.attachAudioStreamHandlers(activeCall);
      
    } catch (error) {
      console.log('Error flushing audio buffer:', error.message);
      activeCall.isAISpeaking = false;
      if (activeCall.speechStreamer) {
        activeCall.speechStreamer = null;
      }
    }
  },

  playInlineResponse: async function(activeCall, message){
    if (activeCall.speechStreamer && !activeCall.speechStreamer.finished){
      console.log("playInlineResponse Overlapping => Must stop")
      activeCall.speechStreamer.stop()
    }
    
    try {
      var buf = await activeCall.assistantEngine.getSpeech(message)
      
      // Validate the buffer before streaming
      if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
        console.log('Invalid or empty audio buffer received, skipping audio streaming');
        // Create a minimal mock streamer
        activeCall.speechStreamer = {
          finished: true,
          stop: function() { this.finished = true; },
          on: function() { /* mock event handler */ }
        };
        return;
      }
      
      console.log(`Streaming audio buffer of ${buf.length} bytes`);
      activeCall.speechStreamer = activeCall.callSession.streamAudio(buf);
      
      // Verify the streamer was created properly
      if (!activeCall.speechStreamer) {
        console.log('streamAudio returned null/undefined, creating mock streamer');
        activeCall.speechStreamer = {
          finished: true,
          stop: function() { this.finished = true; },
          on: function() { /* mock event handler */ }
        };
        return;
      }
      
      // Check if speechStreamer has the expected properties/methods
      if (typeof activeCall.speechStreamer.on === 'function') {
        // Handle stream events
        activeCall.speechStreamer.on('error', (error) => {
          console.log('Speech streaming error:', error.message);
        });
        
        activeCall.speechStreamer.on('finished', () => {
          console.log('Speech streaming completed');
        });
      } else {
        console.log('Warning: speechStreamer does not have event handling capabilities');
      }
      
      // Ensure required properties exist
      if (typeof activeCall.speechStreamer.finished === 'undefined') {
        activeCall.speechStreamer.finished = false;
      }
      if (typeof activeCall.speechStreamer.stop !== 'function') {
        activeCall.speechStreamer.stop = function() {
          this.finished = true;
        };
      }
      
    } catch (error) {
      console.log('Error in playInlineResponse:', error.message);
      // Create a minimal mock streamer to prevent further errors
      activeCall.speechStreamer = {
        finished: true,
        stop: function() { this.finished = true; },
        on: function() { /* mock event handler */ }
      };
    }
  },
  getCallInfo: async function(activeCall){
    try {
      await platform.login({jwt: process.env.RINGCENTRAL_JWT})
      let endpoint = "/restapi/v1.0/account/~/extension/~/active-calls"
      var resp = await platform.get(endpoint, {view: "Detailed"})
      var jsonObj = await resp.json()
      for (var record of jsonObj.records){
        if (record.result == "In Progress"){
          for (var leg of record.legs){
            if (leg.direction == "Inbound"){
              if (leg.from.phoneNumber.indexOf(activeCall.fromNumber) >= 0){
                activeCall.telSessionId = leg.telephonySessionId
                activeCall.partyId = await this.getCallSessionInfo(activeCall, record.telephonySessionId)
                return
              }
            }
          }
        }
      }
    }catch(e){
      console.log(e.message)
    }
  },
  getCallSessionInfo: async function(activeCall, telSessionId){
    try {
      let endpoint = `/restapi/v1.0/account/~/telephony/sessions/${telSessionId}`
      var resp = await platform.get(endpoint)
      var jsonObj = await resp.json()
      for (var party of jsonObj.parties){
        if (party.direction == "Inbound"){
            return party.id
        }
      }
    }catch(e){
      console.log(e.message)
    }
  },
  blindTransferCall: async function(activeCall){
    console.log("blindTransferCall")
    var endpoint = `/restapi/v1.0/account/~/telephony/sessions/${activeCall.telSessionId}/parties/${activeCall.partyId}/transfer`
    try{
      let bodyParams = {
        extensionNumber : activeCall.assignedAgent.extensionNumber
      }
      await this.login()
      var resp = await platform.post(endpoint, bodyParams)
      var jsonObj = await resp.json()
      console.log("Call transferred => Hang up this call.")
      activeCall.callSession.hangup()
    }catch(e){
      console.log(e.message)
      await this.playInlineResponse(activeCall, "Sorry, I can't transfer your call right now.")
    }
  },
  readPhoneSettings: async function() {
    console.log("readPhoneSettings")
    await this.login()
    try {
          let deviceInfo = {
            username: process.env.SIP_USERNAME,
            password: process.env.SIP_PASSWORD,
            authorizationId: process.env.SIP_AUTHORIZATION_ID,
            domain: process.env.SIP_DOMAIN
          }
          return deviceInfo
    }catch(e) {
        console.error(e.message);
    }
  }
}
module.exports = PhoneEngine;

const sleep = async (ms) => {
  await new Promise(r => setTimeout(r, ms));
}

function makePassCode() {
  var code = "";
  var possible = "0123456789";
  for (var i = 1; i < 5; i++){
    code += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return code;
}
