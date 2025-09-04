const PhoneEngine = require('./phone-engine.js')

async function start(){
  try {
    var phoneEngine = new PhoneEngine()
    await phoneEngine.initializePhoneEngine()
    console.log("🎉 Voice AI agent is ready and listening for calls!")
  } catch (error) {
    console.error("❌ Failed to start the voice AI agent:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Gracefully shutting down voice AI agent...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

start()
