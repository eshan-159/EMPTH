let backendBaseUrl;

const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const sphereEl = document.getElementById('sphere');

window.onerror = function(message, source, lineno, colno, error) {
  if (statusEl) statusEl.textContent = `JS Error: ${message}`;
  if (resultEl) resultEl.textContent = `Line ${lineno}: ${error?.stack || message}`;
};

window.onunhandledrejection = function(event) {
  if (statusEl) statusEl.textContent = `Async Error: ${event.reason}`;
};

let mediaRecorder = null;
let recordedChunks = [];
let audioPlayer = null;
let activeStream = null;
let currentAbortController = null;

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
    setStatus('Listening for a clap...');
  } catch (err) {
    backendBaseUrl = 'http://127.0.0.1:3001';
    setStatus(`Config error: ${err.message}`);
  }
}

function playAudioBase64(base64, mimeType) {
  return new Promise((resolve) => {
    if (!base64 || !mimeType) return resolve();
    const url = `data:${mimeType};base64,${base64}`;
    if (!audioPlayer) audioPlayer = new Audio();
    audioPlayer.src = url;
    audioPlayer.onended = () => resolve();
    audioPlayer.onerror = () => { setStatus('Audio play error'); resolve(); };
    audioPlayer.play().catch((e) => { setStatus('Audio play error: ' + e.message); resolve(); });
  });
}

// --- VOICE MODE & VAD ---
let audioCtx = null;
let analyser = null;
let vadSilenceStart = 0;
let vadState = 'idle'; 

let noiseFloor = 0;
let calibrationFrames = 0;

function setVoiceStateVisuals(state) {
  sphereEl.classList.remove('processing', 'playing');
  if (state === 'processing') {
    sphereEl.classList.add('processing');
    setStatus('Processing...');
  } else if (state === 'playing') {
    sphereEl.classList.add('playing');
    setStatus('Playing reply...');
  } else if (state === 'recording') {
    setStatus('Listening... (Recording)');
  } else {
    setStatus('Listening for a clap...');
  }
}

async function sendAudio(blob) {
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();

  setStatus('Thinking…');
  setResult('');

  try {
    const fd = new FormData();
    const t = String(blob.type || '').toLowerCase();
    const filename = t.includes('ogg') ? 'audio.ogg' : 'audio.webm';
    fd.append('file', blob, filename);

    const res = await fetch(`${backendBaseUrl}/api/agent/voice`, {
      method: 'POST',
      body: fd,
      signal: currentAbortController.signal
    });

    if (!res.ok) {
      let errText = 'Request failed';
      try { const j = await res.json(); errText = j.error || j.message || errText; } catch {}
      setStatus('Server Error');
      setResult(`${res.status} ${errText}`);
      return;
    }

    const payload = await res.json();
    setStatus(payload?.meta?.intent ? `Intent: ${payload.meta.intent}` : '');
    setResult(payload.text);
    vadState = 'playing';
    setVoiceStateVisuals('playing');
    await playAudioBase64(payload.audioBase64, payload.audioMimeType);
  } catch (err) {
    if (err.name === 'AbortError') return setStatus('Cancelled');
    setStatus('Connection Error');
    setResult(err.message);
  } finally {
    if (currentAbortController?.signal.aborted === false) currentAbortController = null;
    vadState = 'idle';
    setVoiceStateVisuals('idle');
    calibrationFrames = 0;
    noiseFloor = 0;

    // After responding, wait a moment and collapse back to the dock
    setTimeout(() => {
      if (vadState === 'idle') window.empth.hide();
    }, 5000);
  }
}

function startVADRecording() {
  if (vadState !== 'idle') return;
  recordedChunks = [];
  const mimeType = pickRecorderMimeType();
  try { mediaRecorder = mimeType ? new MediaRecorder(activeStream, { mimeType }) : new MediaRecorder(activeStream); } catch { mediaRecorder = new MediaRecorder(activeStream); }
  
  mediaRecorder.ondataavailable = (e) => { 
    if (e.data && e.data.size > 0) recordedChunks.push(e.data); 
  };
  
  mediaRecorder.onstop = async () => {
    vadState = 'processing';
    setVoiceStateVisuals('processing');
    const type = mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(recordedChunks, { type });
    if (!blob.size) { vadState = 'idle'; setVoiceStateVisuals('idle'); return; }
    await sendAudio(blob);
  };
  
  mediaRecorder.start(100);
  vadState = 'recording';
  setVoiceStateVisuals('recording');
}

function processVAD() {
  if (!activeStream || !analyser) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  let maxVolume = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
    if (dataArray[i] > maxVolume) maxVolume = dataArray[i];
  }
  const avg = sum / dataArray.length;

  if (calibrationFrames < 50) { 
    noiseFloor = ((noiseFloor * calibrationFrames) + avg) / (calibrationFrames + 1);
    calibrationFrames++;
    setStatus('Calibrating room noise...');
    // Since window might be hidden, use setTimeout instead of requestAnimationFrame
    setTimeout(processVAD, 16);
    return;
  } else {
    if (avg < noiseFloor) noiseFloor = noiseFloor * 0.95 + avg * 0.05;
    else if (vadState === 'idle') noiseFloor = noiseFloor * 0.999 + avg * 0.001;
  }

  const relativeVolume = avg - noiseFloor;

  if (vadState === 'idle' || vadState === 'recording') {
    const scale = 1 + (Math.max(0, relativeVolume) / 255) * 1.5;
    sphereEl.style.transform = `scale(${scale})`;
    const glow = Math.max(20, relativeVolume * 2);
    sphereEl.style.boxShadow = `0 0 ${glow}px rgba(79, 172, 254, ${0.4 + (relativeVolume/255)})`;
  } else {
    sphereEl.style.transform = '';
  }

  const START_LOUDNESS = 6;
  const STOP_LOUDNESS = 2;
  const SILENCE_DELAY_MS = 1200;
  const CLAP_THRESHOLD = 50;

  if (vadState === 'idle') {
    if (relativeVolume > CLAP_THRESHOLD || maxVolume > 200 || relativeVolume > START_LOUDNESS) {
       startVADRecording();
    }
  } else if (vadState === 'recording') {
    if (relativeVolume > STOP_LOUDNESS) vadSilenceStart = 0;
    else {
      if (vadSilenceStart === 0) vadSilenceStart = Date.now();
      else if (Date.now() - vadSilenceStart > SILENCE_DELAY_MS) {
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
      }
    }
  }

  // Poll aggressively for claps even when hidden - Chromium throttles hidden tabs sometimes
  // but webPreferences has backgroundThrottling: false, so setTimeout works fine
  setTimeout(processVAD, Math.max(16, 30));
}

async function initAlwaysOnVoice() {
  if (window.empth?.resize) window.empth.resize(300);
  setStatus('Connecting to mic...');

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const sourceNode = audioCtx.createMediaStreamSource(activeStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(analyser);

    noiseFloor = 0;
    calibrationFrames = 0;
    vadState = 'idle';
    setVoiceStateVisuals('idle');
    processVAD();
  } catch (err) {
    setStatus('Mic Error. Please force-quit and allow mic usage.');
    setResult(String(err?.message || err));
  }
}

window.empth.onShown(() => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  setStatus('Listening...');
  setResult('');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    window.empth.hide();
  }
});

ensureConfig().then(() => {
  initAlwaysOnVoice();
  setTimeout(() => {
    fetch(`${backendBaseUrl}/api/agent/tts/startup`)
      .then(res => res.json())
      .then(data => {
        if (data.audioBase64) {
          playAudioBase64(data.audioBase64, data.audioMimeType);
        }
      })
      .catch(err => console.warn("Could not fetch startup TTS", err));
  }, 2000);
});