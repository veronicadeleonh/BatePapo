"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useVoice } from "@/components/voice-provider"
import { Mic, MicOff, Volume2, Settings, MessageCircle, Heart, Star, Zap } from "lucide-react"

export default function PortugueseTutor() {
  const [textInput, setTextInput] = useState("")
  const [showDebug, setShowDebug] = useState(false)
  const [conversationCount, setConversationCount] = useState(0)

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
  } = useVoice()

  // Track conversation exchanges
  useEffect(() => {
    if (currentTranscript) {
      setConversationCount(prev => prev + 1)
    }
  }, [currentTranscript])

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
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_50%,rgba(156,146,172,0.1)_2px,transparent_2px)] [background-size:60px_60px]"></div>
      
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

      {showDebug && (
        <div className="fixed top-16 right-4 bg-black/90 backdrop-blur-sm text-white p-4 rounded-lg text-xs max-w-sm z-40 border border-white/20">
          <div className="font-bold mb-2 text-green-400">Debug Status:</div>
          <div className="space-y-1 text-gray-300">
            <div>Connected: <span className={isConnected ? "text-green-400" : "text-red-400"}>{isConnected.toString()}</span></div>
            <div>Listening: <span className={isListening ? "text-blue-400" : "text-gray-400"}>{isListening.toString()}</span></div>
            <div>Speaking: <span className={isAgentSpeaking ? "text-green-400" : "text-gray-400"}>{isAgentSpeaking.toString()}</span></div>
            <div>Recording: <span className={isRecording ? "text-red-400" : "text-gray-400"}>{isRecording.toString()}</span></div>
            <div>Voice: <span className="text-blue-400">{Math.round(voiceActivity)}</span></div>
          </div>
          <div className="mt-3 space-y-1 border-t border-white/20 pt-2 max-h-32 overflow-y-auto">
            {debugInfo.slice(-5).map((log, i) => (
              <div key={i} className="text-xs opacity-70 text-gray-400">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center min-h-screen p-4 relative z-10">
        <div className="w-full max-w-4xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="relative">
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent">
                Bate-Papo 🇧🇷
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

            {/* Main Control Button */}
            <Button
              onClick={isConnected ? stopConversation : startConversation}
              size="lg"
              className={`px-12 py-6 text-xl rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 border border-white/20 ${
                isConnected 
                  ? "bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700" 
                  : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              } text-white`}
            >
              {isConnected ? (
                <>
                  <Volume2 className="mr-3 h-6 w-6" />
                  Parar Conversa
                </>
              ) : (
                <>
                  <Mic className="mr-3 h-6 w-6" />
                  Começar
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
          <div className="bg-black/30 backdrop-blur-sm border border-white/20 rounded-2xl p-6 min-h-[120px] flex items-center justify-center">
            <p className="text-xl md:text-2xl text-center text-white leading-relaxed">
              {isConnected ? (subtitles || "Preparando...") : "Clique em 'Começar' para iniciar a conversa"}
            </p>
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