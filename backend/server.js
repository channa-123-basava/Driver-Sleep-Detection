const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sendMessage = require("./services/sendMessage");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/send-alert", async (req, res) => {
  const { phoneNumber, driverName, latitude, longitude } = req.body;

  if (!phoneNumber || !driverName || latitude == null || longitude == null) {
    return res.status(400).json({
      success: false,
      error: "phoneNumber, driverName, latitude, and longitude are all required.",
    });
  }

  try {
    const result = await sendMessage({ phoneNumber, driverName, latitude, longitude });
    return res.status(200).json({
      success: true,
      message: "Alert SMS sent successfully.",
      sid: result.sid,
    });
  } catch (err) {
    console.error("Failed to send SMS alert:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to send SMS alert.",
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));