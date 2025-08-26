# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Development:**
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run Next.js linting

**Package Management:**
- Uses `pnpm` for dependency management

## Architecture

This is a Next.js 15 application built as a Brazilian Portuguese conversation tutor with AI-powered voice interaction.

### Core Components

**App Structure (Next.js App Router):**
- `app/layout.tsx` - Root layout with Portuguese locale (pt-BR), Geist fonts, and VoiceProvider wrapper
- `app/page.tsx` - Main tutor interface with voice visualization and conversation controls
- `app/globals.css` - Global styles

**Voice System:**
- `components/voice-provider.tsx` - Comprehensive voice interaction system using Web APIs
  - Real-time voice activity detection with silence timeout
  - Speech synthesis for AI responses (Brazilian Portuguese voice)
  - MediaRecorder for user audio capture
  - OpenAI GPT-4o-mini integration for conversation generation
- `lib/tutor-config.ts` - Portuguese tutor personality and behavior configuration

**UI Framework:**
- Extensive Shadcn/UI component library (`components/ui/`)
- Tailwind CSS for styling with Tailwind v4
- Theme system with dark mode support via `next-themes`

### Key Features

**Conversation Flow:**
1. User starts conversation → AI greets in Portuguese
2. User can interact via voice (hold-to-talk) or text input
3. AI responds with contextually relevant questions to maintain conversation
4. Visual waveform animation reflects conversation state
5. Real-time transcription display and debug information

**Voice Processing:**
- Browser-based speech recognition (mock implementation with realistic responses)
- Portuguese voice synthesis with proper accent and pacing
- Voice activity detection with automatic silence cutoff
- Audio context management for microphone access

**AI Behavior:**
- **Claude API Integration**: Uses claude-3-5-haiku-20241022 for natural Portuguese conversations
- **Smart Fallback**: Automatically falls back to local contextual responses if API fails
- Configured to maintain simple, everyday conversation topics
- Focuses on language learning with gentle corrections
- Always asks follow-up questions to keep conversation flowing
- Responds exclusively in Brazilian Portuguese
- Understands context and responds to follow-up questions naturally

**Environment Setup:**
- Add `NEXT_PUBLIC_ANTHROPIC_API_KEY` to `.env.local` for Claude API access
- Without API key, app uses local contextual response system
- API key should be obtained from https://console.anthropic.com/

### Configuration Details

**Next.js Config (`next.config.mjs`):**
- Disabled ESLint and TypeScript errors during builds
- Unoptimized images for development flexibility

**TypeScript:**
- Path aliases: `@/*` maps to project root
- Strict mode enabled with modern ES features

**Tailwind:**
- Component configuration in `components.json`
- CSS variables for theming
- Lucide icons for UI elements

### Development Notes

- The voice recognition currently uses mock responses for demonstration
- Real speech-to-text would require integration with services like OpenAI Whisper
- Audio processing relies heavily on Web Audio API and MediaRecorder
- State management handled through React Context (VoiceProvider)