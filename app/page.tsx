'use client';

import { useState, useRef } from 'react';
import styles from './page.module.css';
import ThreeCanvas, { type ThreeCanvasHandles } from './components/ThreeCanvas';

// This map translates Rhubarb's output to your specific model's viseme names.
export type RhubarbVisemeKey = 'X' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

// You will also need a type for this new map shape
type VisemeMapEntry = { viseme: string; jaw: number };

const rhubarbToVisemeMap: Record<RhubarbVisemeKey, VisemeMapEntry> = {
  'X': { viseme: 'viseme_sil', jaw: 0 },
  'A': { viseme: 'viseme_aa', jaw: 0.5 }, // Open jaw for "ah"
  'B': { viseme: 'viseme_PP', jaw: 0 },   // Closed for "b, p, m"
  'C': { viseme: 'viseme_E',  jaw: 0.2 }, // Slightly open for "ee, i"
  'D': { viseme: 'viseme_DD', jaw: 0.2 },
  'E': { viseme: 'viseme_E',  jaw: 0.3 }, // Open for "eh"
  'F': { viseme: 'viseme_FF', jaw: 0.2 },
  'G': { viseme: 'viseme_kk', jaw: 0.2 },
  'H': { viseme: 'viseme_O',  jaw: 0.4 }, // Very open for "oh"
};

const BACKEND_URL = "http://43.203.230.137:5001";

const characters = {
  harry: {
    name: 'Harry (The Potter)',
    modelUrl: '/models/Harry.glb',
    introAnimationUrl: "/idleanimations/harryuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/Stretching.fbx",
    interruptAnimationUrl: "/idleanimations/StandIdle.fbx",
    animationUrl: '/idleanimations/LookingAround.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
  },  
  Joy: {
    name: 'Joy (Dishwashing Expert)',
    modelUrl: '/models/Joy.glb',
    introAnimationUrl: "/idleanimations/Joyuniqueidle.fbx", 
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/InterruptIdle.fbx",
    animationUrl: '/idleanimations/Stretching.fbx',
    talkingAnimationUrl1: '/talkinganimations/Talking2.fbx',
    talkingAnimationUrl2: '/talkinganimations/Talking2.fbx',
  },
  Surf: {
    name: 'Surf (Fabcon Expert)',
    modelUrl: '/models/Surf.glb',
    introAnimationUrl: "/idleanimations/Surfuniqueidle.fbx",
    idleAnimationUrl: "/idleanimations/StandIdle.fbx",
    interruptAnimationUrl: "/idleanimations/Stretching.fbx",
    animationUrl: '/idleanimations/Stretching.fbx',
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedCharKey, setSelectedCharKey] = useState<CharacterKey>('harry');
  const [selectedBgKey, setSelectedBgKey] = useState<BackgroundKey>('studio');
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant'; text: string}>>([]);
  const [isSending, setIsSending] = useState(false);
  const [isTestingLipSync, setIsTestingLipSync] = useState(false);
  const [isTestingBVH, setIsTestingBVH] = useState(false);
  const canvasRef = useRef<ThreeCanvasHandles>(null);

  const selectedCharacter = characters[selectedCharKey];
  const selectedBackground = backgrounds[selectedBgKey];

  // --- CORRECTED CHAT SUBMIT HANDLER ---
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending || !chatInput.trim()) return;

  setIsSending(true);
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
          character: selectedCharKey,
          background: selectedBgKey
        }),
      });

      if (!companionResponse.ok) {
        throw new Error(`Companion API failed with status: ${companionResponse.status}`);
      }
      
      // The backend returns the raw Rhubarb cues in the 'visemes' property
      const result = await companionResponse.json();
      const {
        response: answer,
        audio_base64,
        visemes: rawVisemeCues,
        bvh_files: bvhFileNames,
        emotion,
      } = result;

      if (!answer) {
        throw new Error("Invalid or incomplete response from companion API");
      }
      
  // append assistant message to history
  setMessages(prev => [...prev, { role: 'assistant', text: answer }]);

      // Prepare optional assets
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

      // NEW ORDER: Speak first, then do the motion
      if (canvasRef.current) {
        // 1) Speech (if available)
        if (audioDataUri && processedVisemes) {
          await canvasRef.current.playAudioWithEmotionAndLipSync(
            audioDataUri,
            processedVisemes,
            emotion || 'neutral'
          );
        }
        // 2) Motion (if available)
        if (bvhUrls.length > 0) {
          await canvasRef.current.playAnimation(bvhUrls[0]);
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


  setMessages(prev => [...prev, { role: 'assistant', text: 'Static lip-sync test complete.' }]);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error("Lip-sync test failed:", error);
  setMessages(prev => [...prev, { role: 'assistant', text: `Error in test: ${errorMessage}` }]);
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
  setMessages(prev => [...prev, { role: 'assistant', text: 'Loading BVH...' }]);
      const testBvhUrl = `${BACKEND_URL}/generated_bvh/A_person_runs.bvh`;
      await canvasRef.current.playAnimation(testBvhUrl);
  setMessages(prev => [...prev, { role: 'assistant', text: 'BVH played.' }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
  setMessages(prev => [...prev, { role: 'assistant', text: `BVH test failed: ${msg}` }]);
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
      
  <div className={styles.rightPanel}>
        <ThreeCanvas
          ref={canvasRef}
          characterModelUrl={selectedCharacter.modelUrl}
          introAnimationUrl={selectedCharacter.introAnimationUrl}
          idleAnimationUrl={selectedCharacter.idleAnimationUrl}
          interruptAnimationUrl={selectedCharacter.interruptAnimationUrl}
          talkingAnimationUrl1={selectedCharacter.talkingAnimationUrl1}
          talkingAnimationUrl2={selectedCharacter.talkingAnimationUrl2}

          backgroundData={selectedBackground}
        />
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
            onChange={e => setChatInput(e.target.value)}
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