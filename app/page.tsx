"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useVoice } from "@/components/voice-provider"
import { Mic, MicOff } from "lucide-react"

export default function PortugueseTutor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
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
    sendTextMessage,
    startVoiceInput,
    stopVoiceInput,
    debugInfo,
  } = useVoice()

  const startWaveformAnimation = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const animate = () => {
      const width = canvas.width
      const height = canvas.height

      ctx.clearRect(0, 0, width, height)

      const time = Date.now() * 0.005
      const centerY = height / 2
      const amplitude = isAgentSpeaking ? 60 : isRecording ? 45 : isListening ? 30 : 15
      const frequency = isAgentSpeaking ? 0.03 : 0.02

      ctx.strokeStyle = isAgentSpeaking ? "#10b981" : isRecording ? "#ef4444" : "#3b82f6"
      ctx.lineWidth = 3
      ctx.beginPath()

      for (let x = 0; x < width; x += 2) {
        const y = centerY + Math.sin(x * frequency + time) * amplitude * Math.sin(time * 0.5)
        if (x === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }

      ctx.stroke()
      animationRef.current = requestAnimationFrame(animate)
    }

    animate()
  }

  useEffect(() => {
    if (isConnected) {
      startWaveformAnimation()
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isConnected, isAgentSpeaking, isListening, isRecording])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = 800
      canvas.height = 200
    }
  }, [])

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

          <p className="text-sm text-gray-500">Acesso ao microfone necessário</p>
        </div>
      ) : (
        <div className="w-full max-w-4xl text-center space-y-8">
          <div className="flex justify-center items-center space-x-4">
            <div
              className={`w-3 h-3 rounded-full ${
                isAgentSpeaking ? "bg-green-500" : isRecording ? "bg-red-500" : "bg-blue-500"
              } animate-pulse`}
            ></div>
            <p className="text-lg font-medium text-gray-700">
              {isAgentSpeaking ? "Tutor falando..." : isRecording ? "Gravando sua resposta..." : "Sua vez de responder"}
            </p>
          </div>

          <div className="flex justify-center">
            <canvas ref={canvasRef} className="border-2 border-blue-200 rounded-lg bg-white/50 backdrop-blur-sm" />
          </div>

          <div className="bg-black/80 text-white p-6 rounded-lg min-h-[120px] flex items-center justify-center">
            <p className="text-2xl leading-relaxed font-medium">{subtitles || "Preparando sua primeira pergunta..."}</p>
          </div>

          {currentTranscript && (
            <div className="bg-blue-100 text-blue-900 p-4 rounded-lg">
              <p className="text-lg">Você disse: "{currentTranscript}"</p>
            </div>
          )}

          <div className="bg-white border-2 border-blue-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-center space-x-4">
              <Button
                onMouseDown={startVoiceInput}
                onMouseUp={stopVoiceInput}
                onTouchStart={startVoiceInput}
                onTouchEnd={stopVoiceInput}
                disabled={isAgentSpeaking}
                className={`w-16 h-16 rounded-full ${
                  isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : "bg-blue-500 hover:bg-blue-600"
                } text-white shadow-lg transition-all duration-200`}
              >
                {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
              </Button>
              <div className="text-center">
                <p className="text-blue-800 font-medium">{isRecording ? "Solte para parar" : "Segure para falar"}</p>
                <p className="text-sm text-gray-600">ou digite abaixo</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-blue-800 mb-4 font-medium">Digite sua resposta em português:</p>
              <form onSubmit={handleTextSubmit} className="flex gap-2">
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Escreva sua resposta aqui..."
                  disabled={isAgentSpeaking || isRecording}
                  className="flex-1 text-lg p-3"
                />
                <Button
                  type="submit"
                  disabled={!textInput.trim() || isAgentSpeaking || isRecording}
                  className="px-6 py-3"
                >
                  Enviar
                </Button>
              </form>
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
