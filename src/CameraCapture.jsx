import { useEffect, useRef, useState } from 'react';

function CameraCapture({ onCapture, capturing, label = 'Capture Photo' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      } catch (err) {
        setCameraError('Could not access camera: ' + err.message);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const maxDimension = 1024;
    let { videoWidth: width, videoHeight: height } = video;

    if (width > height && width > maxDimension) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else if (height > maxDimension) {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64 = dataUrl.split(',')[1];
    onCapture(base64);
  };

  return (
    <div>
      {cameraError && <p style={{ color: 'red' }}>{cameraError}</p>}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', borderRadius: '4px', background: '#000' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <button
        onClick={handleCapture}
        disabled={!ready || capturing}
        style={{ marginTop: '0.75rem', width: '100%', padding: '0.75rem', fontWeight: 'bold' }}
      >
        {capturing ? 'Analyzing photo...' : `📷 ${label}`}
      </button>
    </div>
  );
}

export default CameraCapture;