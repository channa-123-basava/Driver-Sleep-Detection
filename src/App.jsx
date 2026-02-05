import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as FaceMesh from "@mediapipe/face_mesh";
import * as CameraUtils from "@mediapipe/camera_utils";
import "./App.css";


function App() { // main react function
  const webcamRef = useRef(null);
  const audioRef = useRef(new Audio("/alarm_tone.mp3")); // creates alarm sound
  const timerRef = useRef(null);
  // state variables.
  // true → eyes closed
  // false → eyes open
  const [eyesClosed, setEyesClosed] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // 🔔 TIMER + ALARM (already proven working)
  //  Runs whenever eyesClosed or audioEnabled changes
  //“If eyes stay closed continuously for 3 seconds, play alarm.
  // If eyes open at any moment, cancel everything.”
  useEffect(() => {
    if (!audioEnabled) return;
    if (eyesClosed) {
      timerRef.current = setTimeout(() => {
        audioRef.current.play().catch(() => {});
      }, 3000);  // 3 sec.
    } else {
      clearTimeout(timerRef.current);
      audioRef.current.pause();  //Stops alarm immediately if playing
      audioRef.current.currentTime = 0; //Resets alarm to beginning
    }
// this is a cleanup function. 
// React calls this automatically when:
// Before the effect runs again
// When the component unmounts
    return () => clearTimeout(timerRef.current);  
  }, [eyesClosed, audioEnabled]); // runs this effect when : eyesClosed changes  OR audioEnabled changes

  // 👁️ AI EYE DETECTION (AUTOMATIC)
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

        // 👁️ Eye landmarks
        const top = landmarks[159];
        const bottom = landmarks[145];

        const eyeDistance = Math.abs(top.y - bottom.y);

        // 👀 Threshold (tweak if needed)
        if (eyeDistance < 0.01) {
          setEyesClosed(true);
        } else {
          setEyesClosed(false);
        }
      }
    });

    if (webcamRef.current?.video) {
      const camera = new CameraUtils.Camera(webcamRef.current.video, {
        onFrame: async () => {
          await faceMesh.send({
            image: webcamRef.current.video,
          });
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

      <br /><br />

      <Webcam
        ref={webcamRef}
        audio={false}
        width={400}
        height={300}
      />

      <h3 style={{ color: eyesClosed ? "red" : "green" }}>
        {eyesClosed ? "Eyes Closed" : "Eyes Open"}
      </h3>
    </div>
  );
}

export default App;
