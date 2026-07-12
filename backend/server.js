const sendMessage = require("./services/sendMessage");

// ... keep your existing app.use(cors()), app.use(express.json()), etc.

app.post("/api/notify", async (req, res) => {
  const { message, location, timestamp } = req.body;

  const mapsLink = location
    ? `https://www.google.com/maps?q=${location.lat},${location.lng}`
    : "location unavailable";

  const body = `${message}\nTime: ${timestamp}\nLocation: ${mapsLink}`;

  try {
    await sendMessage(body);
    res.status(200).json({ ok: true, sent: true });
  } catch (err) {
    console.error("Notification failed:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});