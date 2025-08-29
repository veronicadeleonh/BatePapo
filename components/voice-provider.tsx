"use client"

import type React from "react"
import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react"
import { PORTUGUESE_TUTOR_CONFIG } from "@/lib/tutor-config"

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

// User profile interface for memory system
interface UserProfile {
  name?: string
  gender?: 'masculino' | 'feminino' | 'outro'
  preferences: {
    favoriteTopics: string[]
    learningGoals: string[]
    conversationStyle: 'formal' | 'casual' | 'friendly'
    preferredPace: 'slow' | 'normal' | 'fast'
  }
  conversationHistory: {
    date: string
    topics: string[]
    keyPoints: string[]
    mood: string
  }[]
  session1Progress: {
    currentStep: number // 1-4 for Session 1 steps, 5+ means completed
    completedSteps: {
      step1_greeting: boolean // Name collection
      step2_gender: boolean   // Gender identification
      step3_topics: boolean   // Topic preferences
      step4_goals: boolean    // Learning goals
    }
    isCompleted: boolean
  }
  createdAt: string
  lastActive: string
}

// Detailed conversation logging interfaces
interface ConversationExchange {
  id: string
  timestamp: string
  userInput: string
  aiResponse: string
  detectedTopics: string[]
  conversationFlow: 'greeting' | 'topic_introduction' | 'question' | 'response' | 'followup' | 'goodbye'
  responseTime: number
  mood: 'positive' | 'negative' | 'neutral'
  userEngagement: 'high' | 'medium' | 'low'
}

interface ConversationSession {
  sessionId: string
  startTime: string
  endTime?: string
  exchanges: ConversationExchange[]
  sessionDuration?: number
  totalExchanges: number
  dominantTopics: string[]
  flowPattern: string[]
}

interface VoiceContextType {
  isListening: boolean
  isConnected: boolean
  isAgentSpeaking: boolean
  isRecording: boolean
  currentTranscript: string
  subtitles: string
  typewriterText: string
  startConversation: () => Promise<void>
  stopConversation: () => void
  sendTextMessage: (message: string) => void
  startVoiceInput: () => void
  stopVoiceInput: () => void
  debugInfo: string[]
  voiceActivity: number
  userProfile: UserProfile
  updateUserProfile: (updates: Partial<UserProfile>) => void
  clearUserProfile: () => void
  currentSession: ConversationSession | null
  getAllSessions: () => ConversationSession[]
  exportConversationPatterns: () => string
  downloadConversationTranscript: () => void
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
  const [typewriterText, setTypewriterText] = useState("")
  const typewriterTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [voiceActivity, setVoiceActivity] = useState(0)
  const [bestVoice, setBestVoice] = useState<SpeechSynthesisVoice | null>(null)
  
  // User profile state for memory system
  const [userProfile, setUserProfile] = useState<UserProfile>({
    preferences: {
      favoriteTopics: [],
      learningGoals: [],
      conversationStyle: 'friendly',
      preferredPace: 'normal'
    },
    conversationHistory: [],
    session1Progress: {
      currentStep: 1,
      completedSteps: {
        step1_greeting: false,
        step2_gender: false,
        step3_topics: false,
        step4_goals: false
      },
      isCompleted: false
    },
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  })
  
  // Detailed conversation logging state
  const [currentSession, setCurrentSession] = useState<ConversationSession | null>(null)
  const [conversationSessions, setConversationSessions] = useState<ConversationSession[]>([])
  const sessionIdRef = useRef<string>('')
  
  // Real-time speech recognition refs
  const recognitionRef = useRef<any>(null)
  const isRecognitionActiveRef = useRef(false)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTranscriptRef = useRef<string>('')
  const isConnectedRef = useRef(false)
  
  // Mobile detection and capabilities
  const [isMobile, setIsMobile] = useState(false)
  const [speechCapabilities, setSpeechCapabilities] = useState({
    recognition: false,
    synthesis: false,
    vendor: 'unknown'
  })

  // Debug logging function
  const addDebugLog = useCallback((message: string) => {
    console.log(`[v0] ${message}`)
    setDebugInfo((prev) => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${message}`])
  }, [])

  // Typewriter effect for subtitles
  const startTypewriterEffect = useCallback((text: string, speed: number = 50) => {
    // Clear any existing typewriter timer
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current)
    }
    
    // Clean text of SSML pause markers for display
    const cleanText = text.replace(/<pause:\d+ms>/g, ' ')
    
    setTypewriterText('')
    let currentIndex = 0
    
    typewriterTimerRef.current = setInterval(() => {
      if (currentIndex < cleanText.length) {
        setTypewriterText(cleanText.slice(0, currentIndex + 1))
        currentIndex++
      } else {
        if (typewriterTimerRef.current) {
          clearInterval(typewriterTimerRef.current)
          typewriterTimerRef.current = null
        }
      }
    }, speed)
  }, [])

  // Stop typewriter effect
  const stopTypewriterEffect = useCallback(() => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current)
      typewriterTimerRef.current = null
    }
    setTypewriterText('')
  }, [])

  // localStorage functions for user profile memory
  const saveUserProfile = useCallback((profile: UserProfile) => {
    try {
      localStorage.setItem('portuguese-tutor-profile', JSON.stringify(profile))
      addDebugLog(`💾 Profile saved to localStorage`)
    } catch (error) {
      addDebugLog(`❌ Failed to save profile: ${error}`)
    }
  }, [addDebugLog])

  const loadUserProfile = useCallback((): UserProfile => {
    try {
      const saved = localStorage.getItem('portuguese-tutor-profile')
      if (saved) {
        const profile = JSON.parse(saved) as UserProfile
        addDebugLog(`📂 Profile loaded from localStorage`)
        
        // Add backward compatibility for profiles without Session 1 structure
        const updatedProfile = {
          ...profile,
          lastActive: new Date().toISOString(),
          session1Progress: profile.session1Progress || {
            currentStep: profile.name ? 5 : 1, // If name exists, assume Session 1 completed
            completedSteps: {
              step1_greeting: !!profile.name,
              step2_gender: !!profile.gender,
              step3_topics: profile.preferences.favoriteTopics.length > 0,
              step4_goals: profile.preferences.learningGoals.length > 0
            },
            isCompleted: !!profile.name // If name exists, assume completed
          }
        }
        
        return updatedProfile
      }
    } catch (error) {
      addDebugLog(`❌ Failed to load profile: ${error}`)
    }
    
    // Return default profile if no saved profile or error
    return {
      preferences: {
        favoriteTopics: [],
        learningGoals: [],
        conversationStyle: 'friendly',
        preferredPace: 'normal'
      },
      conversationHistory: [],
      session1Progress: {
        currentStep: 1,
        completedSteps: {
          step1_greeting: false,
          step2_gender: false,
          step3_topics: false,
          step4_goals: false
        },
        isCompleted: false
      },
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    }
  }, [addDebugLog])

  const updateUserProfile = useCallback((updates: Partial<UserProfile>) => {
    setUserProfile(prev => {
      const updated = {
        ...prev,
        ...updates,
        lastActive: new Date().toISOString()
      }
      saveUserProfile(updated)
      return updated
    })
  }, [saveUserProfile])

  // Conversation session management
  const saveConversationSessions = useCallback((sessions: ConversationSession[]) => {
    try {
      localStorage.setItem('portuguese-tutor-conversations', JSON.stringify(sessions))
      addDebugLog(`💾 Conversation sessions saved to localStorage`)
    } catch (error) {
      addDebugLog(`❌ Failed to save conversation sessions: ${error}`)
    }
  }, [addDebugLog])

  const loadConversationSessions = useCallback((): ConversationSession[] => {
    try {
      const saved = localStorage.getItem('portuguese-tutor-conversations')
      if (saved) {
        const sessions = JSON.parse(saved) as ConversationSession[]
        addDebugLog(`📂 Conversation sessions loaded from localStorage (${sessions.length} sessions)`)
        return sessions
      }
    } catch (error) {
      addDebugLog(`❌ Failed to load conversation sessions: ${error}`)
    }
    return []
  }, [addDebugLog])

  // Analyze conversation flow patterns
  const analyzeConversationFlow = useCallback((userInput: string, isFirstExchange: boolean = false): 'greeting' | 'topic_introduction' | 'question' | 'response' | 'followup' | 'goodbye' => {
    const lowerInput = userInput.toLowerCase()
    
    // Greeting patterns
    if (isFirstExchange || lowerInput.match(/(olá|oi|bom dia|boa tarde|boa noite|e aí)/)) {
      return 'greeting'
    }
    
    // Goodbye patterns
    if (lowerInput.match(/(tchau|até logo|até mais|obrigad[ao]|valeu|falou)/)) {
      return 'goodbye'
    }
    
    // Question patterns
    if (lowerInput.includes('?') || lowerInput.match(/(como|que|qual|onde|quando|por que|o que)/)) {
      return 'question'
    }
    
    // Response patterns (answering previous question)
    if (lowerInput.match(/(sim|não|acho|gosto|prefiro|e você)/)) {
      return 'response'
    }
    
    // Topic introduction
    if (lowerInput.match(/(música|comida|trabalho|família|viagem|brasil|cultura)/)) {
      return 'topic_introduction'
    }
    
    return 'followup'
  }, [])

  // Detect user engagement level
  const detectEngagement = useCallback((userInput: string, responseTime: number): 'high' | 'medium' | 'low' => {
    const wordCount = userInput.split(' ').length
    
    // High engagement: long responses, questions, enthusiasm
    if (wordCount > 10 || userInput.includes('?') || userInput.match(/(que legal|nossa|incrível|adoro)/)) {
      return 'high'
    }
    
    // Low engagement: very short responses, long response time
    if (wordCount < 3 || responseTime > 10000) {
      return 'low'
    }
    
    return 'medium'
  }, [])

  // Create new conversation session
  const startNewSession = useCallback(() => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    sessionIdRef.current = sessionId
    
    const newSession: ConversationSession = {
      sessionId,
      startTime: new Date().toISOString(),
      exchanges: [],
      totalExchanges: 0,
      dominantTopics: [],
      flowPattern: []
    }
    
    setCurrentSession(newSession)
    addDebugLog(`🎆 New conversation session started: ${sessionId}`)
    
    return newSession
  }, [addDebugLog])

  // Log conversation exchange
  const logConversationExchange = useCallback((userInput: string, aiResponse: string, responseTime: number) => {
    if (!currentSession) return
    
    const timestamp = new Date().toISOString()
    const exchangeId = `exchange_${currentSession.exchanges.length + 1}_${Date.now()}`
    
    // Extract topics from both user input and AI response
    const extractTopics = (text: string): string[] => {
      const topicKeywords = ['música', 'comida', 'trabalho', 'família', 'viagem', 'estudo', 'português', 'brasil', 'cultura', 'hobby', 'esporte', 'filme', 'livro', 'amor', 'amigos', 'casa', 'cidade']
      return topicKeywords.filter(topic => text.toLowerCase().includes(topic))
    }
    
    const extractMood = (text: string): 'positive' | 'negative' | 'neutral' => {
      const positiveWords = ['feliz', 'bem', 'ótimo', 'bom', 'legal', 'incrível', 'adoro', 'amo', 'gosto']
      const negativeWords = ['triste', 'mal', 'difícil', 'ruim', 'chato', 'odeio', 'não gosto']
      
      const lowerText = text.toLowerCase()
      const hasPositive = positiveWords.some(word => lowerText.includes(word))
      const hasNegative = negativeWords.some(word => lowerText.includes(word))
      
      if (hasPositive && !hasNegative) return 'positive'
      if (hasNegative && !hasPositive) return 'negative'
      return 'neutral'
    }
    
    const detectedTopics = [...new Set([...extractTopics(userInput), ...extractTopics(aiResponse)])]
    const conversationFlow = analyzeConversationFlow(userInput, currentSession.exchanges.length === 0)
    const mood = extractMood(userInput)
    const userEngagement = detectEngagement(userInput, responseTime)
    
    const exchange: ConversationExchange = {
      id: exchangeId,
      timestamp,
      userInput,
      aiResponse,
      detectedTopics,
      conversationFlow,
      responseTime,
      mood,
      userEngagement
    }
    
    setCurrentSession(prev => {
      if (!prev) return null
      
      const updatedExchanges = [...prev.exchanges, exchange]
      const allTopics = updatedExchanges.flatMap(ex => ex.detectedTopics)
      const topicCounts = allTopics.reduce((acc, topic) => {
        acc[topic] = (acc[topic] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      const dominantTopics = Object.entries(topicCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([topic]) => topic)
      
      const flowPattern = [...prev.flowPattern, conversationFlow]
      
      const updatedSession = {
        ...prev,
        exchanges: updatedExchanges,
        totalExchanges: updatedExchanges.length,
        dominantTopics,
        flowPattern
      }
      
      // Update sessions array and save to localStorage
      setConversationSessions(prevSessions => {
        const otherSessions = prevSessions.filter(s => s.sessionId !== prev.sessionId)
        const newSessions = [...otherSessions, updatedSession]
        saveConversationSessions(newSessions)
        return newSessions
      })
      
      return updatedSession
    })
    
    addDebugLog(`📝 Exchange logged: ${conversationFlow} | Topics: [${detectedTopics.join(', ')}] | Mood: ${mood} | Engagement: ${userEngagement}`)
  }, [currentSession, analyzeConversationFlow, detectEngagement, saveConversationSessions, addDebugLog])

  // End conversation session
  const endCurrentSession = useCallback(() => {
    if (!currentSession) return
    
    const endTime = new Date().toISOString()
    const sessionDuration = new Date(endTime).getTime() - new Date(currentSession.startTime).getTime()
    
    setCurrentSession(prev => {
      if (!prev) return null
      
      const finalSession = {
        ...prev,
        endTime,
        sessionDuration
      }
      
      setConversationSessions(prevSessions => {
        const otherSessions = prevSessions.filter(s => s.sessionId !== prev.sessionId)
        const newSessions = [...otherSessions, finalSession]
        saveConversationSessions(newSessions)
        return newSessions
      })
      
      addDebugLog(`🏁 Session ended: ${prev.sessionId} | Duration: ${Math.round(sessionDuration / 1000)}s | Exchanges: ${prev.totalExchanges}`)
      
      return null
    })
    
    sessionIdRef.current = ''
  }, [currentSession, saveConversationSessions, addDebugLog])

  // Get all conversation sessions
  const getAllSessions = useCallback(() => {
    return conversationSessions
  }, [conversationSessions])

  // Export conversation patterns for analysis
  const exportConversationPatterns = useCallback(() => {
    const allSessions = conversationSessions
    
    const patterns = {
      totalSessions: allSessions.length,
      totalExchanges: allSessions.reduce((sum, session) => sum + session.totalExchanges, 0),
      averageSessionLength: allSessions.length > 0 ? allSessions.reduce((sum, session) => sum + (session.sessionDuration || 0), 0) / allSessions.length / 1000 : 0,
      mostCommonTopics: {} as Record<string, number>,
      flowPatterns: {} as Record<string, number>,
      engagementLevels: { high: 0, medium: 0, low: 0 },
      moodDistribution: { positive: 0, negative: 0, neutral: 0 },
      timeOfDayPatterns: { morning: 0, afternoon: 0, evening: 0 },
      averageResponseTime: 0
    }
    
    let totalExchanges = 0
    let totalResponseTime = 0
    
    allSessions.forEach(session => {
      // Topic analysis
      session.dominantTopics.forEach(topic => {
        patterns.mostCommonTopics[topic] = (patterns.mostCommonTopics[topic] || 0) + 1
      })
      
      // Flow pattern analysis
      const flowKey = session.flowPattern.join(' → ')
      patterns.flowPatterns[flowKey] = (patterns.flowPatterns[flowKey] || 0) + 1
      
      // Time of day analysis
      const hour = new Date(session.startTime).getHours()
      const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
      if (timeOfDay in patterns.timeOfDayPatterns) {
        patterns.timeOfDayPatterns[timeOfDay] += 1;
      }
      
      session.exchanges.forEach(exchange => {
        // Engagement analysis
        patterns.engagementLevels[exchange.userEngagement]++
        
        // Mood analysis
        patterns.moodDistribution[exchange.mood]++
        
        // Response time analysis
        totalResponseTime += exchange.responseTime
        totalExchanges++
      })
    })
    
    patterns.averageResponseTime = totalExchanges > 0 ? totalResponseTime / totalExchanges : 0
    
    const report = `# Portuguese Tutor Conversation Analysis Report

## Overview
- Total Sessions: ${patterns.totalSessions}
- Total Exchanges: ${patterns.totalExchanges}
- Average Session Duration: ${Math.round(patterns.averageSessionLength)}s
- Average Response Time: ${Math.round(patterns.averageResponseTime)}ms

## Topic Analysis
${Object.entries(patterns.mostCommonTopics).sort(([,a], [,b]) => b - a).map(([topic, count]) => `- ${topic}: ${count} times`).join('\n')}

## Flow Patterns
${Object.entries(patterns.flowPatterns).sort(([,a], [,b]) => b - a).slice(0, 10).map(([pattern, count]) => `- ${pattern}: ${count} times`).join('\n')}

## User Engagement
- High: ${patterns.engagementLevels.high} (${Math.round(patterns.engagementLevels.high / totalExchanges * 100)}%)
- Medium: ${patterns.engagementLevels.medium} (${Math.round(patterns.engagementLevels.medium / totalExchanges * 100)}%)
- Low: ${patterns.engagementLevels.low} (${Math.round(patterns.engagementLevels.low / totalExchanges * 100)}%)

## Mood Distribution
- Positive: ${patterns.moodDistribution.positive} (${Math.round(patterns.moodDistribution.positive / totalExchanges * 100)}%)
- Neutral: ${patterns.moodDistribution.neutral} (${Math.round(patterns.moodDistribution.neutral / totalExchanges * 100)}%)
- Negative: ${patterns.moodDistribution.negative} (${Math.round(patterns.moodDistribution.negative / totalExchanges * 100)}%)

## Time of Day Patterns
${Object.entries(patterns.timeOfDayPatterns).sort(([,a], [,b]) => b - a).map(([time, count]) => `- ${time}: ${count} sessions`).join('\n')}

Generated: ${new Date().toISOString()}`
    
    return report
  }, [conversationSessions])

  // Download conversation transcript as readable TXT file
  const downloadConversationTranscript = useCallback(() => {
    try {
      const allSessions = [...conversationSessions]
      if (currentSession && currentSession.exchanges.length > 0) {
        allSessions.push(currentSession)
      }
      
      if (allSessions.length === 0) {
        addDebugLog(`⚠️ No conversations to export`)
        return
      }
      
      let transcript = 'PORTUGUESE CONVERSATION TRANSCRIPT\n'
      transcript += '=====================================\n\n'
      
      if (userProfile.name) {
        transcript += `Student: ${userProfile.name}\n`
      }
      transcript += `Export Date: ${new Date().toLocaleString('pt-BR')}\n`
      transcript += `Total Sessions: ${allSessions.length}\n`
      transcript += `Total Exchanges: ${allSessions.reduce((sum, session) => sum + session.totalExchanges, 0)}\n\n`
      
      allSessions.forEach((session, sessionIndex) => {
        const sessionDate = new Date(session.startTime)
        const sessionDuration = session.sessionDuration ? Math.round(session.sessionDuration / 1000) : 0
        
        transcript += `SESSION ${sessionIndex + 1} - ${sessionDate.toLocaleDateString('pt-BR')} ${sessionDate.toLocaleTimeString('pt-BR')}\n`
        if (sessionDuration > 0) {
          transcript += `Duration: ${Math.floor(sessionDuration / 60)}:${(sessionDuration % 60).toString().padStart(2, '0')}\n`
        }
        if (session.dominantTopics.length > 0) {
          transcript += `Topics: ${session.dominantTopics.join(', ')}\n`
        }
        transcript += '---\n\n'
        
        session.exchanges.forEach((exchange) => {
          const exchangeTime = new Date(exchange.timestamp)
          const timeStr = exchangeTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          
          // Clean text for display (remove SSML pause markers)
          const cleanUserInput = exchange.userInput.replace(/<pause:\d+ms>/g, '')
          const cleanAiResponse = exchange.aiResponse.replace(/<pause:\d+ms>/g, '')
          
          transcript += `[${timeStr}] User: ${cleanUserInput}\n`
          transcript += `[${timeStr}] Agent: ${cleanAiResponse}\n\n`
        })
        
        transcript += '\n'
      })
      
      transcript += '=====================================\n'
      transcript += 'Generated by Portuguese Tutor App\n'
      transcript += `https://claude.ai/code\n`
      
      // Create blob and download link
      const blob = new Blob([transcript], { type: 'text/plain; charset=utf-8' })
      const url = URL.createObjectURL(blob)
      
      // Create temporary download link
      const link = document.createElement('a')
      link.href = url
      link.download = `portuguese-conversation-${new Date().toISOString().split('T')[0]}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up
      URL.revokeObjectURL(url)
      
      const totalExchanges = allSessions.reduce((sum, session) => sum + session.totalExchanges, 0)
      addDebugLog(`📄 Transcript downloaded: ${allSessions.length} sessions, ${totalExchanges} exchanges`)
    } catch (error) {
      addDebugLog(`❌ Failed to download transcript: ${error}`)
    }
  }, [conversationSessions, currentSession, userProfile, addDebugLog])

  // Clear user profile and all conversation data for testing Session 1 flow
  const clearUserProfile = useCallback(() => {
    try {
      // Clear localStorage entries
      localStorage.removeItem('portuguese-tutor-profile')
      localStorage.removeItem('portuguese-tutor-conversations')
      localStorage.removeItem('portuguese-tutor-memory') // Legacy key if it exists
      
      // Reset user profile to default
      const defaultProfile: UserProfile = {
        preferences: {
          favoriteTopics: [],
          learningGoals: [],
          conversationStyle: 'friendly',
          preferredPace: 'normal'
        },
        conversationHistory: [],
        session1Progress: {
          currentStep: 1,
          completedSteps: {
            step1_greeting: false,
            step2_gender: false,
            step3_topics: false,
            step4_goals: false
          },
          isCompleted: false
        },
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      }
      
      setUserProfile(defaultProfile)
      
      // Clear conversation sessions
      setConversationSessions([])
      
      // End current session if active
      if (currentSession) {
        setCurrentSession(null)
      }
      
      // Clear any ongoing conversations
      if (isConnected) {
        stopConversation()
      }
      
      // Clear transcripts and subtitles
      setCurrentTranscript('')
      setSubtitles('')
      stopTypewriterEffect()
      
      addDebugLog(`🧹 User profile cleared - ready for Session 1 testing`)
      console.log('🧹 User profile and conversation data cleared for fresh Session 1 testing')
    } catch (error) {
      addDebugLog(`❌ Failed to clear user profile: ${error}`)
    }
  }, [currentSession, isConnected, stopTypewriterEffect, addDebugLog])

  // Process SSML-style pause markers for natural speech
  const processSpeechWithPauses = useCallback(async (text: string, utteranceConfig: any) => {
    const pauseRegex = /<pause:(\d+)ms>/g
    const parts = text.split(pauseRegex)
    
    addDebugLog(`🎭 Processing speech with SSML pauses: "${text}"`)
    
    // Build complete text without pause markers for subtitles
    const cleanText = text.replace(pauseRegex, '')
    let subtitleText = ''
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      
      // Skip empty parts
      if (!part) continue
      
      // If it's a pause duration (numbers only), wait
      if (/^\d+$/.test(part)) {
        const pauseDuration = parseInt(part, 10)
        addDebugLog(`⏸️ SSML pause: ${pauseDuration}ms`)
        
        await new Promise(resolve => setTimeout(resolve, pauseDuration))
        continue
      }
      
      // If it's text content, speak it and update subtitles
      if (part.trim()) {
        addDebugLog(`🗣️ Speaking part: "${part.trim()}"`)
        
        // Note: Typewriter effect is handled separately in speakText
        // Just keep track of subtitle progress for compatibility
        subtitleText += part.trim() + ' '
        
        const utterance = new SpeechSynthesisUtterance(part.trim())
        
        // Apply the same configuration as the main utterance
        if (utteranceConfig.voice) utterance.voice = utteranceConfig.voice
        utterance.lang = utteranceConfig.lang
        utterance.rate = utteranceConfig.rate
        utterance.pitch = utteranceConfig.pitch
        
        // Wait for this part to finish before continuing
        await new Promise<void>((resolve, reject) => {
          utterance.onend = () => resolve()
          utterance.onerror = (error) => {
            addDebugLog(`❌ SSML speech error: ${error}`)
            reject(error)
          }
          window.speechSynthesis.speak(utterance)
        })
      }
    }
    
    // Ensure final subtitles show complete text
    setSubtitles(cleanText)
  }, [addDebugLog])

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

  // Load user profile and conversation sessions from localStorage on mount
  useEffect(() => {
    const profile = loadUserProfile()
    setUserProfile(profile)
    
    const sessions = loadConversationSessions()
    setConversationSessions(sessions)
    
    addDebugLog(`🧠 Memory system initialized${profile.name ? ` for ${profile.name}` : ''}`)
    addDebugLog(`📂 Loaded ${sessions.length} conversation sessions`)
  }, [loadUserProfile, loadConversationSessions, addDebugLog])

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

  // Keep isConnectedRef in sync and debug connection changes
  useEffect(() => {
    isConnectedRef.current = isConnected
    addDebugLog(`🔗 Connection state changed: ${isConnected}`)
  }, [isConnected, addDebugLog])

  // Mobile detection and capabilities check
  useEffect(() => {
    const detectMobileAndCapabilities = () => {
      // Mobile detection
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      setIsMobile(mobile)
      
      // Browser detection with Arc support
      let vendor = 'unknown'
      if (/Arc/i.test(userAgent) || /Arc Browser/i.test(userAgent)) {
        vendor = 'Arc'
      } else if (/Safari/i.test(userAgent) && /Apple/i.test(navigator.vendor)) {
        vendor = /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS Safari' : 'Safari'
      } else if (/Chrome/i.test(userAgent) && /Google/i.test(navigator.vendor)) {
        vendor = 'Chrome'
      } else if (/Firefox/i.test(userAgent)) {
        vendor = 'Firefox'
      } else if (/Samsung/i.test(userAgent)) {
        vendor = 'Samsung Internet'
      } else if (/Edg/i.test(userAgent)) {
        vendor = 'Edge'
      } else if (/OPR/i.test(userAgent) || /Opera/i.test(userAgent)) {
        vendor = 'Opera'
      }
      
      // Additional Arc detection (Arc sometimes doesn't include "Arc" in user agent)
      if (vendor === 'Chrome' && window.navigator && 'brave' in window.navigator) {
        // This is actually Brave, not Arc
        vendor = 'Brave'
      } else if (vendor === 'Chrome' && userAgent.includes('Chromium')) {
        // Could be Arc or other Chromium-based browser
        // Arc often appears as Chrome but with specific characteristics
        const isLikelyArc = (
          !userAgent.includes('Edg') && 
          !userAgent.includes('OPR') && 
          !userAgent.includes('Brave') &&
          !userAgent.includes('Vivaldi')
        )
        if (isLikelyArc && (window as any).chrome) {
          vendor = 'Arc (detected)'
        }
      }

      // Speech recognition support
      const recognitionSupport = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
      
      // Speech synthesis support  
      const synthesisSupport = !!window.speechSynthesis

      const capabilities = {
        recognition: recognitionSupport,
        synthesis: synthesisSupport,
        vendor
      }
      
      setSpeechCapabilities(capabilities)
      
      // Enhanced mobile logging
      console.log(`📱 [${new Date().toISOString()}] DEVICE DETECTION:`, {
        isMobile: mobile,
        browser: vendor,
        userAgent: userAgent.slice(0, 100) + '...',
        speechRecognition: recognitionSupport,
        speechSynthesis: synthesisSupport,
        windowInnerWidth: window.innerWidth,
        windowInnerHeight: window.innerHeight
      })
      
      addDebugLog(`📱 Mobile: ${mobile}, Browser: ${vendor}`)
      addDebugLog(`🎤 Speech Recognition: ${recognitionSupport}`)
      addDebugLog(`🔊 Speech Synthesis: ${synthesisSupport}`)
      
      // Mobile-specific warnings
      if (mobile && !recognitionSupport) {
        addDebugLog(`⚠️ Speech recognition not supported on ${vendor}`)
        console.warn(`Speech recognition not available on ${vendor}. Consider fallback options.`)
      }
      
      if (mobile && vendor === 'iOS Safari') {
        addDebugLog(`🍎 iOS Safari detected - using iOS-optimized settings`)
        console.log('iOS Safari: Enabling iOS-specific optimizations')
      }
      
      if (vendor === 'Arc' || vendor === 'Arc (detected)') {
        addDebugLog(`🌈 Arc browser detected - using Chromium-based optimizations`)
        console.log('Arc Browser: Using Chromium-based speech recognition optimizations')
      }
    }

    detectMobileAndCapabilities()
  }, [addDebugLog])

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
  }, [addDebugLog])

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
    async (text: string) => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel()

        const ttsTimestamp = new Date().toISOString()
        console.log(`🔊 [${ttsTimestamp}] TTS BEGINS - Agent started speaking: "${text}"`)
        
        setIsAgentSpeaking(true)
        // Stop real-time recognition while agent speaks
        stopRealTimeSpeechRecognition()
        setIsAutoListening(false)
        isAutoListeningRef.current = false
        addDebugLog("🗣️ Agent started speaking - speech recognition paused")
        
        // Start typewriter effect immediately
        startTypewriterEffect(text, 50)

        // Configure utterance settings
        let voice = bestVoice
        let lang = "pt-BR"
        
        if (bestVoice) {
          voice = bestVoice
          lang = bestVoice.lang
        } else {
          // Fallback to getBestPortugueseVoice if bestVoice not set
          const foundVoice = getBestPortugueseVoice(addDebugLog)
          if (foundVoice) {
            voice = foundVoice
            lang = foundVoice.lang
            setBestVoice(foundVoice) // Cache for next time
          }
        }

        const utteranceConfig = {
          voice: voice,
          lang: lang,
          rate: 1.1, // Faster rate for more natural conversation pace
          pitch: 1
        }

        try {
          // Check if text contains SSML pause markers
          if (text.includes('<pause:')) {
            addDebugLog(`🎭 Using SSML pause processing for: "${text}"`)
            await processSpeechWithPauses(text, utteranceConfig)
          } else {
            // Standard speech synthesis for text without pauses
            addDebugLog(`🗣️ Using standard synthesis for: "${text}"`)
            const utterance = new SpeechSynthesisUtterance(text)
            
            if (utteranceConfig.voice) utterance.voice = utteranceConfig.voice
            utterance.lang = utteranceConfig.lang
            utterance.rate = utteranceConfig.rate
            utterance.pitch = utteranceConfig.pitch
            
            await new Promise<void>((resolve) => {
              utterance.onend = () => resolve()
              utterance.onerror = () => resolve() // Still resolve on error
              window.speechSynthesis.speak(utterance)
            })
          }

          // TTS completed
          const ttsEndTimestamp = new Date().toISOString()
          console.log(`🔇 [${ttsEndTimestamp}] TTS ENDS - Agent finished speaking, preparing to listen`)
          
          setIsAgentSpeaking(false)
          addDebugLog("✅ Agent finished speaking")
          
          // Stop typewriter effect when done speaking
          stopTypewriterEffect()
          
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
          
        } catch (error) {
          addDebugLog(`❌ Error in speech synthesis: ${error}`)
          setIsAgentSpeaking(false)
          stopTypewriterEffect()
        }

        // Keep subtitles for compatibility, but typewriter text will be used for display
        setSubtitles(text.replace(/<pause:\d+ms>/g, '')) // Clean text for subtitles
      }
    },
    [addDebugLog, bestVoice, getBestPortugueseVoice, stopRealTimeSpeechRecognition, isConnected, processSpeechWithPauses],
  )

  const getContextualResponse = (userMessage: string): string[] => {
    // Greeting responses with natural pauses
    if (userMessage.includes('olá') || userMessage.includes('oi') || userMessage.includes('bom dia') || userMessage.includes('boa tarde')) {
      return [
        'Olá! <pause:500ms> Como você está hoje?',
        'Oi! <pause:300ms> Que bom te ver aqui. <pause:400ms> Como foi seu dia?',
        'Olá! <pause:400ms> Está tudo bem com você?'
      ]
    }
    
    // Feeling responses with thoughtful pauses
    if (userMessage.includes('bem') || userMessage.includes('bom') || userMessage.includes('ótimo')) {
      return [
        'Que bom! <pause:400ms> O que você gosta de fazer no seu tempo livre?',
        'Fico feliz em saber! <pause:500ms> Conte-me sobre seus hobbies.',
        'Excelente! <pause:300ms> Qual é sua comida brasileira favorita?'
      ]
    }
    
    // Music responses with enthusiasm pauses
    if (userMessage.includes('música') || userMessage.includes('cantar') || userMessage.includes('samba')) {
      return [
        'Que legal! <pause:400ms> Qual estilo de música brasileira você mais gosta?',
        'Música é maravilhosa! <pause:300ms> Você conhece algum cantor brasileiro?',
        'Adoro música também! <pause:500ms> Você sabe dançar samba?'
      ]
    }
    
    // Food responses with savoring pauses
    if (userMessage.includes('comida') || userMessage.includes('comer') || userMessage.includes('feijoada')) {
      return [
        'Hmm, <pause:200ms> delicioso! <pause:400ms> Qual prato brasileiro você mais gosta?',
        'Que bom! <pause:300ms> Você já experimentou feijoada?',
        'Comida brasileira é incrível! <pause:400ms> Você cozinha?'
      ]
    }
    
    // Study responses with encouraging pauses
    if (userMessage.includes('estudar') || userMessage.includes('português') || userMessage.includes('aprender')) {
      return [
        'Muito bem! <pause:500ms> Há quanto tempo você estuda português?',
        'Que dedicação! <pause:400ms> O que mais gosta na língua portuguesa?',
        'Parabéns! <pause:300ms> Por que decidiu aprender português?'
      ]
    }
    
    // Work responses with professional pauses
    if (userMessage.includes('trabalho') || userMessage.includes('trabalhar') || userMessage.includes('emprego')) {
      return [
        'Interessante! <pause:400ms> Em que área você trabalha?',
        'Que legal! <pause:300ms> Você gosta do seu trabalho?',
        'Trabalho é importante! <pause:400ms> Onde você trabalha?'
      ]
    }
    
    // Travel responses with excitement pauses
    if (userMessage.includes('viajar') || userMessage.includes('brasil') || userMessage.includes('cidade')) {
      return [
        'Que aventura! <pause:500ms> Qual cidade brasileira você quer visitar?',
        'Viagem é ótima! <pause:400ms> Você já esteve no Brasil?',
        'Adoraria saber mais! <pause:300ms> Que lugar você mais quer conhecer?'
      ]
    }
    
    // Enhanced question detection - conversational follow-up questions
    // Check for "e você" pattern (most common conversational turn-around)
    if (userMessage.includes('e você') || userMessage.includes('e tu')) {
      // Context-sensitive responses based on the content before "e você"
      if (userMessage.includes('música') || userMessage.includes('cantar')) {
        return [
          'Eu adoro MPB! <pause:300ms> Caetano Veloso é meu favorito. <pause:400ms> Você conhece as músicas dele?',
          'Gosto muito de bossa nova! <pause:300ms> É suave e elegante. <pause:400ms> Qual seu ritmo brasileiro favorito?'
        ]
      } else if (userMessage.includes('comida') || userMessage.includes('comer')) {
        return [
          'Adoro feijoada! <pause:300ms> É o prato mais brasileiro que existe. <pause:400ms> Você já experimentou?',
          'Gosto muito de açaí! <pause:300ms> É refrescante e saudável. <pause:400ms> Que sobremesa você prefere?'
        ]
      } else if (userMessage.includes('trabalh') || userMessage.includes('estud')) {
        return [
          'Eu trabalho ensinando português! <pause:300ms> É muito gratificante. <pause:400ms> O que você mais gosta no seu trabalho?',
          'Adoro estudar idiomas! <pause:300ms> Cada língua é um mundo novo. <pause:400ms> Que outras línguas você fala?'
        ]
      } else {
        return [
          'Eu estou sempre bem! <pause:300ms> Amo conversar em português. <pause:400ms> Como está se sentindo com o aprendizado?',
          'Obrigada por perguntar! <pause:300ms> Estou animada para nossa conversa. <pause:400ms> E você, como está hoje?'
        ]
      }
    }
    
    // Direct preference questions about the tutor
    if (userMessage.includes('qual você gosta') || userMessage.includes('que você prefere') || 
        userMessage.includes('qual sua') || userMessage.includes('você gosta de que')) {
      return [
        'Gosto de tudo relacionado ao Brasil! <pause:400ms> A cultura é muito rica. <pause:300ms> Qual aspecto do Brasil mais te interessa?',
        'Adoro música brasileira! <pause:300ms> Especialmente MPB e samba. <pause:400ms> Que tipo de música você curte?',
        'Prefiro falar sobre cultura e tradições! <pause:300ms> Brasil tem tanta diversidade. <pause:400ms> O que você quer conhecer?'
      ]
    }
    
    // Opinion and thought questions
    if (userMessage.includes('você acha') || userMessage.includes('sua opinião') || 
        userMessage.includes('você pensa') || userMessage.includes('o que pensa')) {
      return [
        'Acho que praticar é fundamental! <pause:400ms> Quanto mais conversamos, melhor fica. <pause:300ms> Você sente isso também?',
        'Penso que cada pessoa aprende diferente. <pause:300ms> Alguns preferem música, outros conversa. <pause:400ms> Como você aprende melhor?',
        'Na minha opinião, <pause:200ms> português brasileiro é lindo! <pause:300ms> As expressões são únicas. <pause:400ms> Você concorda?'
      ]
    }
    
    // "Como é" or "como está" questions directed at tutor
    if ((userMessage.includes('como é') || userMessage.includes('como está') || userMessage.includes('como vai')) &&
        (userMessage.includes('você') || userMessage.includes('tu'))) {
      return [
        'Estou muito bem! <pause:300ms> Sempre animada para ensinar. <pause:400ms> Como você está se sentindo com o português?',
        'Vai tudo ótimo! <pause:300ms> Adoro essas conversas. <pause:400ms> E você, como está o seu dia?'
      ]
    }
    
    // "Você conhece" or "você sabe" questions
    if (userMessage.includes('você conhece') || userMessage.includes('você sabe') || userMessage.includes('tu sabes')) {
      return [
        'Conheço muita coisa sobre o Brasil! <pause:300ms> Música, comida, cultura. <pause:400ms> O que você quer saber?',
        'Sei bastante sobre português brasileiro! <pause:300ms> É minha paixão. <pause:400ms> Que dúvida você tem?'
      ]
    }
    
    // Default encouraging responses with conversational pauses
    return [
      'Muito interessante! <pause:400ms> Pode me contar mais sobre isso?',
      'Que legal! <pause:300ms> Como você se sente sobre isso?',
      'Entendi! <pause:400ms> O que mais você gostaria de compartilhar?',
      'Que bom saber isso! <pause:300ms> E o que você acha?',
      'Interessante! <pause:500ms> Você pode explicar melhor?'
    ]
  }

  // Process Session 1 information extraction and profile updates
  const processSession1Information = useCallback(async (userMessage: string, aiResponse: string) => {
    const currentStep = userProfile.session1Progress.currentStep
    const lowerMessage = userMessage.toLowerCase()
    let profileUpdates: Partial<UserProfile> = {}
    let stepCompleted = false
    
    switch (currentStep) {
      case 1: // Extract name
        const namePatterns = [
          /(?:sou|me chamo|meu nome é|eu sou)\s+([a-záàâãäéêèíîìóôòõöúûùüç]+)/i,
          /^([a-záàâãäéêèíîìóôòõöúûùüç]{2,20})$/i // Just a name by itself
        ]
        
        for (const pattern of namePatterns) {
          const nameMatch = userMessage.match(pattern)
          if (nameMatch && nameMatch[1]) {
            const extractedName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase()
            profileUpdates.name = extractedName
            stepCompleted = true
            addDebugLog(`👤 Session 1 - Name extracted: ${extractedName}`)
            break
          }
        }
        break
        
      case 2: // Extract gender
        const genderPatterns = [
          { patterns: [/\b(homem|masculino|menino|rapaz|garoto|cara)\b/i], gender: 'masculino' as const },
          { patterns: [/\b(mulher|feminino|menina|moça|garota|senhora)\b/i], gender: 'feminino' as const },
          { patterns: [/\b(outro|não binário|fluido)\b/i], gender: 'outro' as const }
        ]
        
        for (const { patterns, gender } of genderPatterns) {
          if (patterns.some(pattern => pattern.test(lowerMessage))) {
            profileUpdates.gender = gender
            stepCompleted = true
            addDebugLog(`⚧️ Session 1 - Gender extracted: ${gender}`)
            break
          }
        }
        break
        
      case 3: // Extract topics/interests
        const topicKeywords = {
          'música': ['música', 'cantar', 'tocar', 'instrumento', 'banda', 'samba', 'rock', 'pop'],
          'comida': ['comida', 'cozinhar', 'comer', 'receita', 'restaurante', 'prato'],
          'esporte': ['esporte', 'futebol', 'correr', 'nadar', 'academia', 'exercício'],
          'filmes': ['filme', 'cinema', 'assistir', 'netflix', 'série'],
          'leitura': ['ler', 'livro', 'leitura', 'romance', 'história'],
          'viagem': ['viajar', 'viagem', 'conhecer', 'país', 'cultura', 'turismo'],
          'trabalho': ['trabalho', 'emprego', 'profissão', 'carreira', 'empresa'],
          'família': ['família', 'filhos', 'pais', 'irmãos', 'casado']
        }
        
        const detectedTopics: string[] = []
        Object.entries(topicKeywords).forEach(([topic, keywords]) => {
          if (keywords.some(keyword => lowerMessage.includes(keyword))) {
            detectedTopics.push(topic)
          }
        })
        
        if (detectedTopics.length > 0) {
          profileUpdates.preferences = {
            ...userProfile.preferences,
            favoriteTopics: [...new Set([...userProfile.preferences.favoriteTopics, ...detectedTopics])]
          }
          stepCompleted = true
          addDebugLog(`🎯 Session 1 - Topics extracted: ${detectedTopics.join(', ')}`)
        }
        break
        
      case 4: // Extract learning goals
        const goalKeywords = {
          'trabalho': ['trabalho', 'emprego', 'profissional', 'carreira', 'negócios'],
          'viagem': ['viajar', 'turismo', 'brasil', 'visitar', 'conhecer'],
          'família': ['família', 'namorad', 'casad', 'filhos', 'parentes'],
          'cultura': ['cultura', 'entender', 'aprender', 'curiosidade', 'interesse'],
          'estudo': ['universidade', 'escola', 'curso', 'estudar', 'educação']
        }
        
        const detectedGoals: string[] = []
        Object.entries(goalKeywords).forEach(([goal, keywords]) => {
          if (keywords.some(keyword => lowerMessage.includes(keyword))) {
            detectedGoals.push(goal)
          }
        })
        
        if (detectedGoals.length > 0) {
          profileUpdates.preferences = {
            ...userProfile.preferences,
            learningGoals: [...new Set([...userProfile.preferences.learningGoals, ...detectedGoals])]
          }
          stepCompleted = true
          addDebugLog(`🎯 Session 1 - Goals extracted: ${detectedGoals.join(', ')}`)
        }
        break
    }
    
    // Update profile if information was extracted
    if (Object.keys(profileUpdates).length > 0 || stepCompleted) {
      const updatedProgress = { ...userProfile.session1Progress }
      
      if (stepCompleted) {
        // Mark current step as completed
        switch (currentStep) {
          case 1:
            updatedProgress.completedSteps.step1_greeting = true
            break
          case 2:
            updatedProgress.completedSteps.step2_gender = true
            break
          case 3:
            updatedProgress.completedSteps.step3_topics = true
            break
          case 4:
            updatedProgress.completedSteps.step4_goals = true
            break
        }
        
        // Move to next step or complete Session 1
        if (currentStep < 4) {
          updatedProgress.currentStep = currentStep + 1
          addDebugLog(`➡️ Session 1 - Moving to step ${currentStep + 1}`)
        } else {
          updatedProgress.currentStep = 5
          updatedProgress.isCompleted = true
          addDebugLog(`✅ Session 1 - Completed! Moving to normal conversations.`)
        }
      }
      
      profileUpdates.session1Progress = updatedProgress
      updateUserProfile(profileUpdates)
    }
  }, [userProfile, updateUserProfile, addDebugLog])

  const generateAIResponse = async (userMessage: string): Promise<string> => {
    const aiStartTime = performance.now()
    
    try {
      // Try Claude API first if API key is available
      if (process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY) {
        const { Anthropic } = await import('@anthropic-ai/sdk')
        const anthropic = new Anthropic({
          apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
          dangerouslyAllowBrowser: true
        })

        // Build memory context
        let memoryContext = ''
        
        if (userProfile.name) {
          memoryContext += `O nome do seu amigo(a) é ${userProfile.name}.\n`
        }
        
        if (userProfile.preferences.favoriteTopics.length > 0) {
          memoryContext += `Tópicos favoritos: ${userProfile.preferences.favoriteTopics.join(', ')}.\n`
        }
        
        if (userProfile.preferences.learningGoals.length > 0) {
          memoryContext += `Objetivos de aprendizado: ${userProfile.preferences.learningGoals.join(', ')}.\n`
        }
        
        if (userProfile.conversationHistory.length > 0) {
          const recentConversations = userProfile.conversationHistory.slice(-3)
          const recentTopics = recentConversations.flatMap(conv => conv.topics).slice(-5)
          if (recentTopics.length > 0) {
            memoryContext += `Tópicos recentes das conversas: ${[...new Set(recentTopics)].join(', ')}.\n`
          }
        }
        
        // Use system prompt from config and replace placeholder with actual memory context
        const systemPrompt = PORTUGUESE_TUTOR_CONFIG.systemPrompt
          .replace('{MEMORY_CONTEXT}', memoryContext || 'Nenhuma informação anterior disponível.') + 
          `\n\nAmigo(a) disse: "${userMessage}"`

        const response = await anthropic.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: systemPrompt
          }]
        })

        const claudeResponse = response.content[0]?.type === 'text' ? response.content[0].text : ''
        const aiEndTime = performance.now()
        addDebugLog(`🤖 Claude API response in ${(aiEndTime - aiStartTime).toFixed(1)}ms`)
        
        // Process Session 1 information extraction if in Session 1
        if (!userProfile.session1Progress.isCompleted) {
          await processSession1Information(userMessage, claudeResponse)
        }
        
        // Remove emojis from response before speech synthesis
        const cleanResponse = claudeResponse.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()
        
        return cleanResponse
      }
      
      // Fallback to local contextual responses
      const responses = getContextualResponse(userMessage.toLowerCase())
      const randomResponse = responses[Math.floor(Math.random() * responses.length)]
      
      const aiEndTime = performance.now()
      addDebugLog(`⚡ Local response generated in ${(aiEndTime - aiStartTime).toFixed(1)}ms`)
      
      // Remove emojis from local response before speech synthesis
      const cleanResponse = randomResponse.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()
      
      return cleanResponse
      
    } catch (error) {
      const errorTime = performance.now()
      addDebugLog(`❌ Claude API failed after ${(errorTime - aiStartTime).toFixed(1)}ms, using fallback`)
      
      // Fallback to local contextual responses on API failure
      try {
        const responses = getContextualResponse(userMessage.toLowerCase())
        const randomResponse = responses[Math.floor(Math.random() * responses.length)]
        // Remove emojis from fallback response
        const cleanResponse = randomResponse.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()
        return cleanResponse
      } catch (fallbackError) {
        // Ultimate fallback
        return "Desculpe, pode repetir?"
      }
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
        
        // Log detailed conversation exchange
        logConversationExchange(userMessage, response, responseReadyTime - responseStartTime)

        // Update conversation history and extract insights
        const extractTopics = (message: string): string[] => {
          const topicKeywords = ['música', 'comida', 'trabalho', 'família', 'viagem', 'estudo', 'português', 'brasil', 'cultura', 'hobby', 'esporte', 'filme', 'livro']
          return topicKeywords.filter(topic => message.toLowerCase().includes(topic))
        }

        const extractMood = (message: string): string => {
          if (message.includes('feliz') || message.includes('bem') || message.includes('ótimo')) return 'positivo'
          if (message.includes('triste') || message.includes('mal') || message.includes('difícil')) return 'negativo'
          return 'neutro'
        }

        // Extract user name if mentioned
        const nameMatch = userMessage.match(/(?:sou|me chamo|meu nome é)\s+([A-Za-zÀ-ÿ]+)/i)
        if (nameMatch && !userProfile.name) {
          updateUserProfile({ name: nameMatch[1] })
          addDebugLog(`👤 User name learned: ${nameMatch[1]}`)
        }

        // Update conversation history
        const conversationEntry = {
          date: new Date().toISOString(),
          topics: extractTopics(userMessage),
          keyPoints: [userMessage.slice(0, 100)], // Store first 100 chars as key point
          mood: extractMood(userMessage)
        }

        updateUserProfile({
          conversationHistory: [...userProfile.conversationHistory.slice(-9), conversationEntry] // Keep last 10 conversations
        })

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
      
      // Configure for continuous real-time recognition with mobile optimizations
      recognitionRef.current.lang = 'pt-BR'
      
      // Browser-specific optimizations
      if (isMobile) {
        // iOS Safari requires different settings
        if (speechCapabilities.vendor === 'iOS Safari') {
          recognitionRef.current.continuous = false // iOS Safari works better with non-continuous
          recognitionRef.current.interimResults = false // iOS Safari has issues with interim results
          addDebugLog(`🍎 Using iOS Safari optimizations: continuous=false, interimResults=false`)
        } else {
          // Android Chrome and other mobile browsers
          recognitionRef.current.continuous = true
          recognitionRef.current.interimResults = true
          addDebugLog(`📱 Using mobile optimizations: continuous=true, interimResults=true`)
        }
      } else {
        // Desktop browser optimizations
        if (speechCapabilities.vendor === 'Arc' || speechCapabilities.vendor === 'Arc (detected)') {
          // Arc browser (Chromium-based) optimizations
          recognitionRef.current.continuous = true
          recognitionRef.current.interimResults = true
          // Arc may benefit from more aggressive continuous listening
          addDebugLog(`🌈 Using Arc browser optimizations: continuous=true, interimResults=true, enhanced listening`)
        } else if (speechCapabilities.vendor === 'Chrome') {
          // Standard Chrome optimizations
          recognitionRef.current.continuous = true
          recognitionRef.current.interimResults = true
          addDebugLog(`🟢 Using Chrome optimizations: continuous=true, interimResults=true`)
        } else if (speechCapabilities.vendor === 'Safari') {
          // Desktop Safari has different behavior than iOS Safari
          recognitionRef.current.continuous = true
          recognitionRef.current.interimResults = true
          addDebugLog(`🍎 Using Safari desktop optimizations: continuous=true, interimResults=true`)
        } else {
          // Default desktop settings for other browsers (Edge, Firefox, etc.)
          recognitionRef.current.continuous = true
          recognitionRef.current.interimResults = true
          addDebugLog(`💻 Using desktop settings: continuous=true, interimResults=true`)
        }
      }
      
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
        const timestamp = new Date().toISOString()
        console.log(`❌ [${timestamp}] SPEECH RECOGNITION ERROR: ${event.error} (${speechCapabilities.vendor})`)
        addDebugLog(`❌ Speech recognition error: ${event.error}`)
        
        // Browser-specific error handling
        if (isMobile) {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            addDebugLog(`🚫 Microphone permission denied on ${speechCapabilities.vendor}`)
            console.error('Mobile microphone permission required. Please allow microphone access.')
          } else if (event.error === 'network') {
            addDebugLog(`🌐 Network error on ${speechCapabilities.vendor} - speech recognition requires internet`)
          } else if (event.error === 'no-speech' && speechCapabilities.vendor === 'iOS Safari') {
            addDebugLog(`🔇 iOS Safari no-speech timeout - this is normal behavior`)
            // iOS Safari often times out, restart automatically
            setTimeout(() => {
              if (isConnected && !isAgentSpeaking && isAutoListeningRef.current) {
                startRealTimeSpeechRecognition()
              }
            }, 500)
          }
        } else {
          // Desktop browser error handling
          if (speechCapabilities.vendor === 'Arc' || speechCapabilities.vendor === 'Arc (detected)') {
            // Arc-specific error handling
            if (event.error === 'not-allowed') {
              addDebugLog(`🚫 Arc: Microphone permission denied - check Arc's privacy settings`)
              console.error('Arc Browser: Please allow microphone access in Arc settings or site permissions.')
            } else if (event.error === 'network') {
              addDebugLog(`🌐 Arc: Network error - Arc requires internet for speech recognition`)
            } else if (event.error === 'no-speech') {
              addDebugLog(`🔇 Arc: No speech detected - restarting recognition`)
              // Arc handles no-speech well, just restart
            } else if (event.error === 'aborted') {
              addDebugLog(`⏹️ Arc: Recognition aborted - normal for Arc when switching focus`)
            }
          } else if (event.error === 'not-allowed' && speechCapabilities.vendor === 'Chrome') {
            addDebugLog(`🚫 Chrome: Microphone permission denied - check Chrome settings`)
          }
        }
        
        // General error handling
        if (event.error === 'no-speech') {
          addDebugLog("🔇 No speech detected, continuing to listen...")
        } else if (event.error === 'aborted') {
          addDebugLog("⏹️ Speech recognition aborted")
        } else if (event.error === 'audio-capture') {
          addDebugLog("🎤 Audio capture failed - check microphone")
        } else {
          // Restart recognition on other errors with mobile-specific delays
          const restartDelay = isMobile ? 2000 : 1000 // Longer delay for mobile
          setTimeout(() => {
            if (isConnected && !isAgentSpeaking) {
              addDebugLog(`🔄 Restarting speech recognition after ${event.error} (delay: ${restartDelay}ms)`)
              startRealTimeSpeechRecognition()
            }
          }, restartDelay)
        }
      }

      recognitionRef.current.onend = () => {
        isRecognitionActiveRef.current = false
        setIsRecording(false)
        addDebugLog("🛑 Speech recognition ended")
        
        // Auto-restart if still connected and agent not speaking
        if (isConnected && !isAgentSpeaking && isAutoListeningRef.current) {
          // Arc browser may need slightly different restart timing
          const restartDelay = (speechCapabilities.vendor === 'Arc' || speechCapabilities.vendor === 'Arc (detected)') ? 200 : 100
          
          setTimeout(() => {
            if (speechCapabilities.vendor === 'Arc' || speechCapabilities.vendor === 'Arc (detected)') {
              addDebugLog("🔄 Auto-restarting speech recognition (Arc optimized)")
            } else {
              addDebugLog("🔄 Auto-restarting speech recognition")
            }
            startRealTimeSpeechRecognition()
          }, restartDelay)
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
      
      // Start new conversation session
      startNewSession()
      
      // Enable auto-listening for continuous recognition
      setIsAutoListening(true)
      isAutoListeningRef.current = true
      
      // Start with a greeting immediately with natural pauses - variety of greetings
      const greetings = [
        "Olá! <pause:400ms> Bem-vindo ao seu tutor de português brasileiro. <pause:600ms> Vamos praticar juntos! <pause:500ms> Como você está hoje?",
        "Oi! <pause:300ms> Que bom te ver aqui. <pause:500ms> Sou sua amiga brasileira e vou te ajudar com o português. <pause:400ms> Como vai você?",
        "E aí! <pause:300ms> Pronto para uma conversa em português? <pause:500ms> Vou ser como uma amiga do Brasil. <pause:400ms> Me conta, como está seu dia?",
        "Olá, querido! <pause:400ms> Sua amiga brasileira chegou para conversar. <pause:500ms> Vamos bater um papo gostoso em português? <pause:400ms> Como você está se sentindo hoje?"
      ]
      const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)]
      speakText(randomGreeting)
      
      addDebugLog("✅ Conversation started - real-time recognition will activate after greeting")
    } catch (error) {
      addDebugLog(`❌ Failed to start conversation: ${error}`)
    }
  }, [addDebugLog, speakText, startNewSession])

  const stopConversation = useCallback(() => {
    addDebugLog("⏹️ Stopping conversation")

    // End current conversation session
    endCurrentSession()

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
    stopTypewriterEffect()
    
    addDebugLog("✅ Conversation stopped - all recognition disabled")
  }, [addDebugLog, stopRealTimeSpeechRecognition, endCurrentSession])

  const value: VoiceContextType = {
    isListening,
    isConnected,
    isAgentSpeaking,
    isRecording,
    currentTranscript,
    subtitles,
    typewriterText,
    startConversation,
    stopConversation,
    sendTextMessage,
    startVoiceInput,
    stopVoiceInput,
    debugInfo,
    voiceActivity,
    userProfile,
    updateUserProfile,
    clearUserProfile,
    currentSession,
    getAllSessions,
    exportConversationPatterns,
    downloadConversationTranscript,
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