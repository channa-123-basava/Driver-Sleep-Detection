import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as FaceMesh from "@mediapipe/face_mesh";
import * as CameraUtils from "@mediapipe/camera_utils";
import axios from "axios";
import "./App.css";

const EYES_CLOSED_THRESHOLD_MS = 6000; // single trigger point for alarm + notification + SMS

function App() {
  const webcamRef = useRef(null);
  const audioRef = useRef(new Audio("/alarm_tone.mp3"));
  const closedTimerRef = useRef(null);   // setTimeout id for the 6s watch
  const alertSentRef = useRef(false);    // guarantees exactly one SMS per closure

  // ---- STATE ----
  const [eyesClosed, setEyesClosed] = useState(false);
  const [yawning, setYawning] = useState(false);
  const [fatigueScore, setFatigueScore] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [location, setLocation] = useState(null); // { lat, lng }
  const [driverName, setDriverName] = useState("");
  const [familyNumber, setFamilyNumber] = useState(""); // E.164, e.g. +919876543210
  const [alertStatus, setAlertStatus] = useState("idle"); // idle | sending | sent | failed
  const [alarmActive, setAlarmActive] = useState(false);

  audioRef.current.loop = true;

  // ---- BROWSER NOTIFICATION PERMISSION ----
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const showBrowserNotification = () => {
    if (!("Notification" in window)) return;
    const fire = () =>
      new Notification("🚨 Driver Drowsiness Alert", {
        body: "Eyes closed for 6+ seconds. Emergency contact is being notified.",
      });

    if (Notification.permission === "granted") {
      fire();
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") fire();
      });
    }
  };

  // ---- FATIGUE SCORE (display only) ----
  useEffect(() => {
    let score = 0;
    if (eyesClosed) score += 2;
    if (yawning) score += 2;
    setFatigueScore(score);
  }, [eyesClosed, yawning]);

  // ---- LIVE GPS TRACKING (Geolocation API) ----
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) =>
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => console.log("GPS error:", error.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ---- EYES-CLOSED WATCHER: fires alarm + notification + SMS exactly once ----
  useEffect(() => {
    if (eyesClosed) {
      closedTimerRef.current = setTimeout(() => {
        if (alertSentRef.current) return; // already handled this closure
        alertSentRef.current = true;
        triggerAlert();
      }, EYES_CLOSED_THRESHOLD_MS);
    } else {
      // Eyes reopened: stop alarm, clear timer, allow the next closure to alert again
      clearTimeout(closedTimerRef.current);
      alertSentRef.current = false;
      setAlarmActive(false);
      setAlertStatus("idle");
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    return () => clearTimeout(closedTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eyesClosed]);

  const triggerAlert = async () => {
    // 1. Alarm
    setAlarmActive(true);
    if (audioEnabled) {
      audioRef.current.play().catch(() => {});
    }

    // 2. Browser notification
    showBrowserNotification();

    // 3. Exactly one SMS
    if (!familyNumber || !driverName) {
      console.warn("Missing driver name or emergency phone number — SMS not sent.");
      setAlertStatus("failed");
      return;
    }
    if (!location) {
      console.warn("Location not yet available — SMS not sent.");
      setAlertStatus("failed");
      return;
    }

    setAlertStatus("sending");
    try {
      const res = await axios.post("/api/send-alert", {
        phoneNumber: familyNumber,
        driverName,
        latitude: location.lat,
        longitude: location.lng,
      });
      setAlertStatus(res.data.success ? "sent" : "failed");
    } catch (err) {
      console.error("Failed to send alert:", err);
      setAlertStatus("failed");
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

        const top = landmarks[159];
        const bottom = landmarks[145];
        setEyesClosed(Math.abs(top.y - bottom.y) < 0.01);

        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];
        setYawning(Math.abs(upperLip.y - lowerLip.y) > 0.05);
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

      <br /><br />

      <input
        type="text"
        placeholder="Driver name"
        value={driverName}
        onChange={(e) => setDriverName(e.target.value)}
        style={{ margin: "6px", padding: "6px", width: "220px" }}
      />
      <br />
      <input
        type="tel"
        placeholder="+91XXXXXXXXXX (emergency contact)"
        value={familyNumber}
        onChange={(e) => setFamilyNumber(e.target.value)}
        style={{ margin: "6px", padding: "6px", width: "220px" }}
      />

      <br /><br />

      <Webcam ref={webcamRef} audio={false} width={400} height={300} />

      <h3 style={{ color: eyesClosed ? "red" : "green" }}>
        {eyesClosed ? "😴 Eyes Closed" : "👀 Eyes Open"}
      </h3>
      <h3>😮 Yawning: {yawning ? "Yes" : "No"}</h3>
      <h3>📊 Fatigue Score: {fatigueScore}</h3>

      <h3 style={{ color: alarmActive ? "red" : "green" }}>
        {alarmActive ? "🚨 ALARM: Wake up!" : "✅ Normal"}
      </h3>

      {alertStatus !== "idle" && (
        <p>
          Emergency SMS:{" "}
          {alertStatus === "sending"
            ? "Sending..."
            : alertStatus === "sent"
            ? "✅ Sent to emergency contact"
            : "❌ Failed to send"}
        </p>
      )}

      {location && (
        <div>
          <h4>📍 Live Location</h4>
          <p>Latitude: {location.lat}</p>
          <p>Longitude: {location.lng}</p>
          <a
            href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
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