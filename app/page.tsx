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
        {!isConnected ? (
          // Welcome Screen
          <div className="text-center space-y-12 max-w-4xl">
            {/* Header */}
            <div className="space-y-6">
              <div className="relative">
                <h1 className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent leading-tight">
                  Bate-Papo
                </h1>
                <div className="absolute -top-2 -right-2 text-2xl animate-bounce">🇧🇷</div>
              </div>
              <p className="text-xl md:text-2xl text-white/80 max-w-3xl leading-relaxed">
                Seu tutor de <span className="text-yellow-300 font-semibold">português brasileiro</span> com IA. 
                Converse naturalmente e melhore sua fluência através de diálogos reais.
              </p>
            </div>

            {/* Features */}
            <div className="grid md:grid-cols-3 gap-6 text-white/70">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all">
                <MessageCircle className="w-8 h-8 text-blue-400 mb-3 mx-auto" />
                <h3 className="font-semibold text-white mb-2">Conversas Naturais</h3>
                <p className="text-sm">Pratique português em diálogos fluidos e contextualizados</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all">
                <Zap className="w-8 h-8 text-yellow-400 mb-3 mx-auto" />
                <h3 className="font-semibold text-white mb-2">Detecção Automática</h3>
                <p className="text-sm">Fale naturalmente - sua voz é detectada automaticamente</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all">
                <Heart className="w-8 h-8 text-pink-400 mb-3 mx-auto" />
                <h3 className="font-semibold text-white mb-2">Aprendizado Gentil</h3>
                <p className="text-sm">Correções naturais que não interrompem a conversa</p>
              </div>
            </div>

            {/* CTA Button */}
            <div className="space-y-6">
              <Button
                onClick={startConversation}
                size="lg"
                className="px-16 py-6 text-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-full shadow-2xl hover:shadow-blue-500/25 transition-all duration-300 transform hover:scale-105 border border-white/20"
              >
                <Mic className="mr-3 h-6 w-6" />
                Começar Conversa
              </Button>
              <p className="text-white/60 text-sm">
                🎤 Acesso ao microfone necessário para conversas automáticas
              </p>
            </div>
          </div>
        ) : (
          // Conversation Screen
          <div className="w-full max-w-5xl space-y-8">
            {/* Status Header */}
            <div className="text-center space-y-4">
              <div className="flex justify-center items-center space-x-4">
                <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${getStatusColor()} animate-pulse shadow-lg`}></div>
                <h2 className="text-2xl font-semibold text-white">
                  {getStatusMessage()}
                </h2>
              </div>
              
              {/* Conversation Counter */}
              <div className="flex justify-center items-center space-x-6 text-white/70">
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm">{conversationCount} trocas</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 text-blue-400" />
                  <span className="text-sm">Português BR</span>
                </div>
              </div>
            </div>

            {/* Voice Activity Visualizer */}
            <div className="flex justify-center">
              <div className="relative">
                <div className={`w-32 h-32 rounded-full bg-gradient-to-r ${getStatusColor()} p-1 ${isRecording ? 'animate-pulse' : ''} shadow-2xl`}>
                  <div className="w-full h-full bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20">
                    {isRecording ? (
                      <div className="w-12 h-12 bg-white rounded-full animate-ping opacity-75"></div>
                    ) : isAgentSpeaking ? (
                      <Volume2 className="w-12 h-12 text-white animate-pulse" />
                    ) : (
                      <Mic className="w-12 h-12 text-white" />
                    )}
                  </div>
                </div>
                
                {/* Voice activity rings */}
                {isRecording && (
                  <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping"></div>
                )}
              </div>
            </div>

            {/* Subtitles Display */}
            <div className="bg-black/30 backdrop-blur-sm border border-white/20 rounded-2xl p-8 min-h-[150px] flex items-center justify-center shadow-2xl">
              <p className="text-2xl md:text-3xl leading-relaxed font-medium text-center text-white">
                {subtitles || "Preparando sua primeira pergunta..."}
              </p>
            </div>

            {/* User Transcript */}
            {currentTranscript && (
              <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-blue-300/30 rounded-2xl p-6 shadow-xl">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">Você</span>
                  </div>
                  <p className="text-lg text-white flex-1 leading-relaxed">
                    "{currentTranscript}"
                  </p>
                </div>
              </div>
            )}

            {/* Quick Text Input */}
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 shadow-xl">
              <form onSubmit={handleTextSubmit} className="flex space-x-4">
                <Input
                  type="text"
                  placeholder="Ou digite sua mensagem aqui..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="flex-1 bg-white/10 border-white/30 text-white placeholder-white/60 focus:border-blue-400 focus:ring-blue-400/20"
                  disabled={isAgentSpeaking}
                />
                <Button
                  type="submit"
                  disabled={!textInput.trim() || isAgentSpeaking}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6"
                >
                  Enviar
                </Button>
              </form>
              <p className="text-white/50 text-xs mt-2 text-center">
                💡 Dica: Você pode falar naturalmente ou digitar
              </p>
            </div>

            {/* Control Panel */}
            <div className="flex justify-center space-x-4">
              <Button
                onClick={stopConversation}
                variant="outline"
                size="lg"
                className="px-8 py-4 text-lg border-2 border-red-400/50 text-red-300 hover:bg-red-500/20 bg-transparent backdrop-blur-sm hover:border-red-400 transition-all"
              >
                Finalizar Conversa
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}