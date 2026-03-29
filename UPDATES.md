# Empth - UI & Voice Mode Upgrades

Here is a summary of the major improvements implemented into the Empth desktop assistant today:

## 1. UI & UX Polish
- **Result Scroll:** Fixed the result text box silently cropping out text. Added `overflow-y: auto` to allow scrolling for long LLM responses.
- **Frameless Dragging:** Added `-webkit-app-region: drag` to the root container, allowing the user to click and drag the Spotlight-style bar around the screen smoothly. Interactive elements (inputs, buttons) are mapped to `no-drag` to preserve usability.
- **Theme Adaptation:** Added `@media (prefers-color-scheme: light)` to dynamically switch colors based on the user's native macOS Light/Dark mode settings.
- **Request Cancellation:** Added an `AbortController` natively hooked to the `Escape` key. Users can now instantly cancel long-running backend LLM or speech generation requests.
- **Hover UI & Tooltips:** Added CSS transitions, hover states, and updated tooltips for the Microphone to accurately reflect behavior to the user.

## 2. Voice Mode GUI & Animated Sphere
- **New Mode Interface:** Clicking the Mic button now smoothly switches the UI from a text "search bar" into a dedicated 250px "Voice Mode" window.
- **CSS Animated Sphere:** Created a highly performant, 3D-looking sphere using CSS `radial-gradient` and `box-shadow`. It continuously scales and pulses based on raw microphone frequency data in real-time. (Skipped Three.js to drastically save on Electron CPU/GPU battery overhead while maintaining a premium look).
- **Visual State Machine:** 
  - *Listening*: Sphere scales with speaker's voice.
  - *Processing*: Infinite CSS pulse animation to signal the LLM is "thinking".
  - *Playing*: Gradient shifts to green/yellow while responding.

## 3. Smart Voice Activity Detection (VAD)
- **Auto-Record / Auto-Stop:** Replaced the manual "click to start/stop" logic. The microphone uses the `AnalyserNode` to seamlessly toggle recording.
- **Dynamic Noise Floor Calibration:** Implemented an algorithm that uses the first 50 frames (~1 sec) to calibrate the local room's background silence (ignoring A/C and fan hums). It actively readjusts the baseline while idle.
- **Relative Volume Thresholds:** Recording now only triggers when noise hits +8 points *above* the calibrated room baseline instead of a hardcoded ceiling.
- **Fast Silence Cutoff:** Automatically cuts the microphone and submits to the backend after identifying exactly 1.2 seconds of relative silence, ensuring the conversation flows naturally.