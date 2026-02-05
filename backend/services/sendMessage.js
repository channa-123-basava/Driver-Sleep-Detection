

const twilio = require("twilio");

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

const sendMessage = async (message) => {
  return client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE,
    to: process.env.EMERGENCY_PHONE,
  });
};

module.exports = sendMessage;
