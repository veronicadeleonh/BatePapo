"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useVoice } from "@/components/voice-provider"
import { Mic, MicOff } from "lucide-react"

export default function PortugueseTutor() {
  const [textInput, setTextInput] = useState("")

  const {
    isConnected,
    isListening,
    isAgentSpeaking,
    isRecording,
    currentTranscript,
    subtitles,
    startConversation,
    stopConversation,
    debugInfo,
  } = useVoice()


  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (textInput.trim() && !isAgentSpeaking) {
      sendTextMessage(textInput)
      setTextInput("")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="fixed top-4 left-4 bg-black/80 text-white p-3 rounded-lg text-xs max-w-sm">
        <div className="font-bold mb-2">Debug Info:</div>
        <div>Connected: {isConnected.toString()}</div>
        <div>Listening: {isListening.toString()}</div>
        <div>Agent Speaking: {isAgentSpeaking.toString()}</div>
        <div>Recording: {isRecording.toString()}</div>
        <div className="mt-2 space-y-1">
          {debugInfo.map((log, i) => (
            <div key={i} className="text-xs opacity-80">
              {log}
            </div>
          ))}
        </div>
      </div>

      {!isConnected ? (
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-gray-900">Tutor de Português Brasileiro</h1>
            <p className="text-xl text-gray-600 max-w-2xl">
              Pratique português com seu tutor de IA. Tenha conversas naturais e melhore sua fluência.
            </p>
          </div>

          <Button
            onClick={startConversation}
            size="lg"
            className="px-12 py-6 text-xl bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
          >
            Começar Conversa
          </Button>

          <p className="text-sm text-gray-500">Acesso ao microfone necessário - conversas automáticas</p>
        </div>
      ) : (
        <div className="w-full max-w-4xl text-center space-y-8">
          <div className="flex justify-center items-center space-x-4">
            <div
              className={`w-3 h-3 rounded-full ${
                isAgentSpeaking ? "bg-green-500" : isRecording ? "bg-red-500" : "bg-blue-500"
              } animate-pulse`}
            ></div>
            <p className="text-xl font-medium text-gray-700">
              {isAgentSpeaking ? "Tutor falando..." : isRecording ? "Ouvindo você..." : "Pronto para ouvir"}
            </p>
          </div>


          <div className="bg-black/80 text-white p-6 rounded-lg min-h-[120px] flex items-center justify-center">
            <p className="text-2xl leading-relaxed font-medium">{subtitles || "Preparando sua primeira pergunta..."}</p>
          </div>

          {currentTranscript && (
            <div className="bg-blue-100 text-blue-900 p-4 rounded-lg">
              <p className="text-lg">Você disse: "{currentTranscript}"</p>
            </div>
          )}

          <div className="bg-white border-2 border-blue-200 rounded-lg p-8">
            <div className="text-center space-y-4">
              <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center ${
                isRecording ? "bg-red-100 border-4 border-red-500" : "bg-blue-100 border-4 border-blue-500"
              } transition-all duration-300`}>
                {isRecording ? (
                  <div className="w-8 h-8 bg-red-500 rounded-full animate-pulse"></div>
                ) : (
                  <Mic size={32} className="text-blue-600" />
                )}
              </div>
              <p className="text-blue-800 font-medium text-lg">
                {isRecording ? "Falando..." : "Conversação ativa"}
              </p>
              <p className="text-sm text-gray-600">
                Fale naturalmente - sua voz será detectada automaticamente
              </p>
            </div>
          </div>

          <Button
            onClick={stopConversation}
            variant="outline"
            size="lg"
            className="px-8 py-4 text-lg border-2 border-red-500 text-red-600 hover:bg-red-50 bg-transparent"
          >
            Parar Conversa
          </Button>
        </div>
      )}
    </div>
  )
}
