# RingCentral AI Voice Assistant

An intelligent voice assistant built with RingCentral's telephony platform and OpenAI's Realtime API for real-time voice conversations. This system can handle customer service calls, answer questions, manage billing inquiries, and transfer calls to appropriate agents.

## Features

- 🎯 **Real-time Voice Recognition**: Uses OpenAI Whisper for accurate speech-to-text conversion
- 🤖 **Intelligent Conversation**: Powered by OpenAI GPT-4 Realtime for natural language understanding
- 📞 **Call Management**: Automatic call handling, transfer, and routing capabilities  
- 👥 **Customer Service**: Access customer information, billing details, and order history
- 🔄 **Agent Transfer**: Smart routing to appropriate departments (billing, technical support, ordering)
- 🎵 **Audio Processing**: Real-time audio conversion and processing for telephony systems

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Phone Call    │───▶│   RingCentral    │───▶│  Voice Engine   │
│   (Incoming)    │    │   Softphone      │    │   (This App)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                            ┌───────────────────────────┼───────────────────────────┐
                            │                           ▼                           │
                            │           ┌─────────────────────────────┐             │
                            │           │    RealtimeEngine          │             │
                            │           │   (OpenAI Realtime API)    │             │
                            │           │   - Speech Recognition     │             │
                            │           │   - Intent Classification  │             │
                            │           │   - Response Generation    │             │
                            │           │   - Text-to-Speech        │             │
                            │           └─────────────────────────────┘             │
                            │                           │                           │
                            │                           ▼                           │
                            │           ┌─────────────────────────────┐             │
                            │           │      PhoneEngine            │             │
                            │           │   (Call Management &        │             │
                            │           │    Business Logic)          │             │
                            │           └─────────────────────────────┘             │
                            └───────────────────────────────────────────────────────┘
```

## Prerequisites

Before setting up this project, ensure you have:

- **Node.js 20.5.1** or later
- **RingCentral Developer Account** with app credentials
- **OpenAI API Account** with API key
- **npm** package manager

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-repo/voice-ai-agents-ringcentral
   cd voice-ai-agents-ringcentral
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment configuration:**
   ```bash
   cp dotenv .env
   ```

## Configuration

### 1. RingCentral Setup

Create a RingCentral application at [developers.ringcentral.com](https://developers.ringcentral.com):

- **App type**: "Server/No UI"
- **Authorization**: "JWT auth flow"  
- **Security app scopes**: "Call Control", "Read Accounts"

Update your `.env` file with RingCentral credentials:

```env
RINGCENTRAL_SERVER_URL=https://platform.ringcentral.com
RINGCENTRAL_CLIENT_ID=Your_App_Client_Id
RINGCENTRAL_CLIENT_SECRET=Your_App_Client_Secret
RINGCENTRAL_JWT=Your_JWT_Token
```

### 2. OpenAI Configuration

Set up OpenAI API access for the Realtime API:

Update your `.env` file with OpenAI settings:

```env
GPT_API_KEY=your_openai_api_key
```

#### How to get these values:
1. Go to [OpenAI Platform](https://platform.openai.com)
2. Navigate to "API Keys" section
3. Create a new API key
4. Copy the API key to your `.env` file

**Note**: This project uses OpenAI's Realtime API which provides end-to-end voice conversation capabilities including speech recognition, intent classification, and text-to-speech.

## Data Configuration

### Customer Data Setup

Configure customer information in `customers.json`. Each customer entry should include:

```json
{
  "name": "John Smith",
  "phoneNumber": "1234567890",
  "ssn": "1234",
  "zipCode": "94123", 
  "dob": "05/17/1970",
  "billings": {
    "last": {
      "dueDate": "June 01, 2024",
      "paidDate": "May 30, 2024",
      "amount": "$249.00"
    },
    "next": {
      "dueDate": "July 01, 2024", 
      "paidDate": "",
      "amount": "$249.00"
    }
  },
  "callbackRequest": true,
  "status": "Diamond",
  "lastNote": ""
}
```

**Important**: Phone numbers should not include the plus sign (+) or country code.

### Agent Configuration  

Set up available agents in `agents.json` for call transfers:

```json
{
  "name": "technical support",
  "extensionNumber": "104",
  "extensionId": "",
  "phoneNumber": "",
  "status": "Available", 
  "waitList": []
}
```

Available departments:
- **Billing Service** (Extension 102)
- **Ordering Service** (Extension 103)  
- **Technical Support** (Extension 104)

## Usage

### Starting the Application

1. **Run the voice assistant:**
   ```bash
   npm start
   # or
   node index.js
   ```

2. **The system will:**
   - Initialize RingCentral connection
   - Set up OpenAI Realtime API connection
   - Start listening for incoming calls

### Making Test Calls

Call the RingCentral phone number associated with your application. The assistant can handle:

#### General Questions
- "What's the weather like?"
- "What's the population of San Francisco?"
- "Tell me about your services"

#### Customer Service Requests
- "I need help with my bill"
- "Can you check my account balance?"
- "When is my next payment due?"

#### Call Transfers
- "I need to speak to technical support"
- "Transfer me to billing"
- "Can I talk to someone in ordering?"

#### Account Verification
The system will ask for verification information like:
- Social Security Number (last 4 digits)
- ZIP code
- Date of birth

## Project Structure

```
voice-ai-agents-ringcentral/
├── index.js                 # Application entry point
├── phone-engine.js          # Core call management and business logic
├── realtime-engine.js       # OpenAI Realtime API integration
├── mock-data.js             # Mock API responses for testing
├── customers.json           # Customer database
├── agents.json             # Available agents for call transfer
├── package.json            # Dependencies and scripts
├── dotenv                  # Environment configuration template
└── README.md              # This documentation
```

## Key Components

### PhoneEngine (`phone-engine.js`)
- Manages RingCentral softphone integration
- Handles call states and conversation flow
- Processes customer verification
- Routes calls to appropriate agents
- Manages audio streaming and RTP packets

### RealtimeEngine (`realtime-engine.js`)  
- Integrates with OpenAI's Realtime API for end-to-end voice conversations
- Handles speech recognition using Whisper
- Processes intent classification and response generation using GPT-4
- Manages text-to-speech conversion
- Maintains conversation context and real-time audio processing

## Conversation Flow

1. **Call Initiation**: Customer calls the RingCentral number
2. **Greeting**: AI assistant welcomes the caller
3. **Intent Recognition**: System classifies the customer's request
4. **Verification**: For account-related queries, asks for verification
5. **Service Handling**: 
   - Answers general questions
   - Provides account information
   - Handles billing inquiries
6. **Transfer Logic**: Routes complex requests to appropriate agents
7. **Call Completion**: Ends call or transfers to human agent

## Troubleshooting

### Common Issues

**Connection Problems:**
- Verify RingCentral credentials are correct
- Check JWT token hasn't expired
- Ensure proper network connectivity

**Audio Issues:**
- Confirm audio permissions are granted
- Check microphone and speaker settings
- Verify RTP packet handling

**OpenAI API Errors:**
- Validate API key is correct
- Check API quota limits and billing status
- Ensure proper network connectivity to OpenAI servers

**Speech Recognition Problems:**
- Ensure clear audio input
- Check audio format compatibility
- Verify OpenAI API access and quota

### Debug Mode

Enable detailed logging by setting environment variables:
```bash
DEBUG=true node index.js
```

## Development

### Adding New Features

1. **New Intent Types**: Modify intent classification prompts in `realtime-engine.js`
2. **Customer Fields**: Update customer data structure in `customers.json`
3. **Agent Departments**: Add new agent types in `agents.json`
4. **Conversation Logic**: Extend business logic in `phone-engine.js`
5. **Model Configuration**: Update OpenAI Realtime API parameters in `realtime-engine.js`

### Testing

Test the system with various scenarios:
- Different customer verification flows
- Multiple intent types and conversations
- Call transfer scenarios
- Error handling and edge cases

## Security Considerations

- Store API keys securely using environment variables
- Implement proper customer data encryption
- Use HTTPS for all external API calls
- Validate all user inputs before processing
- Log interactions for audit purposes

## Performance Optimization

- Implement audio buffer optimization for real-time processing
- Use connection pooling for OpenAI API requests
- Cache frequently accessed customer data
- Monitor API rate limits and implement backoff strategies

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review RingCentral developer documentation
3. Consult OpenAI API documentation
4. Open an issue in this repository

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Note**: This is a demo application. For production use, implement additional security measures, error handling, and monitoring capabilities.