"use client"

import type React from "react"
import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react"

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

interface VoiceContextType {
  isListening: boolean
  isConnected: boolean
  isAgentSpeaking: boolean
  isRecording: boolean
  currentTranscript: string
  subtitles: string
  startConversation: () => Promise<void>
  stopConversation: () => void
  sendTextMessage: (message: string) => void
  startVoiceInput: () => void
  stopVoiceInput: () => void
  debugInfo: string[]
  voiceActivity: number
}

const VoiceContext = createContext<VoiceContextType | null>(null)

export function AppVoiceProvider({ children }: { children: React.ReactNode }) {
  const [isListening, setIsListening] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const isRecordingRef = useRef(false)
  const [isAutoListening, setIsAutoListening] = useState(false)
  const isAutoListeningRef = useRef(false)
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [subtitles, setSubtitles] = useState("")
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [voiceActivity, setVoiceActivity] = useState(0)
  const [bestVoice, setBestVoice] = useState<SpeechSynthesisVoice | null>(null)
  
  // Real-time speech recognition refs
  const recognitionRef = useRef<any>(null)
  const isRecognitionActiveRef = useRef(false)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTranscriptRef = useRef<string>('')
  const isConnectedRef = useRef(false)

  // Get best available Portuguese voice based on priority list  
  const getBestPortugueseVoice = useCallback((logFunction?: (msg: string) => void): SpeechSynthesisVoice | null => {
    if (!("speechSynthesis" in window)) return null

    const voices = window.speechSynthesis.getVoices()
    if (voices.length === 0) return null

    // Priority list for Brazilian Portuguese voices
    const voicePriority = [
      // Microsoft voices
      /microsoft francisca/i,
      /francisca/i,
      // Google voices
      /google português do brasil/i,
      /português.*brasil/i,
      /brazilian/i,
      // Other Portuguese voices
      /luciana/i,
      /paulina/i,
      // Fallback to any Portuguese voice
      /pt-br/i,
      /portuguese.*brazil/i,
      /portuguese/i
    ]

    // Find the best voice based on priority
    for (const pattern of voicePriority) {
      const voice = voices.find(v => 
        pattern.test(v.name) && (v.lang.includes('pt-BR') || v.lang.includes('pt'))
      )
      if (voice) {
        logFunction?.(`Selected voice: ${voice.name} (${voice.lang})`)
        return voice
      }
    }

    // Final fallback to any Portuguese voice
    const fallbackVoice = voices.find(v => v.lang.includes('pt'))
    if (fallbackVoice) {
      logFunction?.(`Fallback voice: ${fallbackVoice.name} (${fallbackVoice.lang})`)
      return fallbackVoice
    }

    logFunction?.("No Portuguese voice found, using default")
    return null
  }, [])

  // Voice loading useEffect to initialize best voice
  useEffect(() => {
    if (!("speechSynthesis" in window)) return

    const loadVoices = () => {
      const voice = getBestPortugueseVoice()
      if (voice && voice !== bestVoice) {
        setBestVoice(voice)
      }
    }

    // Load voices immediately if available
    loadVoices()

    // Listen for voices loaded event (some browsers load asynchronously)
    const handleVoicesChanged = () => {
      loadVoices()
    }

    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
    }
  }, [getBestPortugueseVoice, bestVoice])

  // Cleanup real-time speech recognition
  useEffect(() => {
    return () => {
      // Clear any pending silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      
      // Stop recognition
      if (recognitionRef.current && isRecognitionActiveRef.current) {
        recognitionRef.current.stop()
        isRecognitionActiveRef.current = false
      }
    }
  }, [])

  // Cleanup speech synthesis on component mount and unmount
  useEffect(() => {
    // Cancel any existing speech synthesis on mount
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    // Add event listener for page refresh/navigation
    const handleBeforeUnload = () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    // Cleanup function for component unmount
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const addDebugLog = useCallback((message: string) => {
    console.log(`[v0] ${message}`)
    setDebugInfo((prev) => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${message}`])
  }, [])

  // Keep isConnectedRef in sync and debug connection changes
  useEffect(() => {
    isConnectedRef.current = isConnected
    addDebugLog(`🔗 Connection state changed: ${isConnected}`)
  }, [isConnected, addDebugLog])

  // Forward declarations for mutual dependencies
  let startRealTimeSpeechRecognition: () => boolean

  // Silence detection for speech processing
  const handleSpeechSilence = useCallback((transcript: string) => {
    // Clear any existing timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
    }

    // Set a timer to process speech after 2.5 seconds of silence
    silenceTimerRef.current = setTimeout(() => {
      const timestamp = new Date().toISOString()
      
      // CONSOLE LOG: User stopped speaking (silence detected)
      console.log(`🛑 [${timestamp}] USER STOPPED SPEAKING - Silence detected after pause, processing: "${transcript}"`)
      
      addDebugLog(`⏸️ Silence detected after 2.5s - processing speech: "${transcript}"`)
      setCurrentTranscript(transcript)
      
      // Stop recognition and process response
      stopRealTimeSpeechRecognition()
      generateResponse(transcript)
    }, 2500) // 2.5 second silence threshold - more patient!
  }, [addDebugLog])

  const stopRealTimeSpeechRecognition = useCallback(() => {
    // Clear any pending silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    
    if (recognitionRef.current && isRecognitionActiveRef.current) {
      addDebugLog("⏹️ Stopping speech recognition")
      recognitionRef.current.stop()
      isRecognitionActiveRef.current = false
      setIsListening(false)
      setIsRecording(false)
    }
  }, [addDebugLog])

  // Forward declaration - will be defined after generateResponse
  let processAudioBlob: any

  const startVoiceActivityDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream)

      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      microphoneRef.current.connect(analyserRef.current)

      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      let silenceCount = 0
      let speechCount = 0
      const SILENCE_THRESHOLD = 10 // Lower threshold for better silence detection  
      const SPEECH_THRESHOLD = 15 // Much lower threshold to detect speech easier
      const SILENCE_DURATION = 8 // 0.8 seconds of silence to stop (very fast)
      const SPEECH_DURATION = 2 // Need 2 frames of speech to start (faster)

      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return

        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength

        setVoiceActivity(average)

        // Add debug logging every 10 frames (1 second) - but only if state changed or debugging needed
        const currentTime = Date.now()
        if (currentTime % 1000 < 100) {
          addDebugLog(`Voice level: ${average.toFixed(1)}, AutoListening: ${isAutoListeningRef.current}, Recording: ${isRecording}, AgentSpeaking: ${isAgentSpeaking}`)
        }
        
        if (isAutoListeningRef.current && !isAgentSpeaking) {
          if (average > SPEECH_THRESHOLD) {
            speechCount++
            silenceCount = 0
            
            // Start recording after detecting speech - but only once
            if (speechCount >= SPEECH_DURATION && !isRecordingRef.current) {
              addDebugLog(`Speech detected (${average.toFixed(1)}) - starting recording`)
              startRecording()
            }
          } else if (average < SILENCE_THRESHOLD) {
            silenceCount++
            speechCount = 0
            
            // Stop recording after silence
            if (silenceCount >= SILENCE_DURATION && isRecordingRef.current) {
              addDebugLog(`Silence detected (${average.toFixed(1)}) - ending voice input`)
              stopRecording()
            }
          } else {
            // Reset counters for medium activity
            speechCount = Math.max(0, speechCount - 1)
            silenceCount = Math.max(0, silenceCount - 1)
          }
        }
      }, 100)

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      })

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        audioChunksRef.current = []

        if (audioBlob.size > 0) {
          processAudioBlob(audioBlob)
        }
      }
    } catch (error) {
      addDebugLog(`Failed to start voice activity detection: ${error}`)
    }
  }, [addDebugLog, isRecording, isAutoListening, isAgentSpeaking, processAudioBlob])

  const stopVoiceActivityDetection = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }

    if (microphoneRef.current) {
      microphoneRef.current.disconnect()
      microphoneRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    setVoiceActivity(0)
  }, [])

  const startRecording = useCallback(() => {
    if (isRecordingRef.current || isAgentSpeaking) {
      return
    }

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
        audioChunksRef.current = []
        mediaRecorderRef.current.start(100) // Collect data every 100ms

        setIsRecording(true)
        isRecordingRef.current = true
        addDebugLog("Auto-recording started - speak now")
      }
    } catch (error) {
      addDebugLog(`Failed to start recording: ${error}`)
      setIsRecording(false)
      isRecordingRef.current = false
    }
  }, [addDebugLog, isAgentSpeaking])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
      addDebugLog("Auto-recording stopped")
    }
    setIsRecording(false)
    isRecordingRef.current = false
  }, [addDebugLog])

  const startVoiceInput = useCallback(async () => {
    // Start real-time speech recognition
    if (!isRecognitionActiveRef.current) {
      setIsAutoListening(true)
      isAutoListeningRef.current = true
      startRealTimeSpeechRecognition()
      addDebugLog("🎤 Real-time recognition enabled")
    }
  }, [addDebugLog, startRealTimeSpeechRecognition])

  const stopVoiceInput = useCallback(() => {
    // Stop real-time speech recognition
    setIsAutoListening(false)
    isAutoListeningRef.current = false
    stopRealTimeSpeechRecognition()
    addDebugLog("🛑 Real-time recognition disabled")
  }, [addDebugLog, stopRealTimeSpeechRecognition])

  const enableAutoListening = useCallback(() => {
    setIsAutoListening(true)
    addDebugLog("Auto-listening enabled")
    
    // Add a verification check
    setTimeout(() => {
      setIsAutoListening(prev => {
        addDebugLog(`AutoListening verification: ${prev}`)
        return prev
      })
    }, 100)
  }, [addDebugLog])

  const speakText = useCallback(
    (text: string) => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel()

        const utterance = new SpeechSynthesisUtterance(text)
        
        // Use best available Portuguese voice
        if (bestVoice) {
          utterance.voice = bestVoice
          utterance.lang = bestVoice.lang
        } else {
          // Fallback to getBestPortugueseVoice if bestVoice not set
          const voice = getBestPortugueseVoice(addDebugLog)
          if (voice) {
            utterance.voice = voice
            utterance.lang = voice.lang
            setBestVoice(voice) // Cache for next time
          } else {
            utterance.lang = "pt-BR"
          }
        }
        
        utterance.rate = 0.9 // Slightly faster speech for better flow
        utterance.pitch = 1

        utterance.onstart = () => {
          const ttsTimestamp = new Date().toISOString()
          
          // CONSOLE LOG: TTS begins
          console.log(`🔊 [${ttsTimestamp}] TTS BEGINS - Agent started speaking: "${text}"`)
          
          setIsAgentSpeaking(true)
          // Stop real-time recognition while agent speaks
          stopRealTimeSpeechRecognition()
          setIsAutoListening(false)
          isAutoListeningRef.current = false
          addDebugLog("🗣️ Agent started speaking - speech recognition paused")
        }

        utterance.onend = () => {
          const ttsEndTimestamp = new Date().toISOString()
          
          // CONSOLE LOG: TTS ends
          console.log(`🔇 [${ttsEndTimestamp}] TTS ENDS - Agent finished speaking, preparing to listen`)
          
          setIsAgentSpeaking(false)
          addDebugLog("✅ Agent finished speaking")
          
          // Resume real-time recognition after agent finishes
          isAutoListeningRef.current = true
          setIsAutoListening(true)
          
          // Simple restart approach - just try to restart recognition
          setTimeout(() => {
            addDebugLog(`🔄 Attempting to restart recognition - isConnected: ${isConnectedRef.current}`)
            
            // Force restart recognition regardless of state checks for now
            if (typeof startRealTimeSpeechRecognition === 'function') {
              const success = startRealTimeSpeechRecognition()
              if (success) {
                console.log(`🎤 [${new Date().toISOString()}] SPEECH RECOGNITION RESTARTED - Ready to listen`)
                addDebugLog(`✅ Speech recognition restarted successfully`)
              } else {
                addDebugLog(`❌ Failed to restart speech recognition`)
                
                // If it fails, let's try again after a bit more time
                setTimeout(() => {
                  const success2 = startRealTimeSpeechRecognition()
                  if (success2) {
                    console.log(`🎤 [${new Date().toISOString()}] SPEECH RECOGNITION RESTARTED - Ready to listen (second attempt)`)
                    addDebugLog(`✅ Speech recognition restarted on second attempt`)
                  } else {
                    addDebugLog(`❌ Failed to restart speech recognition on second attempt`)
                  }
                }, 500)
              }
            } else {
              addDebugLog(`❌ startRealTimeSpeechRecognition function not available`)
            }
          }, 300)
        }

        synthesisRef.current = utterance
        window.speechSynthesis.speak(utterance)
        setSubtitles(text)
      }
    },
    [addDebugLog, bestVoice, getBestPortugueseVoice, stopRealTimeSpeechRecognition, isConnected],
  )

  const getContextualResponse = (userMessage: string): string[] => {
    // Greeting responses
    if (userMessage.includes('olá') || userMessage.includes('oi') || userMessage.includes('bom dia') || userMessage.includes('boa tarde')) {
      return [
        'Olá! Como você está hoje?',
        'Oi! Que bom te ver aqui. Como foi seu dia?',
        'Olá! Está tudo bem com você?'
      ]
    }
    
    // Feeling responses
    if (userMessage.includes('bem') || userMessage.includes('bom') || userMessage.includes('ótimo')) {
      return [
        'Que bom! O que você gosta de fazer no seu tempo livre?',
        'Fico feliz em saber! Conte-me sobre seus hobbies.',
        'Excelente! Qual é sua comida brasileira favorita?'
      ]
    }
    
    // Music responses
    if (userMessage.includes('música') || userMessage.includes('cantar') || userMessage.includes('samba')) {
      return [
        'Que legal! Qual estilo de música brasileira você mais gosta?',
        'Música é maravilhosa! Você conhece algum cantor brasileiro?',
        'Adoro música também! Você sabe dançar samba?'
      ]
    }
    
    // Food responses
    if (userMessage.includes('comida') || userMessage.includes('comer') || userMessage.includes('feijoada')) {
      return [
        'Hmm, delicioso! Qual prato brasileiro você mais gosta?',
        'Que bom! Você já experimentou feijoada?',
        'Comida brasileira é incrível! Você cozinha?'
      ]
    }
    
    // Study responses
    if (userMessage.includes('estudar') || userMessage.includes('português') || userMessage.includes('aprender')) {
      return [
        'Muito bem! Há quanto tempo você estuda português?',
        'Que dedicação! O que mais gosta na língua portuguesa?',
        'Parabéns! Por que decidiu aprender português?'
      ]
    }
    
    // Work responses
    if (userMessage.includes('trabalho') || userMessage.includes('trabalhar') || userMessage.includes('emprego')) {
      return [
        'Interessante! Em que área você trabalha?',
        'Que legal! Você gosta do seu trabalho?',
        'Trabalho é importante! Onde você trabalha?'
      ]
    }
    
    // Travel responses
    if (userMessage.includes('viajar') || userMessage.includes('brasil') || userMessage.includes('cidade')) {
      return [
        'Que aventura! Qual cidade brasileira você quer visitar?',
        'Viagem é ótima! Você já esteve no Brasil?',
        'Adoraria saber mais! Que lugar você mais quer conhecer?'
      ]
    }
    
    // Default encouraging responses
    return [
      'Muito interessante! Pode me contar mais sobre isso?',
      'Que legal! Como você se sente sobre isso?',
      'Entendi! O que mais você gostaria de compartilhar?',
      'Que bom saber isso! E o que você acha?',
      'Interessante! Você pode explicar melhor?'
    ]
  }

  const generateAIResponse = async (userMessage: string): Promise<string> => {
    const aiStartTime = performance.now()
    
    try {
      // Simple local AI response system - free and offline
      const responses = getContextualResponse(userMessage.toLowerCase())
      
      // Generate response instantly - no artificial delay
      const randomResponse = responses[Math.floor(Math.random() * responses.length)]
      
      const aiEndTime = performance.now()
      addDebugLog(`⚡ AI response generated in ${(aiEndTime - aiStartTime).toFixed(1)}ms`)
      
      return randomResponse
    } catch (error) {
      const errorTime = performance.now()
      addDebugLog(`❌ AI generation failed after ${(errorTime - aiStartTime).toFixed(1)}ms: ${error}`)
      
      // Ultra-fast fallback response
      return "Desculpe, pode repetir?"
    }
  }

  const generateResponse = useCallback(
    async (userMessage: string) => {
      const responseStartTime = performance.now()
      const timestamp = new Date().toISOString()
      
      try {
        // CONSOLE LOG: AI response generation starts
        console.log(`🤖 [${timestamp}] AI RESPONSE STARTS - Generating response for: "${userMessage}"`)
        
        addDebugLog(`🤔 Generating AI response for: "${userMessage}"`)
        setIsListening(false)
        if (isRecording) {
          stopVoiceInput()
        }

        const response = await generateAIResponse(userMessage)
        
        const responseReadyTime = performance.now()
        const responseTimestamp = new Date().toISOString()
        
        // CONSOLE LOG: AI response ready
        console.log(`⚡ [${responseTimestamp}] AI RESPONSE READY - "${response}" (${(responseReadyTime - responseStartTime).toFixed(1)}ms)`)
        
        addDebugLog(`⚡ Response ready in ${(responseReadyTime - responseStartTime).toFixed(1)}ms`)

        // Speak immediately - no artificial delay
        speakText(response)
        
        const speechStartTime = performance.now()
        addDebugLog(`🗣️ Speech started ${(speechStartTime - responseStartTime).toFixed(1)}ms after response generation`)
        
      } catch (error) {
        const errorTime = performance.now()
        const errorTimestamp = new Date().toISOString()
        
        console.log(`❌ [${errorTimestamp}] AI RESPONSE ERROR - ${error} (${(errorTime - responseStartTime).toFixed(1)}ms)`)
        addDebugLog(`❌ Error generating response after ${(errorTime - responseStartTime).toFixed(1)}ms: ${error}`)
        
        const fallback = "Desculpe, não entendi bem. Pode repetir?"
        // Immediate fallback speech - no delay
        speakText(fallback)
      }
    },
    [addDebugLog, stopVoiceInput, generateAIResponse],
  )

  // Now define startRealTimeSpeechRecognition after generateResponse
  startRealTimeSpeechRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      addDebugLog("❌ Speech recognition not supported in this browser")
      return false
    }

    if (isRecognitionActiveRef.current) {
      addDebugLog("🎤 Speech recognition already active")
      return true
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      
      // Configure for continuous real-time recognition
      recognitionRef.current.lang = 'pt-BR'
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.maxAlternatives = 1

      recognitionRef.current.onstart = () => {
        isRecognitionActiveRef.current = true
        setIsListening(true)
        setIsRecording(true)
        addDebugLog("🎤 Real-time speech recognition started")
      }

      recognitionRef.current.onresult = (event: any) => {
        const results = event.results
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = 0; i < results.length; i++) {
          const transcript = results[i][0].transcript
          if (results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        // Get the most recent transcript (interim or final)
        const currentTranscript = finalTranscript || interimTranscript

        // Show interim results for better UX
        if (interimTranscript) {
          setCurrentTranscript(`${interimTranscript}...`)
          addDebugLog(`💭 Interim: "${interimTranscript}"`)
        }

        // Handle final results immediately
        if (finalTranscript.trim()) {
          const cleanTranscript = finalTranscript.trim()
          const timestamp = new Date().toISOString()
          
          // CONSOLE LOG: Final result received
          console.log(`🛑 [${timestamp}] USER STOPPED SPEAKING - Final result: "${cleanTranscript}"`)
          
          addDebugLog(`✅ Final transcript: "${cleanTranscript}"`)
          setCurrentTranscript(cleanTranscript)
          
          // Clear any silence timer since we got a final result
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
          }
          
          // Process immediately
          stopRealTimeSpeechRecognition()
          generateResponse(cleanTranscript)
        } else if (currentTranscript.trim() && currentTranscript !== lastTranscriptRef.current) {
          // Update last transcript and start silence detection for interim results
          lastTranscriptRef.current = currentTranscript.trim()
          handleSpeechSilence(currentTranscript.trim())
        }
      }

      recognitionRef.current.onerror = (event: any) => {
        addDebugLog(`❌ Speech recognition error: ${event.error}`)
        
        // Handle specific errors
        if (event.error === 'no-speech') {
          addDebugLog("🔇 No speech detected, continuing to listen...")
        } else if (event.error === 'aborted') {
          addDebugLog("⏹️ Speech recognition aborted")
        } else {
          // Restart recognition on other errors
          setTimeout(() => {
            if (isConnected && !isAgentSpeaking) {
              addDebugLog("🔄 Restarting speech recognition after error")
              startRealTimeSpeechRecognition()
            }
          }, 1000)
        }
      }

      recognitionRef.current.onend = () => {
        isRecognitionActiveRef.current = false
        setIsRecording(false)
        addDebugLog("🛑 Speech recognition ended")
        
        // Auto-restart if still connected and agent not speaking
        if (isConnected && !isAgentSpeaking && isAutoListeningRef.current) {
          setTimeout(() => {
            addDebugLog("🔄 Auto-restarting speech recognition")
            startRealTimeSpeechRecognition()
          }, 100)
        } else {
          setIsListening(false)
        }
      }

      recognitionRef.current.start()
      return true
      
    } catch (error) {
      addDebugLog(`❌ Failed to start speech recognition: ${error}`)
      return false
    }
  }, [addDebugLog, isConnected, isAgentSpeaking])

  const sendTextMessage = useCallback(
    (message: string) => {
      if (message.trim() && !isAgentSpeaking) {
        addDebugLog(`User typed: "${message}"`)
        setCurrentTranscript(message)
        generateResponse(message)
      }
    },
    [addDebugLog, generateResponse, isAgentSpeaking],
  )

  const startConversation = useCallback(async () => {
    try {
      addDebugLog("🚀 Starting conversation with real-time recognition")
      setIsConnected(true)
      
      // Enable auto-listening for continuous recognition
      setIsAutoListening(true)
      isAutoListeningRef.current = true
      
      // Start with a greeting immediately  
      const greeting = "Olá! Bem-vindo ao seu tutor de português brasileiro. Vamos praticar juntos! Como você está hoje?"
      speakText(greeting)
      
      addDebugLog("✅ Conversation started - real-time recognition will activate after greeting")
    } catch (error) {
      addDebugLog(`❌ Failed to start conversation: ${error}`)
    }
  }, [addDebugLog, speakText])

  const stopConversation = useCallback(() => {
    addDebugLog("⏹️ Stopping conversation")

    // Stop speech synthesis
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    // Stop real-time recognition
    stopRealTimeSpeechRecognition()
    
    // Reset all states
    setIsAutoListening(false)
    isAutoListeningRef.current = false
    setIsConnected(false)
    setIsListening(false)
    setIsAgentSpeaking(false)
    setIsRecording(false)
    isRecordingRef.current = false
    setCurrentTranscript("")
    setSubtitles("")
    
    addDebugLog("✅ Conversation stopped - all recognition disabled")
  }, [addDebugLog, stopRealTimeSpeechRecognition])

  const value: VoiceContextType = {
    isListening,
    isConnected,
    isAgentSpeaking,
    isRecording,
    currentTranscript,
    subtitles,
    startConversation,
    stopConversation,
    sendTextMessage,
    startVoiceInput,
    stopVoiceInput,
    debugInfo,
    voiceActivity,
  }

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoice() {
  const context = useContext(VoiceContext)
  if (!context) {
    throw new Error("useVoice must be used within AppVoiceProvider")
  }
  return context
}