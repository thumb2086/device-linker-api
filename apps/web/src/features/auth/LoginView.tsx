import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';

export default function LoginView() {
  const { setAuth } = useAuthStore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    // 1. Create pending session
    fetch('/api/v1/auth/create-session', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setSessionId(data.data.sessionId);
        // Mock QR code for now
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=dlinker://login?sessionId=${data.data.sessionId}`);
      });
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    // 2. Poll status
    const interval = setInterval(() => {
      fetch(`/api/v1/auth/status?sessionId=${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.data.status === 'authorized') {
            setAuth(data.data.address, sessionId, data.data.publicKey || '0x');
          }
        });
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId, setAuth]);

  const handleBypass = async () => {
      const address = "0x550e8400e29b41d4a716446655440000";
      const res = await fetch('/api/v1/auth/login/managed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, key: 'mock' })
      });
      const data = await res.json();
      if (data.success) {
          setAuth(address, data.data.sessionId, '0x');
      }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-6 p-12 bg-white rounded-2xl shadow-xl max-w-md mx-auto mt-20">
      <h2 className="text-3xl font-bold text-slate-800">Device Linker Login</h2>
      <p className="text-slate-500 text-center">Scan the QR code with your mobile app to authorize access.</p>

      {qrCodeUrl ? (
        <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 border-4 border-slate-100 rounded-xl" />
      ) : (
        <div className="w-48 h-48 bg-slate-100 animate-pulse rounded-xl" />
      )}

      <div className="text-sm font-mono text-slate-400">
        Session ID: {sessionId || '...'}
      </div>

      <button
        onClick={handleBypass}
        className="text-slate-400 text-xs hover:text-slate-600 border border-slate-200 px-3 py-1 rounded transition-colors"
      >
        (Demo) Bypass with Mock Address
      </button>

      <div className="pt-8 border-t border-slate-100 w-full text-center">
          <p className="text-xs text-slate-400 mb-2">或使用受託帳號登入</p>
          <div className="flex justify-center gap-2">
              <button
                onClick={handleBypass}
                className="text-xs font-bold bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700"
              >
                託管快速登入
              </button>
              <button
                onClick={handleBypass}
                className="text-xs font-bold bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500"
              >
                App 快速登入
              </button>
          </div>
      </div>
    </div>
  );
}
