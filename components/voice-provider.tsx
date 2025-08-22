"use client"

import type React from "react"
import { createContext, useContext, useState, useRef, useCallback } from "react"

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
    // This method is kept for compatibility but now just enables auto-listening
    if (!isAutoListening) {
      setIsAutoListening(true)
      addDebugLog("Auto-listening enabled")
    }
  }, [addDebugLog, isAutoListening])

  const stopVoiceInput = useCallback(() => {
    setIsAutoListening(false)
    isAutoListeningRef.current = false
    stopRecording()
    addDebugLog("Auto-listening disabled")
  }, [addDebugLog, stopRecording])

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
        utterance.lang = "pt-BR"
        utterance.rate = 0.9 // Slightly faster speech for better flow
        utterance.pitch = 1

        utterance.onstart = () => {
          setIsAgentSpeaking(true)
          setIsAutoListening(false)
          isAutoListeningRef.current = false
          addDebugLog("Agent started speaking - auto-listening paused")
        }

        utterance.onend = () => {
          setIsAgentSpeaking(false)
          addDebugLog("Agent finished speaking")
          setIsListening(true)
          
          // Resume auto-listening using ref for immediate effect
          isAutoListeningRef.current = true
          setIsAutoListening(true)
          addDebugLog("Auto-listening force enabled after agent finished")
        }

        synthesisRef.current = utterance
        window.speechSynthesis.speak(utterance)
        setSubtitles(text)
      }
    },
    [addDebugLog, enableAutoListening],
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

  const generateResponse = useCallback(
    async (userMessage: string) => {
      try {
        addDebugLog(`Generating AI response for: "${userMessage}"`)
        setIsListening(false)
        if (isRecording) {
          stopVoiceInput()
        }

        const response = await generateAIResponse(userMessage)

        setTimeout(() => {
          speakText(response)
        }, 100)
      } catch (error) {
        addDebugLog(`Error generating response: ${error}`)
        const fallback = "Desculpe, não entendi bem. Pode repetir?"
        setTimeout(() => {
          speakText(fallback)
        }, 100)
      }
    },
    [addDebugLog, speakText, stopVoiceInput, isRecording],
  )

  // Now define processAudioBlob after generateResponse
  processAudioBlob = useCallback(
    async (audioBlob: Blob) => {
      try {
        addDebugLog("Starting real-time speech recognition...")
        
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
          addDebugLog("Speech recognition not supported in this browser")
          // Fallback to mock for unsupported browsers
          const transcript = "Desculpe, não consegui entender"
          setCurrentTranscript(transcript)
          generateResponse(transcript)
          return
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        const recognition = new SpeechRecognition()
        
        recognition.lang = 'pt-BR' // Portuguese (Brazil)
        recognition.continuous = false
        recognition.interimResults = false
        recognition.maxAlternatives = 1

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript
          addDebugLog(`Speech recognized: "${transcript}"`)
          setCurrentTranscript(transcript)
          generateResponse(transcript)
        }

        recognition.onerror = (event: any) => {
          addDebugLog(`Speech recognition error: ${event.error}`)
          // Fallback response
          const transcript = "Não consegui entender, pode repetir?"
          setCurrentTranscript(transcript)
          generateResponse(transcript)
        }

        recognition.onend = () => {
          addDebugLog("Speech recognition ended")
        }

        recognition.start()
        
      } catch (error) {
        addDebugLog(`Error with speech recognition: ${error}`)
        // Fallback response
        const transcript = "Erro de reconhecimento de voz"
        setCurrentTranscript(transcript)
        generateResponse(transcript)
      }
    },
    [addDebugLog, generateResponse],
  )

  const generateAIResponse = async (userMessage: string): Promise<string> => {
    try {
      // Simple local AI response system - free and offline
      const responses = getContextualResponse(userMessage.toLowerCase())
      
      // Near-instant response for snappy conversation
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const randomResponse = responses[Math.floor(Math.random() * responses.length)]
      return randomResponse
    } catch (error) {
      console.error("AI generation failed:", error)
      throw error
    }
  }

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
      addDebugLog("Starting conversation")
      setIsConnected(true)
      
      // Start voice activity detection immediately
      await startVoiceActivityDetection()
      
      setTimeout(() => {
        const greeting =
          "Olá! Bem-vindo ao seu tutor de português brasileiro. Vamos praticar juntos! Como você está hoje?"
        speakText(greeting)
        
        // Ensure auto-listening will be enabled after greeting
        addDebugLog("Conversation started - auto-listening will activate after greeting")
      }, 500)
    } catch (error) {
      addDebugLog(`Failed to start conversation: ${error}`)
    }
  }, [addDebugLog, speakText, startVoiceActivityDetection])

  const stopConversation = useCallback(() => {
    addDebugLog("Stopping conversation")

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    setIsAutoListening(false)
    isAutoListeningRef.current = false
    stopRecording()
    stopVoiceActivityDetection()

    setIsConnected(false)
    setIsListening(false)
    setIsAgentSpeaking(false)
    setIsRecording(false)
    isRecordingRef.current = false
    setCurrentTranscript("")
    setSubtitles("")
  }, [addDebugLog, stopVoiceActivityDetection, stopRecording])

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