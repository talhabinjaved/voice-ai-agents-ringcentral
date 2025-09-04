# Medical Office AI Assistant - Sample Workflow

## Overview
This system provides an AI-powered voice assistant for medical offices that can handle common patient inquiries using speech-to-text, intent detection, and mock API integration.

## Workflow Steps

### 1. Greeting
**AI Assistant:** "Hello [Patient Name]! Thank you for calling. How can I help you today?"

### 2. Intent Capture (Speech-to-Text + NLP)
The system listens to patient requests and detects intent:
- **Appointment queries**: "appointment", "scheduled", "visit"
- **Lab results**: "lab", "test", "result"
- **Billing questions**: "bill", "payment", "invoice", "owe"
- **Transfer requests**: "transfer", "human", "representative"

### 3. API Integration (Read-Only)
Based on detected intent, the system calls mock APIs:
- `mockAPI.getAppointments(patientId)` - Fetch appointment schedule
- `mockAPI.getLabResults(patientId)` - Retrieve lab test results
- `mockAPI.getBilling(patientId)` - Get billing information

### 4. Response to Caller
The AI provides natural spoken responses:

**Appointment Example:**
- Patient: "What's my next appointment?"
- AI: "Your next appointment is 2025-01-15 at 10:30 AM with Dr. Sarah Johnson at Main Clinic, Room 102."

**Lab Results Example:**
- Patient: "Can I get my lab results?"
- AI: "Your latest Complete Blood Count from 2025-01-10 shows Normal. All values within normal range."

**Billing Example:**
- Patient: "Do I owe anything?"
- AI: "You have an outstanding balance of $150.00 for Office Visit - General Checkup, due 2025-02-01."

### 5. Fallback / Escalation
When the AI cannot handle requests:
- **Generic transfer**: "I'll connect you with a representative who can better assist you."
- **Department-specific**: 
  - Billing issues → "I'll transfer you to our billing department."
  - Scheduling → "I'll connect you with our scheduling team."
  - Lab questions → "Let me transfer you to our lab department."

## Mock Data Structure

### Patient Information
```json
{
  "id": "12345",
  "name": "John Smith", 
  "phone": "6505551234",
  "dateOfBirth": "1985-06-15"
}
```

### Appointments
```json
{
  "date": "2025-01-15",
  "time": "10:30 AM",
  "doctor": "Dr. Sarah Johnson",
  "location": "Main Clinic, Room 102",
  "type": "General Checkup"
}
```

### Lab Results
```json
{
  "testName": "Complete Blood Count",
  "date": "2025-01-10", 
  "status": "Normal",
  "notes": "All values within normal range"
}
```

### Billing
```json
{
  "invoiceNumber": "INV-2025-001",
  "amount": "$150.00",
  "dueDate": "2025-02-01",
  "description": "Office Visit - General Checkup",
  "status": "Outstanding"
}
```

## Key Features
- ✅ Natural conversation flow
- ✅ Intent detection and classification
- ✅ Mock API integration for realistic responses
- ✅ Fallback handling and escalation
- ✅ Patient identification by phone number
- ✅ Department-specific transfers
- ✅ Error handling and graceful degradation

## Usage
1. Start the system: `node index.js`
2. Call the configured RingCentral number
3. Speak naturally about appointments, lab results, or billing
4. The AI will respond with accurate information or transfer appropriately



