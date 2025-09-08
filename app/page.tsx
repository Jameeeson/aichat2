'use client';

import { useState, useRef, useMemo } from 'react';
import styles from './page.module.css';
import ThreeCanvas, { type ThreeCanvasHandles } from './components/ThreeCanvas';
import { bvhPlayer } from './components/BVHAnimationPlayer';

// This map translates Rhubarb's output to your specific model's viseme names.
export type RhubarbVisemeKey = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

// You will also need a type for this new map shape
type VisemeMapEntry = { viseme: string; jaw: number };

const rhubarbToVisemeMap: Record<RhubarbVisemeKey, VisemeMapEntry> = {
  'X': { viseme: 'viseme_sil', jaw: 0 },
  'A': { viseme: 'viseme_aa', jaw: 0.8 }, // Open jaw for "ah"
  'B': { viseme: 'viseme_PP', jaw: 0.2 },   // Closed for "b, p, m"
  'C': { viseme: 'viseme_E',  jaw: 0.4 }, // Slightly open for "ee, i"
  'D': { viseme: 'viseme_DD', jaw: 0.02 },
  'E': { viseme: 'viseme_E',  jaw: 0.3 }, // Open for "eh"
  'F': { viseme: 'viseme_FF', jaw: 0.1 },
  'G': { viseme: 'viseme_kk', jaw: 0.1 },
  'H': { viseme: 'viseme_O',  jaw: 0.5 }, // Very open for "oh"
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

// Add gender to each character so we can pick the correct idle-pack dynamically.
type Gender = 'male' | 'female';

const characters: Record<string, {
  name: string;
  modelUrl: string;
  idleAnimationUrl?: string; // kept only as a fallback if needed
  typingAnimationUrl?: string;
  talkingAnimationUrl1?: string;
  talkingAnimationUrl2?: string;
  gender?: Gender;
}> = {
  Musician: {
    name: 'Musician',
    modelUrl: '/models/Harry.glb',
    typingAnimationUrl: '/idleanimations/waiting.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
    gender: 'male',
  },
  Teacher: {
    name: 'Teacher',
    modelUrl: '/models/Joy.glb',
    typingAnimationUrl: '/idleanimations/waiting.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
    gender: 'female',
  },
  Dancer: {
    name: 'Dancer',
    modelUrl: '/models/Surf.glb',
    typingAnimationUrl: '/idleanimations/waiting.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
    gender: 'female',
  },
  Police: {
    name: 'Police',
    modelUrl: '/models/policev2.glb',
    typingAnimationUrl: '/idleanimations/waiting.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
    gender: 'male',
  },
  Instructor: {
    name: 'Instructor',
    modelUrl: '/models/instructor.glb',
    typingAnimationUrl: '/idleanimations/waiting.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
  },
};

const backgrounds = {
  studio: { name: 'Studio', url: null, color: 0xffffff },
  forest: { name: 'Forest', url: '/textures/forest/forestbg.jpg' },
  city: { name: 'City at Night', url: '/textures/city/cyberbg.jpg' },
};

type CharacterKey = keyof typeof characters;
type BackgroundKey = keyof typeof backgrounds;
type RawVisemeCue = { start: number; end: number; value: RhubarbVisemeKey };


export default function Home() {
  const sanitizeDisplay = (text: string | null | undefined) => {
    if (!text) return '';
    // Remove square-bracket notes, double-curly action blocks {{...}},
    // then single braces as a fallback. Use [\s\S] so we match across newlines.
    return String(text)
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\{\{[\s\S]*?\}\}/g, '')
      .replace(/\{[^\}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Ensure the selected character key defaults to a real key from the map
  const defaultCharKey = (Object.keys(characters)[0] || 'Musician') as CharacterKey;
  const [selectedCharKey, setSelectedCharKey] = useState<CharacterKey>(defaultCharKey);
  const [selectedBgKey, setSelectedBgKey] = useState<BackgroundKey>('studio');
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant'; text: string}>>([]);
  const [isSending, setIsSending] = useState(false);
  const [isTestingLipSync, setIsTestingLipSync] = useState(false);
    const [isTestingBVH, setIsTestingBVH] = useState(false);
    const canvasRef = useRef<ThreeCanvasHandles>(null);
    // Manifest/polling refs for incremental steps
    const manifestRequestIdRef = useRef<string | null>(null);
    const manifestCancelRef = useRef<(() => void) | null>(null);
    const playedStepIndexRef = useRef<number>(0);
  const typingTimerRef = useRef<number | null>(null);
  const hadContentRef = useRef<boolean>(false);
  // If backend returns a generated background image (base64), store it here as a data URL
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);

  // Determine which idle animation to use based on the character's gender.
  // Female characters use the female idle pack, male characters use the male idle pack.
  // Return an array of idle FBX files for the given gender so ThreeCanvas can
  // sequence them one-by-one. Order is the playback sequence.
  const getGenderedIdle = (gender?: Gender): string[] => {
    if (gender === 'female') {
      return [
        '/idleanimations/female/F_Standing_Idle_001.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_001.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_002.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_003.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_004.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_005.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_006.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_007.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_008.fbx',
        '/idleanimations/female/F_Standing_Idle_Variations_009.fbx',
      ];
    }
    // male
    return [
      '/idleanimations/male/M_Standing_Idle_001.fbx',
      '/idleanimations/male/M_Standing_Idle_002.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_001.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_002.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_003.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_004.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_005.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_006.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_007.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_008.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_009.fbx',
      '/idleanimations/male/M_Standing_Idle_Variations_010.fbx',
    ];
  };

  // Choose effective idle animation for the selected character (gender-aware with fallback)
  const selectedCharacter = characters[selectedCharKey];
  // Memoize idle array so it doesn't change reference on every render (prevents canvas reload while typing)
  const effectiveIdleAnimationUrl: string | string[] = useMemo(() => {
    if (selectedCharacter?.gender) return getGenderedIdle(selectedCharacter.gender);
    if (selectedCharacter?.idleAnimationUrl) return [selectedCharacter.idleAnimationUrl];
    return ['/idleanimations/StandIdle.fbx'];
  }, [selectedCharKey]);

  const selectedBackground = backgrounds[selectedBgKey];

  // If a backend-generated background exists, prefer it; otherwise use the selected preset
  const effectiveBackground = customBackgroundUrl
    ? { name: 'Generated', url: customBackgroundUrl }
    : selectedBackground;

  // Compute inline style for the right panel: use generated background image when available
  const rightPanelStyle: React.CSSProperties = {
    // If a generated/custom background exists, use it as the panel background
    ...(customBackgroundUrl
      ? {
          backgroundImage: `url(${customBackgroundUrl})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        }
      : {}),
    // Always expose a CSS variable that the ::before pseudo-element can consume.
    // The property name uses a cast to any because React's CSSProperties doesn't
    // include custom properties in the typing.
    ['--wave-image' as any]: customBackgroundUrl ? `url(${customBackgroundUrl})` : "url('/wave.png')",
  };

  // Debug: show which idle animation file we're asking ThreeCanvas to load
  // (Check browser console / network to ensure file exists and loads)
  if (typeof window !== 'undefined') {
    console.log('Selected character:', selectedCharKey, 'gender:', selectedCharacter?.gender, 'idle:', Array.isArray(effectiveIdleAnimationUrl) ? effectiveIdleAnimationUrl.join(', ') : effectiveIdleAnimationUrl);
  }

  // --- CORRECTED CHAT SUBMIT HANDLER ---
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending || !chatInput.trim()) return;

  setIsSending(true);
  // Immediately clear typing pose/state so subsequent gestures/BVH start from neutral
  try {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    hadContentRef.current = false;
    canvasRef.current?.setTyping(false);
    // Temporarily disabled resetting to idle/T-pose on submit to preserve current pose while the request is processed
    // canvasRef.current?.resetToIdle?.();
  } catch (e) {
    console.warn('Failed to clear typing state on submit', e);
  }
  const userText = chatInput;
  // append user message to history immediately
  setMessages(prev => [...prev, { role: 'user', text: userText }]);
  const prompt = chatInput;
  setChatInput('');

    try {
      const companionResponse = await fetch(`${BACKEND_URL}/api/companion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: prompt,
          character: selectedCharKey
        }),
      });

      if (!companionResponse.ok) {
        throw new Error(`Companion API failed with status: ${companionResponse.status}`);
      }
      
      // The backend returns the raw Rhubarb cues in the 'visemes' property
      const result = await companionResponse.json();
      // Debug: log companion response keys and whether a background_image was returned
      try {
        console.log('page.tsx: companion response keys:', Object.keys(result || {}));
        const possibleBg = result && (result.background_image || result.background_image_base64 || result.background_imageBase64);
        if (possibleBg) {
          const len = typeof possibleBg === 'string' ? possibleBg.length : undefined;
          console.log('page.tsx: companion returned background image (base64), length:', len);
        } else {
          console.log('page.tsx: companion did NOT return a background image');
        }
      } catch (e) {
        console.warn('page.tsx: failed to inspect companion response for background image', e);
      }

      const {
        response: answer,
        audio_base64,
        visemes: rawVisemeCues,
        bvh_files: bvhFileNames,
        emotion,
        mixamo_animation,
        background_image,
        background_image_base64,
        background_imageBase64,
        generation_status,
        request_id,
        steps,
      } = result;


      // STEP 1: Set the background first and pause for it to render.
      const bg64 = background_image || background_image_base64 || background_imageBase64 || null;
      if (bg64) {
         try {
          console.log('page.tsx: Setting new background...');
          if (typeof bg64 === 'string' && bg64.startsWith('data:')) {
            setCustomBackgroundUrl(bg64);
          } else {
            const guessedMime = typeof bg64 === 'string' && bg64.slice(0,4) === '/9j/' ? 'image/jpeg' : 'image/png';
            setCustomBackgroundUrl(`data:${guessedMime};base64,${bg64}`);
          }
          // Add a small delay to give React time to render the new background
          // before the character starts talking. This makes the sequence feel more natural.
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms pause
         } catch (e) {
           console.warn('Failed to set custom background image from backend', e);
         }
      }

  // STEP 2: Now that the scene is set, decide flow.
      // If the backend is using the new audio-first manifest flow, defer showing
      // the full response: we'll append per-step messages when polling the manifest.
      // Prepare visible text for chat by stripping notes and action blocks
      const visible = String(answer || '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\{\{[\s\S]*?\}\}/g, '')
        .replace(/\{[^\}]*\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
  // Treat presence of request_id as a strong signal to use manifest polling,
  // even if the initial payload doesn't include steps yet. This avoids playing
  // a single early BVH and ensures we talk → BVH → next step for all steps.
  const isLikelyManifest = Boolean(request_id);
  const hasManifestSteps = Array.isArray(steps) && steps.length > 0;
      
      // Process assets for playback (immediate assets for step-1)
      let processedVisemes: Array<{ time: number; value: string; jaw: number }> | null = null;
      let audioDataUri: string | null = null;
      if (audio_base64 && rawVisemeCues && Array.isArray(rawVisemeCues)) {
        processedVisemes = rawVisemeCues.map((cue: RawVisemeCue) => {
          const entry = rhubarbToVisemeMap[cue.value] || rhubarbToVisemeMap['X'];
          return { time: cue.start, value: entry.viseme, jaw: entry.jaw };
        });
        if (rawVisemeCues.length > 0) {
          const lastCue = rawVisemeCues[rawVisemeCues.length - 1];
          processedVisemes.push({ time: lastCue.end, value: 'viseme_sil', jaw: 0 });
        }
        audioDataUri = `data:audio/mp3;base64,${audio_base64}`;
      }

      const bvhUrls = Array.isArray(bvhFileNames) && bvhFileNames.length > 0
        ? bvhFileNames.map((fileName: string) => `${BACKEND_URL}/generated_bvh/${fileName}`)
        : [];

      // NEW: Check for client-side stepwise parsing of multi-step responses
      const hasStepPattern = /Step\s+\d+:/i.test(visible);
      const shouldParseSteps = hasStepPattern && !isLikelyManifest && visible.length > 200;
      
      if (!isLikelyManifest && !shouldParseSteps) {
        // Single response: show message immediately
        setMessages(prev => [...prev, { role: 'assistant', text: visible }]);
      } else if (shouldParseSteps) {
        // Client-side stepwise parsing: extract steps and play them one by one
        console.log('page.tsx: Parsing multi-step response client-side');
        const parsedSteps = parseStepsFromText(visible);
        console.log('page.tsx: Parsed steps:', parsedSteps);
        console.log('page.tsx: Available BVH URLs:', bvhUrls);
        await playStepsSequentially(parsedSteps, audioDataUri, processedVisemes, emotion, bvhUrls);
        return; // Exit early to avoid duplicate playback
      } else if (isLikelyManifest) {
        // Manifest flow (preferred when request_id exists): start polling and avoid
        // playing a single early BVH or full response audio which would break sequencing.
        manifestRequestIdRef.current = String(request_id);
        playedStepIndexRef.current = 0;
        if (manifestCancelRef.current) {
          manifestCancelRef.current();
        }
        manifestCancelRef.current = startManifestPolling(String(request_id));
        // Defer UI text display to polling (per-step). Avoid further immediate playback.
        return;
      }

      // STEP 3: Play immediate speech/BVH for step-1 if present, otherwise start polling
      if (canvasRef.current) {
        // Single-response flow: play speech then BVH as before
        {
          // Single-response flow: play speech then BVH as before
          if (audioDataUri && processedVisemes) {
            const speech = canvasRef.current.playAudioWithEmotionAndLipSync(
              audioDataUri,
              processedVisemes,
              emotion || 'neutral'
            );

            if (mixamo_animation && canvasRef.current.playGestures) {
              try {
                const urls = Array.isArray(mixamo_animation) ? mixamo_animation : [mixamo_animation];
                const converted = urls.map((p: string) => (p.startsWith('/') ? p : `/gesturesanimation/${p}`));
                canvasRef.current.playGestures(converted).catch((e) => console.warn(e));
              } catch (e) {
                console.warn('Failed to start gestures', e);
              }
            }
            await speech; // Wait for speech to complete
          }

          // After speech, play the main body motion
          if (bvhUrls.length > 0) {
            await canvasRef.current.playAnimation(bvhUrls[0]);
            try { canvasRef.current?.resetToIdle?.(); } catch (e) {}
          }
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error("Chat submission error:", error);
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${errorMessage}` }]);
    } finally {
      setIsSending(false);
    }
  };

  // Helper: parse steps from multi-step text response
  const parseStepsFromText = (text: string): Array<{index: number, text: string, step: string}> => {
    const steps: Array<{index: number, text: string, step: string}> = [];
    
    // Improved regex to capture steps across multiple lines
    const stepMatches = text.match(/Step\s+\d+:[^]*?(?=Step\s+\d+:|$)/gi);
    console.log('page.tsx: parseStepsFromText - raw matches:', stepMatches);
    
    if (stepMatches) {
      stepMatches.forEach((stepText, index) => {
        // Clean up the text by removing action descriptions in {{}} and the step number
        const cleanText = stepText
          .replace(/\{\{[\s\S]*?\}\}/g, '') // Remove {{action descriptions}} (multi-line safe)
          .replace(/Step\s+\d+:\s*/i, '') // Remove "Step X:"
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        console.log(`page.tsx: parseStepsFromText - step ${index + 1}:`, {
          raw: stepText.substring(0, 100) + '...',
          cleaned: cleanText
        });
        
        if (cleanText) {
          steps.push({
            index: index + 1,
            text: cleanText,
            step: cleanText
          });
        }
      });
    }
    
    console.log('page.tsx: parseStepsFromText - final steps:', steps);
    return steps;
  };

  // Helper: play parsed steps sequentially with timing
  const playStepsSequentially = async (
    steps: Array<{index: number, text: string, step: string}>,
    fullAudioUri: string | null,
    fullVisemes: any[] | null,
    emotion: string,
    bvhUrls: string[]
  ) => {
    try {
      console.log('page.tsx: playStepsSequentially started', {
        stepsCount: steps.length,
        hasAudio: !!fullAudioUri,
        hasVisemes: !!fullVisemes,
        bvhCount: bvhUrls.length
      });

      // First, play the full audio with lip sync if available
      if (fullAudioUri && fullVisemes && canvasRef.current) {
        console.log('page.tsx: Playing full audio...');
        await canvasRef.current.playAudioWithEmotionAndLipSync(fullAudioUri, fullVisemes, (emotion as any) || 'neutral');
        console.log('page.tsx: Full audio completed');
      }

      // Then show each step text progressively with a delay
      console.log('page.tsx: Starting step-by-step display...');
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`page.tsx: Processing step ${step.index}/${steps.length}:`, step.text);
        
        // Add the step text to chat
        setMessages(prev => [...prev, { role: 'assistant', text: `Step ${step.index}: ${step.text}` }]);
        
        // Play corresponding BVH if available
        if (bvhUrls[i] && canvasRef.current) {
          console.log(`page.tsx: Playing BVH ${i+1}: ${bvhUrls[i]}`);
          try {
            await canvasRef.current.playAnimation(bvhUrls[i]);
            console.log(`page.tsx: BVH ${i+1} completed`);
          } catch (e) {
            console.warn(`Failed to play BVH for step ${step.index}:`, e);
          }
        } else {
          console.log(`page.tsx: No BVH available for step ${step.index} (index ${i})`);
        }
        
        // Small delay between steps (except for the last step)
        if (i < steps.length - 1) {
          console.log('page.tsx: Waiting 1 second before next step...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log('page.tsx: All steps completed, resetting to idle');
      // Reset to idle after all steps complete
      if (canvasRef.current) {
        try { canvasRef.current.resetToIdle?.(); } catch (e) {}
      }
    } catch (error) {
      console.error('Error in playStepsSequentially:', error);
      // Fallback: show all steps at once
      const allStepsText = steps.map(s => `Step ${s.index}: ${s.text}`).join('\n\n');
      setMessages(prev => [...prev, { role: 'assistant', text: allStepsText }]);
    }
  };

  // Helper: start manifest polling for stepwise playback. Returns cancel function.
  const startManifestPolling = (requestId: string) => {
    let cancelled = false;
    let playedIndex = playedStepIndexRef.current || 0;
    let emptyPolls = 0;
    const pollInterval = 1000;

    const mapRhCuesToVisemes = (raw: any[]) => (raw || []).map((cue: any) => {
      const entry = rhubarbToVisemeMap[(cue.value as RhubarbVisemeKey) || 'X'] || rhubarbToVisemeMap['X'];
      return { time: cue.start, value: entry.viseme, jaw: entry.jaw };
    });

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/companion/status/${requestId}`);
        if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
        const manifest = await res.json();
        const stepsList = manifest.steps || [];

        for (let i = playedIndex; i < stepsList.length; i++) {
          if (cancelled) return;
          const step = stepsList[i];
          // show step text then play audio then bvh
          // Remove square-bracket notes and double-curly action blocks before showing
          const stepText = String(step.step || '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\{\{[\s\S]*?\}\}/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (stepText) setMessages(prev => [...prev, { role: 'assistant', text: stepText }]);

          if (step.audio_base64) {
            try {
              const audioUri = `data:audio/mp3;base64,${step.audio_base64}`;
              const mapped = mapRhCuesToVisemes(step.visemes || []);
              await canvasRef.current?.playAudioWithEmotionAndLipSync?.(audioUri, mapped, manifest.emotion || 'neutral');
            } catch (e) { console.warn('manifest step audio failed', e); }
          } else if (step.step) {
            // fallback to /ask
            try {
              const askRes = await fetch(`${BACKEND_URL}/ask`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text: step.step, character: selectedCharKey }) });
              if (askRes.ok) {
                const askJson = await askRes.json();
                if (askJson.audio_base64) {
                  const audioUri = `data:audio/mp3;base64,${askJson.audio_base64}`;
                  const mapped = mapRhCuesToVisemes(askJson.visemes || []);
                  await canvasRef.current?.playAudioWithEmotionAndLipSync?.(audioUri, mapped, askJson.emotion || 'neutral');
                }
              }
            } catch (e) { console.warn('manifest step /ask fallback failed', e); }
          }

            if (Array.isArray(step.bvh_files) && step.bvh_files.length > 0) {
            const urls = step.bvh_files.map((f: string) => `${BACKEND_URL}/generated_bvh/${f}`);
            try {
              // Play each BVH sequentially using the simple, natural approach
              for (const url of urls) {
                await canvasRef.current?.playAnimation(url);
              }
            } catch (e) { console.warn('manifest step BVH play failed', e); }
            // Reset to idle after BVH sequence completes
            try { canvasRef.current?.resetToIdle?.(); } catch (e) {}
          }

          playedIndex = i + 1;
          playedStepIndexRef.current = playedIndex;
        }

        if (manifest.complete && playedIndex >= (manifest.steps || []).length) {
          return; // finished
        }

        if ((stepsList.length === playedIndex) || stepsList.length === 0) emptyPolls++; else emptyPolls = 0;
        const next = emptyPolls > 6 ? Math.min(5000, pollInterval * 3) : pollInterval;
        if (!cancelled) setTimeout(poll, next);
      } catch (err) {
        console.warn('manifest poll error', err);
        if (!cancelled) setTimeout(poll, 3000);
      }
    };

    poll();
    return () => { cancelled = true; };
  };

  const handleTestLipSync = async () => {
    setIsTestingLipSync(true);
    if (!canvasRef.current) {
      setChatResponse('Canvas not ready for testing.');
      setIsTestingLipSync(false);
      return;
    }
    if (isSending) return; 

    setIsSending(true); 
  // no placeholder in the bar; optional: push a system message if needed

    try {
      const response = await fetch('/audio/test-speech.json');
      if (!response.ok) {
        throw new Error(`Failed to load test-speech.json: ${response.statusText}`);
      }
      const rhubarbData = await response.json();

      const visemes = rhubarbData.mouthCues.map((cue: RawVisemeCue) => {
        const entry = rhubarbToVisemeMap[cue.value] || rhubarbToVisemeMap['X'];
        return {
            time: cue.start,
            value: entry.viseme, 
            jaw: entry.jaw       
        };
      });
      
      if (rhubarbData.mouthCues.length > 0) {
        const lastCue = rhubarbData.mouthCues[rhubarbData.mouthCues.length - 1];
        visemes.push({ time: lastCue.end, value: 'viseme_sil', jaw: 0 });
      }
      
      const audioResponse = await fetch('/sample.wav');
      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');
      const audioDataUri = `data:audio/mp3;base64,${audioBase64}`;
canvasRef.current.playAudioWithEmotionAndLipSync(audioDataUri, visemes, 'neutral');


  setMessages(prev => [...prev, { role: 'assistant', text: sanitizeDisplay('Static lip-sync test complete.') }]);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error("Lip-sync test failed:", error);
  setMessages(prev => [...prev, { role: 'assistant', text: sanitizeDisplay(`Error in test: ${errorMessage}`) }]);
    } finally {
      setIsSending(false);
      setIsTestingLipSync(false);
      
  // keep history; no placeholder reset
    }
  };

  const handleTestBVH = async () => {
    setIsTestingBVH(true);
    try {
      if (!canvasRef.current) {
        setChatResponse('Canvas not ready.');
        return;
      }
  setMessages(prev => [...prev, { role: 'assistant', text: sanitizeDisplay('Loading BVH...') }]);
      const testBvhUrl = `${BACKEND_URL}/generated_bvh/A_person_runs.bvh`;
      await canvasRef.current.playAnimation(testBvhUrl);
  setMessages(prev => [...prev, { role: 'assistant', text: sanitizeDisplay('BVH played.') }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
  setMessages(prev => [...prev, { role: 'assistant', text: sanitizeDisplay(`BVH test failed: ${msg}`) }]);
    } finally {
      setIsTestingBVH(false);
    }
  };

  return (
    <main suppressHydrationWarning className={`${styles.mainContainer} ${!isSidebarOpen ? styles.sidebarCollapsed : ''}`}>
  <div className={styles.leftPanel}>
        <div className={styles.sidebarCard}>
          <div className={styles.sidebarHeader}>
    <button className={styles.hamburger} aria-label="Close menu" onClick={() => setIsSidebarOpen(false)}>☰</button>
            <div className={styles.title}>Chats</div>
          </div>

          <div className={styles.searchWrap}>
            <input className={styles.searchInput} placeholder="Search" suppressHydrationWarning autoComplete="off" />
          </div>

          <div className={styles.personaList}>
            {(Object.keys(characters) as CharacterKey[]).map((key) => (
              <div
                key={key}
                className={`${styles.personaItem} ${selectedCharKey === key ? styles.personaActive : ''}`}
                onClick={() => setSelectedCharKey(key)}
              >
                <div className={styles.personaAvatar} />
                <div className={styles.personaName}>{characters[key].name.split(' ')[0]}</div>
              </div>
            ))}
          </div>

          <div className={styles.sidebarTools}>
            <div className={styles.toolsDivider} />
            <div className={styles.toolItem} onClick={() => alert('Profile')}>
              <span className={styles.toolIcon}>👤</span>
              <span>Profile</span>
            </div>
            <div className={styles.toolItem} onClick={() => alert('Settings')}>
              <span className={styles.toolIcon}>⚙️</span>
              <span>Settings</span>
            </div>
          </div>
        </div>
      </div>
      
  <div className={styles.rightPanel} style={rightPanelStyle}>
        <div style={{ position: 'absolute', inset: '0', bottom: '0', overflow: 'hidden' }}>
          <ThreeCanvas
            ref={canvasRef}
            characterModelUrl={selectedCharacter.modelUrl}
            idleAnimationUrl={effectiveIdleAnimationUrl}
            typingAnimationUrl={(selectedCharacter as any).typingAnimationUrl}
            talkingAnimationUrl1={selectedCharacter.talkingAnimationUrl1}
            talkingAnimationUrl2={selectedCharacter.talkingAnimationUrl2}
            backgroundData={effectiveBackground}
          />
        </div>
        {/* AI response bubble above the input, centered */}
        {messages.length > 0 && (
          <div className={styles.messageCard}>
            <div className={styles.messageContent}>
              {messages.slice(-4).map((m, idx) => (
                <div key={idx} style={{opacity: m.role === 'assistant' ? 1 : 0.95}}>
                  <strong>{m.role === 'assistant' ? selectedCharacter.name.split(' ')[0] : 'User'} :</strong>&nbsp;{m.text.replace(/\n\[none\]$/i, '').trim()}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Canvas overlays: floating hamburger (visible only when sidebar is closed) */}
  {!isSidebarOpen && (
          <div className={styles.canvasHamburger} onClick={() => setIsSidebarOpen(true)}>
            <svg width="20" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="5" width="18" height="2" rx="1" fill="white" />
              <rect x="3" y="11" width="18" height="2" rx="1" fill="white" opacity="0.9" />
              <rect x="3" y="17" width="18" height="2" rx="1" fill="white" opacity="0.8" />
            </svg>
          </div>
        )}



  <div className={styles.canvasChatBar}>
      <input
            type="text"
    placeholder="Write a message..."
            value={chatInput}
            onChange={e => {
              const v = e.target.value;
              setChatInput(v);
              // Transition: empty -> non-empty triggers typing pose once
              if (v.length > 0) {
                if (!hadContentRef.current) {
                  canvasRef.current?.setTyping(true);
                  hadContentRef.current = true;
                }
                // inactivity timer to drop back to idle after pause
                if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
                typingTimerRef.current = window.setTimeout(() => {
                  canvasRef.current?.setTyping(false);
                }, 600);
              } else {
                // Cleared textbox: immediately return to idle and reset state
                if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
                canvasRef.current?.setTyping(false);
                hadContentRef.current = false;
              }
            }}
            disabled={isSending}
      suppressHydrationWarning
      autoComplete="off"
          />
          <button
            className={styles.sendBtn || 'sendBtn'}
            aria-label="send message"
            onClick={(e) => { e.preventDefault(); handleChatSubmit(e as any); }}
            disabled={isSending || !chatInput.trim()}
          >
            ⤴
          </button>
        </div>
      </div>
    </main>
  );
}