"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useVoice } from "@/components/voice-provider"
import { Mic, MicOff, Volume2, Settings, MessageCircle, Heart, Star, Zap } from "lucide-react"

interface ConversationEntry {
  id: number
  type: 'user' | 'agent'
  text: string
  timestamp: Date
}

export default function PortugueseTutor() {
  const [textInput, setTextInput] = useState("")
  const [showDebug, setShowDebug] = useState(false)
  const [conversationCount, setConversationCount] = useState(0)
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const {
    isConnected,
    isListening,
    isAgentSpeaking,
    isRecording,
    currentTranscript,
    subtitles,
    startConversation,
    stopConversation,
    sendTextMessage,
    debugInfo,
    voiceActivity,
    downloadConversationTranscript,
    clearUserProfile,
  } = useVoice()

  // Track conversation exchanges
  useEffect(() => {
    if (currentTranscript) {
      setConversationCount(prev => prev + 1)
    }
  }, [currentTranscript])

  // Track user transcripts in conversation history
  useEffect(() => {
    if (currentTranscript && currentTranscript.trim() && !currentTranscript.endsWith('...')) {
      const existingUserEntry = conversationHistory.find(
        entry => entry.type === 'user' && entry.text === currentTranscript.trim()
      )
      
      if (!existingUserEntry) {
        const newEntry: ConversationEntry = {
          id: Date.now(),
          type: 'user',
          text: currentTranscript.trim(),
          timestamp: new Date()
        }
        setConversationHistory(prev => [...prev, newEntry])
      }
    }
  }, [currentTranscript, conversationHistory])

  // Track agent responses in conversation history
  useEffect(() => {
    if (subtitles && subtitles.trim() && isAgentSpeaking) {
      const existingAgentEntry = conversationHistory.find(
        entry => entry.type === 'agent' && entry.text === subtitles.trim()
      )
      
      if (!existingAgentEntry) {
        const newEntry: ConversationEntry = {
          id: Date.now() + 1, // Slight offset to avoid ID conflicts
          type: 'agent',
          text: subtitles.trim(),
          timestamp: new Date()
        }
        setConversationHistory(prev => [...prev, newEntry])
      }
    }
  }, [subtitles, isAgentSpeaking, conversationHistory])

  // Clear conversation history when conversation ends
  useEffect(() => {
    if (!isConnected) {
      // Keep history for review even after conversation ends
      // Only clear when manually clicked or new conversation starts
    }
  }, [isConnected])

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (textInput.trim() && !isAgentSpeaking) {
      sendTextMessage(textInput)
      setTextInput("")
    }
  }

  const getStatusMessage = () => {
    if (isAgentSpeaking) return "Seu tutor está falando..."
    if (isRecording) return "Te escutando atentamente..."
    return "Pronto para conversar!"
  }

  const getStatusColor = () => {
    if (isAgentSpeaking) return "from-green-400 to-emerald-500"
    if (isRecording) return "from-red-400 to-pink-500"
    return "from-blue-400 to-indigo-500"
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-800 to-blue-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_50%_50%,rgba(100,116,139,0.1)_2px,transparent_2px)] [background-size:60px_60px]"></div>
      
      {/* Full width animated waves when agent is speaking */}
      {isAgentSpeaking && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full flex justify-center items-end space-x-2 px-8">
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                className="bg-gradient-to-t from-green-400/30 to-emerald-500/20 rounded-full animate-pulse"
                style={{
                  width: '3px',
                  height: `${Math.random() * 60 + 20}px`,
                  animationDelay: `${i * 0.05}s`,
                  animationDuration: `${0.8 + Math.random() * 0.4}s`
                }}
              ></div>
            ))}
          </div>
        </div>
      )}
      
      {/* Debug Panel - Toggle */}
      <button
        onClick={() => setShowDebug(!showDebug)}
        className="fixed top-4 right-4 z-50 bg-black/20 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-xs hover:bg-black/30 transition-all"
      >
        <Settings size={16} />
      </button>

      {/* Conversation History - Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="fixed top-4 right-20 z-50 bg-black/20 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-xs hover:bg-black/30 transition-all"
      >
        <MessageCircle size={16} />
        {conversationHistory.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {conversationHistory.length}
          </span>
        )}
      </button>

      {showDebug && (
        <div className="fixed top-16 right-4 bg-black/90 backdrop-blur-sm text-white p-4 rounded-lg text-xs max-w-sm z-40 border border-white/20">
          <div className="font-bold mb-2 text-green-400">Debug Status:</div>
          <div className="space-y-1 text-gray-300">
            <div>Connected: <span className={isConnected ? "text-green-400" : "text-red-400"}>{isConnected.toString()}</span></div>
            <div>Listening: <span className={isListening ? "text-blue-400" : "text-gray-400"}>{isListening.toString()}</span></div>
            <div>Speaking: <span className={isAgentSpeaking ? "text-green-400" : "text-gray-400"}>{isAgentSpeaking.toString()}</span></div>
            <div>Recording: <span className={isRecording ? "text-red-400" : "text-gray-400"}>{isRecording.toString()}</span></div>
            <div>Voice: <span className="text-blue-400">{Math.round(voiceActivity)}</span></div>
            {/* Mobile indicator */}
            <div className="border-t border-white/10 pt-1 mt-2">
              <div>Device: <span className="text-yellow-400">{/Mobi|Android/i.test(navigator.userAgent) ? '📱 Mobile' : '💻 Desktop'}</span></div>
              <div>Screen: <span className="text-blue-300">{window.innerWidth}x{window.innerHeight}</span></div>
            </div>
          </div>
          <div className="mt-3 space-y-1 border-t border-white/20 pt-2">
            <div className="space-y-2 mb-2">
              <button
                onClick={downloadConversationTranscript}
                className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-2 rounded text-xs transition-all"
              >
                📄 Download Conversation Transcript
              </button>
              <button
                onClick={clearUserProfile}
                className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-2 rounded text-xs transition-all"
              >
                🧹 Clear Profile (Session 1 Reset)
              </button>
            </div>
            <div className="max-h-32 overflow-y-auto">
              {debugInfo.slice(-5).map((log, i) => (
                <div key={i} className="text-xs opacity-70 text-gray-400">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conversation History Panel */}
      {showHistory && (
        <div className="fixed top-16 right-20 bg-black/90 backdrop-blur-sm text-white p-4 rounded-lg text-sm max-w-md z-40 border border-white/20 max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-blue-400">Conversa ({conversationHistory.length} trocas)</div>
            <button
              onClick={() => setConversationHistory([])}
              className="text-xs bg-red-500/20 hover:bg-red-500/30 px-2 py-1 rounded border border-red-500/30 transition-all"
            >
              Limpar
            </button>
          </div>
          <div className="overflow-y-auto flex-1 space-y-3 pr-2">
            {conversationHistory.length === 0 ? (
              <div className="text-gray-400 text-center py-4">
                Nenhuma conversa ainda.<br />
                Comece a falar para ver o histórico!
              </div>
            ) : (
              conversationHistory.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-3 rounded-lg border ${
                    entry.type === 'user' 
                      ? 'bg-blue-500/10 border-blue-400/20 ml-4' 
                      : 'bg-green-500/10 border-green-400/20 mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${
                      entry.type === 'user' ? 'text-blue-300' : 'text-green-300'
                    }`}>
                      {entry.type === 'user' ? '👤 Você' : '🤖 Tutor'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {entry.timestamp.toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <div className="text-white leading-relaxed">
                    "{entry.text}"
                  </div>
                </div>
              ))
            )}
          </div>
          {conversationHistory.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 text-xs text-gray-400 text-center">
              Scroll para ver mais mensagens
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col items-center justify-center min-h-screen p-4 relative z-10">
        <div className="w-full max-w-4xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="relative">
              <h1 className="text-4xl md:text-5xl font-bold">
                <span className="bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent">
                  Bate-Papo
                </span>
                <span className="ml-3 text-white">🇧🇷</span>
              </h1>
            </div>
            <p className="text-lg text-white/70">
              Tutor de português brasileiro
            </p>
          </div>

          {/* Status and Controls */}
          <div className="text-center space-y-6">
            <div className="flex justify-center items-center space-x-4">
              <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${getStatusColor()} ${isConnected ? 'animate-pulse' : ''}`}></div>
              <span className="text-white/90 text-lg">
                {isConnected ? getStatusMessage() : "Clique para começar"}
              </span>
            </div>

            {/* Main Control Button with mobile optimization */}
            <Button
              onClick={isConnected ? stopConversation : startConversation}
              size="lg"
              className={`px-12 py-6 text-xl rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 touch-manipulation border border-white/20 ${
                isConnected 
                  ? "bg-gradient-to-r from-red-500 to-pink-600 active:from-red-600 active:to-pink-700" 
                  : "bg-gradient-to-r from-blue-500 to-purple-600 active:from-blue-600 active:to-purple-700"
              } text-white ${
                // Mobile hover states
                typeof window !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent) 
                ? "" // No hover effects on mobile
                : "hover:scale-105 hover:from-blue-600 hover:to-purple-700"
              }`}
            >
              {isConnected ? (
                <>
                  <Volume2 className="mr-3 h-6 w-6" />
                  Parar Conversa
                </>
              ) : (
                <>
                  <Mic className="mr-3 h-6 w-6" />
                  {typeof window !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent) 
                    ? "Tocar para Falar" // iOS-specific text
                    : "Começar"
                  }
                </>
              )}
            </Button>
          </div>

          {/* Voice Visualizer */}
          <div className="flex justify-center">
            <div className="relative">
              {isRecording ? (
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full bg-red-400 animate-pulse`}></div>
                  <Mic className="w-6 h-6 text-white/70" />
                  <div className={`w-3 h-3 rounded-full bg-red-400 animate-pulse`} style={{animationDelay: '0.2s'}}></div>
                </div>
              ) : isAgentSpeaking ? (
                <div className="flex items-center space-x-2">
                  <Volume2 className="w-6 h-6 text-green-400" />
                  <span className="text-white/60 text-sm">Falando...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full bg-blue-400`}></div>
                  <span className="text-white/60 text-sm">Aguardando</span>
                </div>
              )}
            </div>
          </div>


          {/* Subtitles */}
          <div className="bg-black/30 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
            <div className="text-xl md:text-2xl font-medium text-white text-center leading-relaxed">
              {isConnected ? 
                (subtitles || "Preparando...") : 
                "Clique em 'Começar' para iniciar a conversa"
              }
            </div>
          </div>

          {/* User Transcript */}
          {currentTranscript && (
            <div className="bg-blue-500/20 backdrop-blur-sm border border-blue-300/30 rounded-xl p-4">
              <p className="text-white text-center">
                <span className="text-blue-300">Você:</span> "{currentTranscript}"
              </p>
            </div>
          )}

          {/* Quick Text Input */}
          {isConnected && (
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
              <form onSubmit={handleTextSubmit} className="flex space-x-3">
                <Input
                  type="text"
                  placeholder="Ou digite..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="flex-1 bg-white/10 border-white/30 text-white placeholder-white/60"
                  disabled={isAgentSpeaking}
                />
                <Button
                  type="submit"
                  disabled={!textInput.trim() || isAgentSpeaking}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  →
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}