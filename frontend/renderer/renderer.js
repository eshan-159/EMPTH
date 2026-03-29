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
    setStatus(`Ready. Backend: ${backendBaseUrl}`);
  } catch (err) {
    backendBaseUrl = 'http://127.0.0.1:3001';
    setStatus(`Config error (using fallback): ${err.message}`);
  }
}

function playAudioBase64(base64, mimeType) {
  return new Promise((resolve) => {
    if (!base64 || !mimeType) {
      resolve();
      return;
    }
    const url = `data:${mimeType};base64,${base64}`;
    if (!audioPlayer) audioPlayer = new Audio();
    audioPlayer.src = url;
    
    audioPlayer.onended = () => {
      resolve();
    };
    
    audioPlayer.onerror = (e) => {
      setStatus('Audio play error');
      resolve();
    };

    audioPlayer.play().catch((e) => {
      setStatus('Audio play error: ' + e.message);
      resolve();
    });
  });
}

async function sendText(text) {
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();

  setStatus('Thinking…');
  setResult('');

  try {
    const res = await fetch(`${backendBaseUrl}/api/agent/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: currentAbortController.signal
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
    return playAudioBase64(payload.audioBase64, payload.audioMimeType);
  } catch (err) {
    if (err.name === 'AbortError') {
      setStatus('Cancelled');
      return;
    }
    setStatus('Connection Error');
    setResult(`Failed to connect to ${backendBaseUrl}\n${err.message}`);
  } finally {
    if (currentAbortController?.signal.aborted === false) {
       currentAbortController = null;
    }
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

    if (payload.transcript) {
      queryEl.value = payload.transcript;
    }

    setStatus(payload?.meta?.intent ? `Intent: ${payload.meta.intent}` : '');
    setResult(payload.text);
    
    vadState = 'playing';
    setVoiceStateVisuals('playing');
    
    await playAudioBase64(payload.audioBase64, payload.audioMimeType);
  } catch (err) {
    if (err.name === 'AbortError') {
      setStatus('Cancelled');
      return;
    }
    setStatus('Connection Error');
    setResult(`Failed to connect to ${backendBaseUrl}\n${err.message}`);
  } finally {
    if (currentAbortController?.signal.aborted === false) {
       currentAbortController = null;
    }
  }
}

// --- VOICE MODE & VAD (Voice Activity Detection) ---
let audioCtx = null;
let analyser = null;
let vadSilenceStart = 0;
let vadState = 'idle'; // idle | recording | processing | playing
let vadRaf = null;

// Dynamic noise floor tracking
let noiseFloor = 0;
let calibrationFrames = 0;

const barModeEl = document.getElementById('bar-mode');
const voiceModeEl = document.getElementById('voice-mode');
const closeVoiceBtn = document.getElementById('close-voice');
const sphereEl = document.getElementById('sphere');

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
    setStatus('Listening... (Speak to auto-record)');
  }
}

async function startVADRecording() {
  if (vadState !== 'idle') return;
  recordedChunks = [];
  
  const mimeType = pickRecorderMimeType();
  try {
    mediaRecorder = mimeType ? new MediaRecorder(activeStream, { mimeType }) : new MediaRecorder(activeStream);
  } catch (err) {
    mediaRecorder = new MediaRecorder(activeStream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    vadState = 'processing';
    setVoiceStateVisuals('processing');
    const type = mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(recordedChunks, { type });
    if (!blob.size) {
      vadState = 'idle';
      setVoiceStateVisuals('idle');
      return;
    }
    
    // Send audio and wait for BOTH backend processing and audio playback
    await sendAudio(blob);
    
    // Done playing, go back to idle listening state
    vadState = 'idle';
    setVoiceStateVisuals('idle');
    // Rapidly reset the noiseFloor to avoid a false trigger right after they exit speaking
    calibrationFrames = 0; 
    noiseFloor = 0;
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
  for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
  const avg = sum / dataArray.length;

  // --- Dynamic Noise Floor Algorithm ---
  if (calibrationFrames < 50) { // Approx 1 second of audio to calibrate room noise
    noiseFloor = ((noiseFloor * calibrationFrames) + avg) / (calibrationFrames + 1);
    calibrationFrames++;
    setStatus(`Calibrating room noise...`);
    vadRaf = requestAnimationFrame(processVAD);
    return;
  } else {
    // Slowly adjust noise floor to account for changing room environments
    if (avg < noiseFloor) {
      noiseFloor = noiseFloor * 0.95 + avg * 0.05; // Adjust down quickly
    } else if (vadState === 'idle') {
      noiseFloor = noiseFloor * 0.999 + avg * 0.001; // Adjust up very slowly
    }
  }

  const relativeVolume = avg - noiseFloor;

  // Visuals: animate sphere with volume constraint (if not playing/processing)
  if (vadState === 'idle' || vadState === 'recording') {
    const scale = 1 + (Math.max(0, relativeVolume) / 255) * 1.5; // Amplified visual effect
    sphereEl.style.transform = `scale(${scale})`;
    const glow = Math.max(20, relativeVolume * 2);
    sphereEl.style.boxShadow = `0 0 ${glow}px rgba(79, 172, 254, ${0.4 + (relativeVolume/255)})`;
  } else {
    sphereEl.style.transform = '';
  }

  // Audio Threshold logic based on relative room noise
  const START_LOUDNESS = 6;
  const STOP_LOUDNESS = 2;
  const SILENCE_DELAY_MS = 1200;

  if (vadState === 'idle') {
    if (relativeVolume > START_LOUDNESS) {
      startVADRecording();
    }
  } else if (vadState === 'recording') {
    if (relativeVolume > STOP_LOUDNESS) {
      vadSilenceStart = 0; // reset
    } else {
      if (vadSilenceStart === 0) {
        vadSilenceStart = Date.now();
      } else if (Date.now() - vadSilenceStart > SILENCE_DELAY_MS) {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }
    }
  }

  vadRaf = requestAnimationFrame(processVAD);
}

async function enterVoiceMode() {
  barModeEl.style.display = 'none';
  voiceModeEl.style.display = 'flex';
  if (window.empth?.resize) window.empth.resize(300);
  setResult('');
  setStatus('Connecting to mic...');

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    
    // Safety check
    const track = activeStream.getAudioTracks()[0];
    if (!track || track.readyState === 'ended' || track.muted) throw new Error('Mic muted or not found');

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
    setStatus('Mic Error');
    setResult(String(err?.message || err));
  }
}

function exitVoiceMode() {
  barModeEl.style.display = 'flex';
  voiceModeEl.style.display = 'none';
  if (window.empth?.resize) window.empth.resize(110);
  
  if (vadRaf) cancelAnimationFrame(vadRaf);
  if (audioCtx) audioCtx.close();
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  if (currentAbortController) currentAbortController.abort();
  if (audioPlayer) audioPlayer.pause();
  
  vadState = 'idle';
  resetUI();
}

function resetUI() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  setStatus('');
  setResult('');
  if (barModeEl.style.display !== 'none') {
    queryEl.value = '';
    queryEl.focus();
  }
}

// Spotlight-like behavior
window.empth.onShown(() => {
  if (voiceModeEl.style.display === 'flex') {
    exitVoiceMode(); // Start fresh in text mode
  } else {
    resetUI();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    if (voiceModeEl.style.display === 'flex') exitVoiceMode();
    window.empth.hide();
  }

  if (e.key === 'Enter' && document.activeElement === queryEl && barModeEl.style.display !== 'none') {
    const text = queryEl.value.trim();
    if (text) sendText(text);
  }
});

micEl.addEventListener('click', enterVoiceMode);
closeVoiceBtn.addEventListener('click', exitVoiceMode);

await ensureConfig();
queryEl.focus();
