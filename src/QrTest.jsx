import { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

function QrTest() {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: 250 },
      false
    );

    scanner.render(
      (decodedText) => {
        // Successfully scanned a QR code
        console.log('Scanned:', decodedText);
        alert(`Scanned: ${decodedText}`);
      },
      (error) => {
        // This fires continuously while scanning (no code found yet) — ignore it
      }
    );

    // Cleanup when the component unmounts
    return () => {
      scanner.clear().catch((error) => {
        console.error('Failed to clear scanner', error);
      });
    };
  }, []);

  return (
    <div>
      <h1>QR Scanner Test</h1>
      <div id="qr-reader" style={{ width: '100%' }}></div>
    </div>
  );
}

export default QrTest;