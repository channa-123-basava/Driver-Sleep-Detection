import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as FaceMesh from "@mediapipe/face_mesh";
import * as CameraUtils from "@mediapipe/camera_utils";
import axios from "axios";
import "./App.css";

const ALARM_THRESHOLD_MS = 3000;   // eyes closed >3s -> alarm starts
const NOTIFY_THRESHOLD_MS = 6000;  // eyes closed >6s -> notify family/friends

function App() {
  const webcamRef = useRef(null);
  const audioRef = useRef(new Audio("/alarm_tone.mp3"));
  const closedSinceRef = useRef(null);   // timestamp when eyes first closed
  const notifiedRef = useRef(false);     // prevents duplicate notifications per closure
  const tickRef = useRef(null);          // interval id for the closed-eye timer

  // ---- STATE ----
  const [eyesClosed, setEyesClosed] = useState(false);
  const [yawning, setYawning] = useState(false);
  const [fatigueScore, setFatigueScore] = useState(0);
  const [alertLevel, setAlertLevel] = useState(0); // 0 normal,2 warning(yawn/blink),3 alarm,4 notified
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [closedDuration, setClosedDuration] = useState(0);
  const [location, setLocation] = useState(null);
  const [notifyStatus, setNotifyStatus] = useState("idle"); // idle | sending | sent | failed
  const [familyNumber, setFamilyNumber] = useState(""); // e.g. +919876543210

  // alarm should loop until eyes reopen
  audioRef.current.loop = true;

  // ---- ASK PERMISSION FOR BROWSER/DESKTOP NOTIFICATIONS ----
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const showBrowserNotification = () => {
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
      new Notification("🚨 Driver Alert", {
        body: "Eyes closed for over 6 seconds — family has been notified.",
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          new Notification("🚨 Driver Alert", {
            body: "Eyes closed for over 6 seconds — family has been notified.",
          });
        }
      });
    }
  };

  // ---- FATIGUE SCORE ----
  useEffect(() => {
    let score = 0;
    if (eyesClosed) score += 2;
    if (yawning) score += 2;
    setFatigueScore(score);

    if (!eyesClosed) {
      // baseline level from yawning alone when eyes are open
      setAlertLevel(yawning ? 2 : 0);
    }
  }, [eyesClosed, yawning]);

  // ---- LIVE GPS TRACKING ----
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => console.log("GPS error:", error.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ---- EYES-CLOSED TIMER: drives alarm + notification ----
  useEffect(() => {
    if (eyesClosed) {
      if (!closedSinceRef.current) closedSinceRef.current = Date.now();

      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - closedSinceRef.current;
        setClosedDuration(elapsed);

        // >3s: alarm rings, keeps ringing until eyes open
        if (elapsed >= ALARM_THRESHOLD_MS) {
          setAlertLevel((prev) => (prev < 4 ? 3 : prev));
          if (audioEnabled && audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
          }
        }

        // >6s continuous: notify family/friends once per closure
        if (elapsed >= NOTIFY_THRESHOLD_MS && !notifiedRef.current) {
          notifiedRef.current = true;
          setAlertLevel(4);
          sendNotification();
        }
      }, 200);
    } else {
      // eyes reopened -> stop everything and reset for the next closure
      clearInterval(tickRef.current);
      closedSinceRef.current = null;
      notifiedRef.current = false;
      setClosedDuration(0);
      setNotifyStatus("idle");
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eyesClosed, audioEnabled]);

  const sendNotification = async () => {
    showBrowserNotification(); // fires instantly, local popup, doesn't depend on backend

    setNotifyStatus("sending");
    try {
      // Requires the /api/notify route in backend/server.js (Twilio) to actually text the family number.
      await axios.post("/api/notify", {
        message: "Driver has had eyes closed for over 6 seconds — possible fatigue/asleep.",
        location,
        timestamp: new Date().toISOString(),
        phoneNumber: familyNumber,
      });
      setNotifyStatus("sent");
    } catch (err) {
      console.error("Failed to send notification:", err);
      setNotifyStatus("failed");
    }
  };

  // ---- FACE MESH: eye + yawn detection ----
  useEffect(() => {
    const faceMesh = new FaceMesh.FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks?.length) {
        const landmarks = results.multiFaceLandmarks[0];

        // Eyes
        const top = landmarks[159];
        const bottom = landmarks[145];
        const eyeDistance = Math.abs(top.y - bottom.y);
        setEyesClosed(eyeDistance < 0.01);

        // Yawn
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];
        const mouthDistance = Math.abs(upperLip.y - lowerLip.y);
        setYawning(mouthDistance > 0.05);
      }
    });

    let camera;
    if (webcamRef.current?.video) {
      camera = new CameraUtils.Camera(webcamRef.current.video, {
        onFrame: async () => {
          await faceMesh.send({ image: webcamRef.current.video });
        },
        width: 400,
        height: 300,
      });
      camera.start();
    }

    return () => {
      camera?.stop();
      faceMesh.close();
    };
  }, []);

  const enableAudio = () => {
    audioRef.current
      .play()
      .then(() => {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setAudioEnabled(true);
      })
      .catch(() => setAudioEnabled(true));
  };

  return (
    <div style={{ textAlign: "center", fontFamily: "sans-serif" }}>
      <h2>🚗 Smart Driver Monitoring System</h2>

      {!audioEnabled && <button onClick={enableAudio}>Enable Alarm</button>}

      <br />
      <br />

      <input
        type="tel"
        placeholder="+91XXXXXXXXXX (family number)"
        value={familyNumber}
        onChange={(e) => setFamilyNumber(e.target.value)}
        style={{ margin: "10px", padding: "6px", width: "220px" }}
      />

      <br />

      <Webcam ref={webcamRef} audio={false} width={400} height={300} />

      <h3 style={{ color: eyesClosed ? "red" : "green" }}>
        {eyesClosed ? "😴 Eyes Closed" : "👀 Eyes Open"}
      </h3>

      <h3>😮 Yawning: {yawning ? "Yes" : "No"}</h3>

      <h3>📊 Fatigue Score: {fatigueScore}</h3>

      {eyesClosed && (
        <h4>⏱️ Eyes closed for: {(closedDuration / 1000).toFixed(1)}s</h4>
      )}

      <h3
        style={{
          color:
            alertLevel === 4
              ? "darkred"
              : alertLevel === 3
              ? "red"
              : alertLevel === 2
              ? "orange"
              : "green",
        }}
      >
        {alertLevel === 4
          ? "🚨🚨 CRITICAL: Family/friends notified!"
          : alertLevel === 3
          ? "🚨 DANGER: Wake up!"
          : alertLevel === 2
          ? "⚠️ Warning: You look tired"
          : "✅ Normal"}
      </h3>

      {notifyStatus !== "idle" && (
        <p>
          Notification status:{" "}
          {notifyStatus === "sending"
            ? "Sending..."
            : notifyStatus === "sent"
            ? "✅ Sent to family/friends"
            : "❌ Failed to send"}
        </p>
      )}

      {location && (
        <div>
          <h4>📍 Live Location</h4>
          <p>Latitude: {location.lat}</p>
          <p>Longitude: {location.lng}</p>
          <a
            href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Google Maps
          </a>
        </div>
      )}
    </div>
  );
}

export default App;