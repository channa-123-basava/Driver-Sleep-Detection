import { useEffect, useRef, useState } from "react";
import * as FaceMesh from "@mediapipe/face_mesh";
import * as CameraUtils from "@mediapipe/camera_utils";
import "./App.css";

function App() {
  // 🔹 refs
  const videoRef = useRef(null);
  const audioRef = useRef(new Audio("/alarm_tone.mp3"));
  const alarmTimerRef = useRef(null);
  const emergencyTimerRef = useRef(null);

  // 🔹 states
  const [eyesClosed, setEyesClosed] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // 🚨 Send emergency alert
  const sendEmergencyAlert = async () => {
    try {
      await fetch("http://localhost:5000/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            "Driver is sleeping continuously. Please contact immediately!",
        }),
      });
      console.log("🚨 Emergency message sent");
    } catch (err) {
      console.error("Alert failed", err);
    }
  };

  // 🔔 Alarm + Emergency logic
  useEffect(() => {
    if (!audioEnabled) return;

    if (eyesClosed) {
      // Alarm after 3 seconds
      alarmTimerRef.current = setTimeout(() => {
        audioRef.current.play().catch(() => {});
      }, 3000);

      // Emergency message after 8 seconds
      emergencyTimerRef.current = setTimeout(() => {
        if (!alertSent) {
          sendEmergencyAlert();
          setAlertSent(true);
        }
      }, 8000);
    } else {
      clearTimeout(alarmTimerRef.current);
      clearTimeout(emergencyTimerRef.current);

      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setAlertSent(false);
    }

    return () => {
      clearTimeout(alarmTimerRef.current);
      clearTimeout(emergencyTimerRef.current);
    };
  }, [eyesClosed, audioEnabled]);

  // 👁️ FaceMesh + Camera
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

        // Eye landmarks
        const top = landmarks[159];
        const bottom = landmarks[145];
        const eyeDistance = Math.abs(top.y - bottom.y);

        setEyesClosed(eyeDistance < 0.01);
      }
    });

    if (videoRef.current) {
      const camera = new CameraUtils.Camera(videoRef.current, {
        onFrame: async () => {
          await faceMesh.send({ image: videoRef.current });
        },
        width: 400,
        height: 300,
      });
      camera.start();
    }
  }, []);

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Driver Sleep Detection (Final)</h2>

      {!audioEnabled && (
        <button
          onClick={() => {
            audioRef.current.play().then(() => {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
              setAudioEnabled(true);
            });
          }}
        >
          Enable Alarm
        </button>
      )}

      <br />
      <br />

      {/* CAMERA */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        width={400}
        height={300}
        style={{ border: "2px solid black" }}
      />

      <h3 style={{ color: eyesClosed ? "red" : "green" }}>
        {eyesClosed ? "Eyes Closed" : "Eyes Open"}
      </h3>

      {alertSent && (
        <h3 style={{ color: "orange" }}>
          🚨 Emergency alert sent to family
        </h3>
      )}
    </div>
  );
}

export default App;
