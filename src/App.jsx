import { useEffect, useRef, useState } from 'react';
import './App.css';

import { HandTracker } from './perception/handTracker';
import { FaHandPointLeft, FaHandPointRight } from "react-icons/fa6";
import { FaHandSparkles } from "react-icons/fa6";
import { FaRegHandRock } from "react-icons/fa";
import { GestureEngine } from './interaction/gestureEngine';
import { SceneRenderer } from './scene/renderer';
import { ModelManager } from './model/modelManager';
import { drawConnectors, drawLandmarks, HAND_CONNECTIONS } from '@mediapipe/drawing_utils';
import { audioManager } from './audio/AudioManager';
import {
  HiOutlineArrowsRightLeft,
  HiOutlineCursorArrowRays,
  HiOutlineMagnifyingGlassPlus,
  HiOutlineHandRaised
} from 'react-icons/hi2';

export default function App() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const webcamCanvasRef = useRef(null);

  const handTrackerRef = useRef(null);
  const gestureEngineRef = useRef(null);
  const sceneRendererRef = useRef(null);
  const modelManagerRef = useRef(null);

  const [status, setStatus] = useState('Initializing...');
  const isZoomingRef = useRef(false);
  const [currentModel, setCurrentModel] = useState('Loading...');
  const [gestureHint, setGestureHint] = useState('Waiting for hands...');
  const [appMode, setAppMode] = useState('showcase'); // 'showcase' | 'user'
  const [errorStatus, setErrorStatus] = useState(null);
  const fileInputRef = useRef(null);

  // Transform state
  const hasStartedAudio = useRef(false);
  const transformRef = useRef({
    rotation: { x: 0, y: 0 },
    scale: 1,
    isLocked: false
  });
  const lastHandsDetectedTimeRef = useRef(Date.now());

  // HUD Drawing helper
  async function drawHandHUD(results) {
    const canvas = webcamCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Set fixed internal resolution for clear lines
    if (canvas.width !== 640) {
      canvas.width = 640;
      canvas.height = 480;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const engine = gestureEngineRef.current;
      const isActiveInteraction = engine && engine.state !== 'idle';

      for (const landmarks of results.multiHandLandmarks) {
        // Detect current pose name
        const pose = engine?.detectGesture(landmarks) || 'unknown';

        // Final Triggered Logic: 
        // 1. Gesture must be known (Point, Fist, etc.)
        // 2. Engine must have MOVED into an active state (tracking, switching, pinching)
        const isTriggered = isActiveInteraction && pose !== 'unknown';

        // Colors: High-contrast Red for "scanning/idle", Sci-fi Green for "Action Active"
        const colorPrimary = isTriggered ? '#00ff88' : '#ff1111';
        const colorSecondary = isTriggered ? '#00d4ff' : '#440000';
        const label = isTriggered ? `[ ACTION_ACTIVE: ${pose.toUpperCase()} ]` : '[ SCANNING_POINTER ]';

        // Draw detection indicator per hand - MIRRORED BACK for readability
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.fillStyle = colorPrimary;
        ctx.font = 'bold 18px Orbitron';
        ctx.textAlign = 'right'; // Flip alignment because of coordinate flip
        ctx.fillText(label, canvas.width - (landmarks[0].x * canvas.width), landmarks[0].y * canvas.height - 25);
        ctx.restore();

        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
          color: colorSecondary,
          lineWidth: isTriggered ? 5 : 2
        });
        drawLandmarks(ctx, landmarks, {
          color: colorPrimary,
          lineWidth: 1,
          radius: isTriggered ? 4 : 2
        });

        // Highlight active fingertips
        const tips = [4, 8, 12, 16, 20];
        tips.forEach(idx => {
          const tip = landmarks[idx];
          ctx.beginPath();
          ctx.arc(tip.x * canvas.width, tip.y * canvas.height, isTriggered ? 10 : 5, 0, 2 * Math.PI);
          ctx.fillStyle = isTriggered ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 0, 0, 0.1)';
          ctx.fill();
        });
      }
      lastHandsDetectedTimeRef.current = Date.now();
    } else {
      // No hands detected - Wait for 1 second before showing warning
      const timeSinceLastDetection = Date.now() - lastHandsDetectedTimeRef.current;

      if (timeSinceLastDetection > 1000) {
        // Draw red warning - MIRRORED BACK for readability
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);

        ctx.fillStyle = '#ff1111';
        ctx.font = 'bold 24px Orbitron';
        ctx.textAlign = 'center';

        // Blinking effect
        const alpha = Math.sin(Date.now() * 0.005) * 0.5 + 0.5;
        ctx.globalAlpha = alpha;
        ctx.fillText('! HANDS NOT DETECTED !', canvas.width / 2, canvas.height / 2);

        ctx.font = '14px Orbitron';
        ctx.fillText('MOVE HANDS INTO FRAME', canvas.width / 2, canvas.height / 2 + 30);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /**
   * Setup gesture event handlers
   */
  function setupGestureHandlers() {
    const engine = gestureEngineRef.current;

    // Swipe Handler (Unified)
    // Swipe Right -> Prev Model (Pulling from left)
    // Swipe Left -> Next Model (Pulling from right)

    engine.on('swipe', async ({ direction }) => {
      // DISABLE SWIPE IN USER MODE
      if (appMode === 'user') return;

      const isRight = direction === 'RIGHT';
      setGestureHint(isRight ? 'Prev Model' : 'Next Model');

      const modelData = isRight
        ? await modelManagerRef.current.prevModel()
        : await modelManagerRef.current.nextModel();

      if (modelData) {
        sceneRendererRef.current.setModel(modelData);
        transformRef.current = { rotation: { x: 0, y: 0 }, scale: 1, isLocked: false };
        setCurrentModel(modelManagerRef.current.getCurrentModelName());
        setTimeout(() => setGestureHint('~ Kush Dastane'), 1000);
      }
    });

    /* Deprecated independent handlers
    engine.on('nextModel', ...)
    engine.on('prevModel', ...)
    */

    // Zoom
    engine.on('zoom', ({ scaleFactor }) => {
      if (transformRef.current.isLocked) return;

      // Trigger zoom sound once per session
      if (!isZoomingRef.current) {
        audioManager.playZoom();
        isZoomingRef.current = true;
      }

      setGestureHint(scaleFactor > 1 ? ' Zooming in...' : ' Zooming out...');
      // Multiplicative scale
      const newScale = transformRef.current.scale * scaleFactor;
      transformRef.current.scale = Math.max(0.3, Math.min(3, newScale));
    });

    // Rotate
    engine.on('rotate', ({ deltaX, deltaY }) => {
      if (transformRef.current.isLocked) return;
      setGestureHint(' Rotating model...');
      const invert = appMode === 'user' ? -1 : 1;
      transformRef.current.rotation.y += deltaX * invert;
      transformRef.current.rotation.x -= deltaY * invert;
    });

    // Reset
    engine.on('reset', () => {
      setGestureHint('Resetting to Idle...');
      transformRef.current = { rotation: { x: 0, y: 0 }, scale: 1, isLocked: false };
      sceneRendererRef.current.morphToIdle();
      setTimeout(() => setGestureHint(''), 1000);
    });

  }


  useEffect(() => {
    let animationId;

    async function init() {
      try {
        // 1. Initialize core systems (Fast)
        sceneRendererRef.current = new SceneRenderer(canvasRef.current);
        gestureEngineRef.current = new GestureEngine();
        setupGestureHandlers();

        modelManagerRef.current = new ModelManager();
        await modelManagerRef.current.init();

        // 2. Start Hand Tracker / Camera (Heavy - done as early as possible)
        setStatus('Warming up camera...');
        handTrackerRef.current = new HandTracker();
        await handTrackerRef.current.init(videoRef.current, (results) => {
          gestureEngineRef.current.processFrame(results);
          drawHandHUD(results);

          // Start audio on first successful frame (human in front)
          if (!hasStartedAudio.current && results.multiHandLandmarks?.length > 0) {
            audioManager.init();
            audioManager.startBackground();
            hasStartedAudio.current = true;
          }

          // Reset zoom sound flag if not two hands
          if (!results.multiHandLandmarks || results.multiHandLandmarks.length < 2) {
            isZoomingRef.current = false;
          }
        });

        setStatus('System Active');

        // Start animation loop immediately so the "Idle" cloud is visible and moving smoothly
        function animate() {
          if (sceneRendererRef.current) {
            sceneRendererRef.current.render(transformRef.current);
          }
          animationId = requestAnimationFrame(animate);
        }
        animate();

        // 3. Trigger Particle Assembly only after a short stability delay
        // This ensures the camera is streaming and GPU is ready for the heavy morph task
        setTimeout(async () => {
          const firstModel = await modelManagerRef.current.getCurrentModelData();
          sceneRendererRef.current.setModel(firstModel);
          setCurrentModel(modelManagerRef.current.getCurrentModelName());
          setStatus('Ready..');
        }, 500);

      } catch (error) {
        console.error('Initialization error:', error);
        setStatus('Error: ' + error.message);
      }
    }

    // Global click handler to unlock audio (browser policy requirement)
    const handleGlobalClick = () => {
      if (!hasStartedAudio.current) {
        audioManager.init();
        audioManager.startBackground();
        hasStartedAudio.current = true;
      }
    };
    window.addEventListener('click', handleGlobalClick);

    init();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (handTrackerRef.current) handTrackerRef.current.stop();
      if (sceneRendererRef.current) sceneRendererRef.current.dispose();
      window.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  // Use a second effect to update the engine closure when appMode changes
  useEffect(() => {
    if (gestureEngineRef.current) {
      setupGestureHandlers();
    }
  }, [appMode]);


  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Processing Upload...');
    setErrorStatus(null);

    // 1. Start dissolving existing model into particles
    sceneRendererRef.current.morphToIdle();

    try {
      // 2. Process the file (parsing vertices)
      const vertices = await modelManagerRef.current.processUploadedFile(file);

      // 3. Wait for dissolve to progress before "assembling" the new model
      // This creates the "particles coming together" effect
      setTimeout(() => {
        sceneRendererRef.current.setModel(vertices);
        setAppMode('user');
        setCurrentModel('USER MODEL');
        setStatus('User Model Active');
        // Reset transform
        transformRef.current = { rotation: { x: 0, y: 0 }, scale: 1, isLocked: false };
      }, 800);

    } catch (err) {
      console.error(err);
      setErrorStatus(err.message);
      setStatus('Upload Failed');
      setTimeout(() => setStatus('Ready..'), 3000);
    }
    // Reset file input
    e.target.value = '';
  };

  const handleExit = async () => {
    setStatus('Cleaning up...');
    sceneRendererRef.current.morphToIdle();

    setTimeout(async () => {
      modelManagerRef.current.cleanupUserModel();
      const defaultModel = await modelManagerRef.current.getCurrentModelData();
      sceneRendererRef.current.setModel(defaultModel);
      setAppMode('showcase');
      setCurrentModel(modelManagerRef.current.getCurrentModelName());
      setStatus('Ready..');
      setErrorStatus(null);
      // Reset transform
      transformRef.current = { rotation: { x: 0, y: 0 }, scale: 1, isLocked: false };
    }, 800);
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-black overflow-hidden font-['Orbitron'] selection:bg-cyan-500/30">
      <canvas ref={canvasRef} className="block w-full h-full object-cover" />

      {/* Webcam preview - Bottom Right (Balanced height for mobile) */}
      <div className="absolute bottom-6 right-3 md:bottom-6 md:right-6 z-50 group">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-44 h-34 md:w-72 md:h-54 border-2 border-cyan-400/50 rounded-lg shadow-[0_0_20px_rgba(0,212,255,0.3)] opacity-80 group-hover:opacity-100 transition-opacity object-cover scale-x-[-1]"
        />
        <canvas
          ref={webcamCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none scale-x-[-1]"
        />
        <div className="absolute top-1 left-2 text-[8px] md:text-[10px] text-cyan-400 font-bold tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
          CAM_FEED_01
        </div>
      </div>

      {/* HUD - Top Left */}
      <div className="hidden md:block absolute top-6 left-6 z-50 pointer-events-none">
        <h1 className="text-3xl md:text-5xl font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-green-400 drop-shadow-[0_0_10px_rgba(0,212,255,0.5)]">
          GESTURE
          <br />
          VIEWER
        </h1>
        <div className="mt-2 ml-4 text-xs md:text-sm text-green-400 tracking-[0.15em] opacity-80 font-bold uppercase animate-pulse">
          {status}
        </div>
      </div>

      {/* Model Info - Bottom Left (Balanced height for mobile) */}
      <div className="absolute bottom-14 left-3 md:bottom-12 md:left-12 z-50 pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="text-xs md:text-xl lg:text-2xl font-bold uppercase tracking-widest text-cyan-400 drop-shadow-[0_0_15px_rgba(0,212,255,0.6)]">
            {currentModel}
          </div>
          {appMode === 'user' && (
            <div className="hidden md:block user-mode-tag uppercase font-black tracking-tighter md:text-[10px]">
              Isolated Mode
            </div>
          )}
        </div>
        <div className="mt-0.5 text-[7px] md:text-sm text-green-400 opacity-90 tracking-wide font-medium">
          {gestureHint}
        </div>

        {errorStatus && (
          <div className="mt-2 p-1.5 border border-red-500/50 bg-red-500/10 text-red-500 text-[8px] md:text-[10px] uppercase font-bold tracking-widest animate-pulse">
            [ ERROR ]: {errorStatus}
          </div>
        )}
      </div>

      {/* Actions HUD - Positioned left, above model info to avoid camera overlap */}
      <div className="absolute bottom-28 left-3 md:bottom-32 md:left-12 z-[100] flex flex-col gap-1 md:gap-4 items-start">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          accept=".glb,.gltf"
          className="hidden"
        />

        {appMode === 'showcase' ? (
          <button
            onClick={() => fileInputRef.current.click()}
            className="hud-button flex flex-col md:flex-row items-start md:items-center gap-0.5 md:gap-2 group whitespace-nowrap"
          >
            <div className="hud-corner corner-tl" />
            <div className="hud-corner corner-br" />
            <span className="text-[8px] md:text-[11px]">Upload Model</span>
            <span className="opacity-40 group-hover:opacity-100 transition-opacity text-[6px] md:text-[8px] -mt-0.5 md:mt-0">[.GLB]</span>
          </button>
        ) : (
          <>
            <button
              onClick={() => fileInputRef.current.click()}
              className="hud-button flex items-center gap-1.5 whitespace-nowrap"
            >
              <div className="hud-corner corner-tl" />
              <div className="hud-corner corner-br" />
              <span className="text-[8px] md:text-[11px]">Upload Another</span>
              <span className="opacity-40 group-hover:opacity-100 transition-opacity text-[6px] md:text-[8px]">[.GLB]</span>
            </button>
            <button
              onClick={handleExit}
              className="hud-button hud-button-red flex items-center gap-1.5 whitespace-nowrap"
            >
              <div className="hud-corner corner-tl" />
              <div className="hud-corner corner-br" />
              <span className="text-[6px] md:text-[11px]">Exit to Showcase</span>
            </button>
          </>
        )}
      </div>

      {/* Gesture Guide - Top Right */}
      <div className="absolute top-3 right-3 md:top-6 md:right-6 z-[100] w-60 md:w-80 hud-panel p-2 md:p-5 rounded-sm border-cyan-400/30 shadow-[0_0_50px_rgba(0,212,255,0.2)] group visible">
        {/* HUD Corners */}
        <div className="hud-corner corner-tl" />
        <div className="hud-corner corner-tr" />
        <div className="hud-corner corner-bl" />
        <div className="hud-corner corner-br" />

        <span className="hidden md:block technical-label opacity-70 text-[10px] mb-2 uppercase">INSTRUCTIONS</span>

        <div className="flex flex-col gap-0.5 md:gap-3">
          {appMode === 'showcase' && (
            <GuideItem
              icon={<div className="flex gap-1 text-cyan-400 transition-colors">
                <FaHandPointLeft className="-rotate-[-25deg]" />
                <FaHandPointRight className="rotate-[-25deg]" />
              </div>}
              text="Change 3D Model"
            />
          )}
          <GuideItem
            icon={<div className="text-cyan-400 transition-colors"><FaRegHandRock /></div>}
            text="ROTATE 3D USING FIST"
          />
          <GuideItem
            icon={<div className="flex gap-1 text-cyan-400 transition-colors"><FaHandSparkles className="scale-x-[-1]" /><FaHandSparkles /></div>}
            text="ZOOM IN/OUT (BOTH HANDS)"
          />
          <GuideItem
            icon={<div className="text-cyan-400 transition-colors"><HiOutlineHandRaised /></div>}
            text="System Reset"
          />
        </div>
      </div>

      {/* Scanline Overlay (Visual Polish) */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,212,255,0.025)_50%)] bg-[length:100%_4px] animate-scanline z-40 opacity-50" />
      <div className="absolute inset-0 pointer-events-none box-border border-2 border-cyan-400/10 shadow-[inset_0_0_100px_rgba(0,212,255,0.05)] z-40" />
    </div>
  );
}

// Helper Component for Guide Items
function GuideItem({ icon, text }) {
  return (
    <div className="flex items-center gap-3 md:gap-4 p-1 rounded hover:bg-cyan-500/5 transition-all group/item cursor-default overflow-hidden">
      <div className="w-8 md:w-10 flex-shrink-0 flex justify-center text-base md:text-xl filter drop-shadow-[0_0_8px_rgba(0,212,255,0.6)]">
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[8px] md:text-[11px] font-bold tracking-[0.1em] text-cyan-100 uppercase leading-tight">
          {text}
        </span>
      </div>
    </div>
  );
}
