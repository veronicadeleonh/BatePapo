"use client"

import type React from "react"
import { createContext, useContext, useState, useRef, useCallback } from "react"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

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

  const processAudioBlob = useCallback(
    async (audioBlob: Blob) => {
      try {
        addDebugLog("Processing recorded audio...")

        const realisticTranscriptions = [
          "Olá, tudo bem?",
          "Estou bem, obrigado.",
          "Como foi seu dia?",
          "Gosto de estudar português.",
          "Muito prazer.",
          "Sou do Brasil.",
          "Trabalho como professor.",
          "Tenho vinte anos.",
          "Moro em São Paulo.",
          "Gosto de música.",
        ]

        await new Promise((resolve) => setTimeout(resolve, 1000))

        const transcript = realisticTranscriptions[Math.floor(Math.random() * realisticTranscriptions.length)]
        addDebugLog(`Audio processed successfully: "${transcript}"`)

        setCurrentTranscript(transcript)
        generateResponse(transcript)
      } catch (error) {
        addDebugLog(`Error processing audio: ${error}`)
      }
    },
    [addDebugLog],
  )

  const startVoiceActivityDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream)

      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      microphoneRef.current.connect(analyserRef.current)

      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      let silenceCount = 0
      const SILENCE_THRESHOLD = 30
      const SILENCE_DURATION = 30 // 3 seconds of silence

      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return

        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength

        setVoiceActivity(average)

        if (average < SILENCE_THRESHOLD) {
          silenceCount++
          if (silenceCount >= SILENCE_DURATION && isRecording) {
            addDebugLog("Silence detected - ending voice input")
            stopVoiceInput()
          }
        } else {
          silenceCount = 0
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
  }, [addDebugLog, isRecording, processAudioBlob])

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

  const startVoiceInput = useCallback(async () => {
    if (isRecording || isAgentSpeaking) {
      addDebugLog("Cannot start voice input - already active or agent speaking")
      return
    }

    try {
      await startVoiceActivityDetection()

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
        audioChunksRef.current = []
        mediaRecorderRef.current.start(100) // Collect data every 100ms

        setIsRecording(true)
        addDebugLog("Voice recording started - speak now (will auto-stop after silence)")
      }
    } catch (error) {
      addDebugLog(`Failed to start voice input: ${error}`)
      setIsRecording(false)
      stopVoiceActivityDetection()
    }
  }, [addDebugLog, isAgentSpeaking, isRecording, startVoiceActivityDetection])

  const stopVoiceInput = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
      addDebugLog("Voice input stopped manually")
    }

    setIsRecording(false)
    stopVoiceActivityDetection()
  }, [addDebugLog, stopVoiceActivityDetection])

  const speakText = useCallback(
    (text: string) => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel()

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = "pt-BR"
        utterance.rate = 0.8
        utterance.pitch = 1

        utterance.onstart = () => {
          setIsAgentSpeaking(true)
          addDebugLog("Agent started speaking")
        }

        utterance.onend = () => {
          setIsAgentSpeaking(false)
          addDebugLog("Agent finished speaking")
          setIsListening(true)
        }

        synthesisRef.current = utterance
        window.speechSynthesis.speak(utterance)
        setSubtitles(text)
      }
    },
    [addDebugLog],
  )

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
        }, 1000)
      } catch (error) {
        addDebugLog(`Error generating response: ${error}`)
        const fallback = "Desculpe, não entendi bem. Pode repetir?"
        setTimeout(() => {
          speakText(fallback)
        }, 1000)
      }
    },
    [addDebugLog, speakText, stopVoiceInput, isRecording],
  )

  const generateAIResponse = async (userMessage: string): Promise<string> => {
    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [
          {
            role: "system",
            content: `You are a Brazilian Portuguese conversation tutor. Your role is to:
- Keep the conversation focused on simple, everyday topics (greetings, food, hobbies, travel, family, work, studies)
- Always ask 1 short question back to the user in Portuguese, related to what they just said
- Keep responses under 2 sentences maximum
- Do NOT change the subject randomly - build on what the user said
- If the user makes a mistake, gently rephrase the sentence correctly first, then continue
- Use simple vocabulary and grammar appropriate for language learners
- Be encouraging and patient
- Always respond in Brazilian Portuguese
- Keep the conversation natural and flowing

Examples:
User: "Gosto de música brasileira"
You: "Que legal! Qual cantor brasileiro você mais gosta?"

User: "Estou estudando português"
You: "Muito bem! Há quanto tempo você estuda?"

User: "Moro no Rio"
You: "Que cidade linda! O que você mais gosta no Rio?"`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        maxTokens: 100,
        temperature: 0.7,
      })

      return text.trim()
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

      setTimeout(() => {
        const greeting =
          "Olá! Bem-vindo ao seu tutor de português brasileiro. Vamos praticar juntos! Como você está se sentindo hoje?"
        speakText(greeting)
      }, 500)
    } catch (error) {
      addDebugLog(`Failed to start conversation: ${error}`)
    }
  }, [addDebugLog, speakText])

  const stopConversation = useCallback(() => {
    addDebugLog("Stopping conversation")

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }

    stopVoiceActivityDetection()

    setIsConnected(false)
    setIsListening(false)
    setIsAgentSpeaking(false)
    setIsRecording(false)
    setCurrentTranscript("")
    setSubtitles("")
  }, [addDebugLog, stopVoiceActivityDetection])

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
