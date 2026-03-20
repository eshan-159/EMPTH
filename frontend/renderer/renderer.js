let backendBaseUrl;

const queryEl = document.getElementById('query');
const micEl = document.getElementById('mic');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');

window.onerror = function(message, source, lineno, colno, error) {
  if (statusEl) statusEl.textContent = `JS Error: ${message}`;
  if (resultEl) resultEl.textContent = `Line ${lineno}: ${error?.stack || message}`;
};

window.onunhandledrejection = function(event) {
  if (statusEl) statusEl.textContent = `Async Error: ${event.reason}`;
};

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let audioPlayer = null;
let activeStream = null;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text || '';
}

function setResult(text) {
  if (resultEl) resultEl.textContent = text || '';
}

function pickRecorderMimeType() {
  const preferred = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];

  for (const t of preferred) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

async function ensureConfig() {
  try {
    const cfg = await window.empth.getConfig();
    backendBaseUrl = cfg.backendBaseUrl;
    setStatus(`Ready. Backend: ${backendBaseUrl}`);
  } catch (err) {
    backendBaseUrl = 'http://127.0.0.1:3001';
    setStatus(`Config error (using fallback): ${err.message}`);
  }
}

function playAudioBase64(base64, mimeType) {
  if (!base64 || !mimeType) return;
  const url = `data:${mimeType};base64,${base64}`;
  if (!audioPlayer) audioPlayer = new Audio();
  audioPlayer.src = url;
  audioPlayer.play().catch((e) => setStatus('Audio play error: ' + e.message));
}

async function sendText(text) {
  setStatus('Thinking…');
  setResult('');

  try {
    const res = await fetch(`${backendBaseUrl}/api/agent/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      let errText = 'Request failed';
      try { const j = await res.json(); errText = j.error || j.message || errText; } catch {}
      setStatus('Error');
      setResult(`${res.status} ${errText}`);
      return;
    }

    const payload = await res.json();
    setStatus(payload?.meta?.intent ? `Intent: ${payload.meta.intent}` : '');
    setResult(payload.text);
    playAudioBase64(payload.audioBase64, payload.audioMimeType);
  } catch (err) {
    setStatus('Connection Error');
    setResult(`Failed to connect to ${backendBaseUrl}\n${err.message}`);
  }
}

async function sendAudio(blob) {
  setStatus('Uploading…');
  setResult('');

  try {
    const fd = new FormData();
    const t = String(blob.type || '').toLowerCase();
    const filename = t.includes('ogg') ? 'audio.ogg' : 'audio.webm';
    fd.append('file', blob, filename);

    const res = await fetch(`${backendBaseUrl}/api/agent/voice`, {
      method: 'POST',
      body: fd
    });

    if (!res.ok) {
      let errText = 'Request failed';
      try { const j = await res.json(); errText = j.error || j.message || errText; } catch {}
      setStatus('Server Error');
      setResult(`${res.status} ${errText}`);
      return;
    }

    const payload = await res.json();

    if (payload.transcript) {
      queryEl.value = payload.transcript;
    }

    setStatus(payload?.meta?.intent ? `Intent: ${payload.meta.intent}` : '');
    setResult(payload.text);
    playAudioBase64(payload.audioBase64, payload.audioMimeType);
  } catch (err) {
    setStatus('Connection Error');
    setResult(`Failed to connect to ${backendBaseUrl}\n${err.message}`);
  }
}

async function startRecording() {
  if (isRecording) return;
  recordedChunks = [];

  try {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };
    activeStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Safety check: is the track actually enabled/live?
    const track = activeStream.getAudioTracks()[0];
    if (!track) throw new Error('No audio track found.');
    if (track.readyState === 'ended' || track.muted) {
       setStatus('Mic is muted/ended'); 
    }
  } catch (err) {
    setStatus('Mic Access Denied');
    setResult('Check System Settings → Privacy → Microphone.\nError: ' + (err?.message || err));
    return;
  }

  const mimeType = pickRecorderMimeType();
  try {
    mediaRecorder = mimeType ? new MediaRecorder(activeStream, { mimeType }) : new MediaRecorder(activeStream);
  } catch (err) {
    mediaRecorder = new MediaRecorder(activeStream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    try {
      activeStream?.getTracks?.().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    activeStream = null;
  };

  // Request frequent data slices (100ms) to ensure chunks are emitted
  // even if the recording is short. This fixes "empty blob" issues.
  mediaRecorder.start(100);
  isRecording = true;
  micEl.classList.add('recording');
  setStatus('Recording… click Mic to stop');
}

async function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  mediaRecorder.stop();
  isRecording = false;
  micEl.classList.remove('recording');
  setStatus('Processing…');

  const type = mediaRecorder.mimeType || 'audio/webm';
  const blob = new Blob(recordedChunks, { type });
  if (!blob.size) {
    setStatus('No audio captured');
    setResult('Try again and speak for ~1–2 seconds.');
    return;
  }

  await sendAudio(blob);
}

function resetUI() {
  setStatus('');
  setResult('');
  queryEl.value = '';
  queryEl.focus();
}

// Spotlight-like behavior
window.empth.onShown(() => resetUI());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.empth.hide();
  }

  if (e.key === 'Enter' && document.activeElement === queryEl) {
    const text = queryEl.value.trim();
    if (text) sendText(text);
  }
});

micEl.addEventListener('click', () => {
  if (isRecording) stopRecording().catch((err) => {
    setStatus('Mic error');
    setResult(String(err?.message || err));
  });
  else startRecording().catch((err) => {
    setStatus('Mic error');
    setResult(String(err?.message || err));
  });
});

await ensureConfig();
queryEl.focus();
