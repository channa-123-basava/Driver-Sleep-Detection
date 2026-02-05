import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const client = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH
);

// 🚨 Alert API
app.post("/alert", async (req, res) => {
  try {
    await client.messages.create({
      from: "whatsapp:+14155238886", // Twilio sandbox number
      to: "whatsapp:+918310292238",  // 👈 FRIEND / FAMILY WHATSAPP NUMBER
      body:
        "🚨 ALERT: Driver is sleeping continuously. Please contact immediately!",
    });

    console.log("💬 WhatsApp alert sent");
    res.json({ success: true });
  } catch (error) {
    console.error("❌ WhatsApp failed:", error.message);
    res.status(500).json({ success: false });
  }
});

app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.listen(5000, () => {
  console.log("✅ Backend running on port 5000");
});
 