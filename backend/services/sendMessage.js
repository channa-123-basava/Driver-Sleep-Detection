const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

/**
 * Sends the drowsiness alert SMS to the given emergency contact.
 * @param {{ phoneNumber: string, driverName: string, latitude: number, longitude: number }} payload
 */
const sendMessage = async ({ phoneNumber, driverName, latitude, longitude }) => {
  const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;

  const body = `🚨 DRIVER DROWSINESS ALERT
Driver: ${driverName}
The driver's eyes have remained closed for more than 6 seconds.
Current Location:
${mapsLink}
Please contact the driver immediately.`;

  return client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phoneNumber,
  });
};

module.exports = sendMessage;