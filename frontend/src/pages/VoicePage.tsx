import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import './VoicePage.css';

interface VoiceMessage {
  role: 'user' | 'assistant';
  text: string;
}

const VoicePage: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('연결 준비 중...');
  const [callDuration, setCallDuration] = useState(0);
  const [endCallMessage, setEndCallMessage] = useState('');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const transcriptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const socketRef = useRef<Socket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mutedMonitorGainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackCursorRef = useRef(0);

  const playAudio = useCallback((base64Data: string) => {
    try {
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
        playbackCursorRef.current = 0;
      }

      const ctx = outputAudioContextRef.current;
      
      // Resume context if suspended (browser policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Convert PCM16 to Float32
      const pcm16 = new Int16Array(bytes.buffer.slice(0));
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startAt = Math.max(now, playbackCursorRef.current);
      source.start(startAt);
      playbackCursorRef.current = startAt + audioBuffer.duration;
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, []);

  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const mutedMonitorGain = audioContext.createGain();
      mutedMonitorGain.gain.value = 0;

      processor.onaudioprocess = (e) => {
        if (!socketRef.current?.connected) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(pcm16.buffer)),
        );

        socketRef.current.emit('audio', {
          data: base64,
          mimeType: 'audio/pcm;rate=16000',
        });
      };

      source.connect(processor);
      processor.connect(mutedMonitorGain);
      mutedMonitorGain.connect(audioContext.destination);
      inputAudioContextRef.current = audioContext;
      processorRef.current = processor;
      mutedMonitorGainRef.current = mutedMonitorGain;
    } catch (err) {
      console.error('Microphone error:', err);
      // We don't set status here, we let the caller handle it or keep current status
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket = io('http://localhost:3005/voice', {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connected', async () => {
      setIsConnected(true);
      setIsCallActive(true);
      setCallStatus('통화 중');
      
      // Attempt to start microphone, but don't let failure block the consultation
      startMicrophone().catch(err => {
        console.warn('Microphone failed, continuing in listen-only mode:', err);
        setCallStatus('청취 전용 (마이크 없음)');
        setIsMicEnabled(false);
      });

      // Start timer
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    });

    socket.on('audio', (data: { data: string }) => {
      playAudio(data.data);
      setIsAiSpeaking(true);
      
      // Reset isAiSpeaking after a delay if no more audio arrives
      if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
      transcriptTimeoutRef.current = setTimeout(() => {
        setIsAiSpeaking(false);
      }, 2000);
    });

    socket.on('transcript', (data: { role: 'user' | 'assistant'; text: string }) => {
      const normalized = data.text?.trim();
      if (!normalized) return;

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === data.role) {
          if (last.text === normalized) {
            return prev;
          }

          if (normalized.startsWith(last.text) || last.text.startsWith(normalized)) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: normalized },
            ];
          }

          return [
            ...prev.slice(0, -1),
            { ...last, text: `${last.text} ${normalized}`.trim() },
          ];
        }

        return [...prev, { role: data.role, text: normalized }];
      });
    });

    socket.on('end-call-initiated', () => {
      setEndCallMessage('상담사가 통화를 종료하려고 합니다...');
    });

    socket.on('call-ended', () => {
      setCallStatus('통화 종료됨');
      setIsCallActive(false);
      setEndCallMessage('통화가 종료되었습니다.');
      cleanupCall();
      setTimeout(() => navigate('/'), 3000);
    });

    socket.on('error', (data: { message: string }) => {
      console.error('Voice error:', data.message);
      setCallStatus('오류 발생');
    });

    return () => {
      cleanupCall();
      socket.disconnect();
    };
  }, [token, startMicrophone, playAudio, navigate]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const cleanupCall = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mutedMonitorGainRef.current) {
      mutedMonitorGainRef.current.disconnect();
      mutedMonitorGainRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => undefined);
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close().catch(() => undefined);
      outputAudioContextRef.current = null;
    }
    playbackCursorRef.current = 0;
  };

  const sendTextInput = () => {
    const value = textInput.trim();
    if (!value || !socketRef.current || !isConnected || !isCallActive) return;

    socketRef.current.emit('text-input', { text: value });
    setTextInput('');
  };

  const endCall = () => {
    if (socketRef.current) {
      socketRef.current.emit('end-call');
    }
    cleanupCall();
    setIsCallActive(false);
    setCallStatus('통화 종료됨');
    setTimeout(() => navigate('/'), 2000);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="voice-page">
      <div className="voice-container">
        {/* Visual */}
        <div className="voice-visual">
          <div className={`voice-circle ${isCallActive ? 'active' : ''}`}>
            <div className="voice-ripple" />
            <div className="voice-ripple ripple-2" />
            <div className="voice-ripple ripple-3" />
            <div className="voice-icon">
              {isCallActive ? '📞' : '🤖'}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="voice-info">
          <h1>AI 보험 상담사</h1>
          <p className="voice-status-text">{callStatus}</p>
          {isCallActive && (
            <p className="voice-duration">{formatDuration(callDuration)}</p>
          )}
          {endCallMessage && (
            <p className="voice-end-message">{endCallMessage}</p>
          )}

          <div className={`voice-transcript-container ${messages.length ? 'visible' : ''}`}>
            <div className="voice-transcript-label">대화 로그</div>
            <div className="voice-conversation-list">
              {messages.length ? (
                messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`voice-message ${message.role} ${message.role === 'assistant' && isAiSpeaking && index === messages.length - 1 ? 'speaking' : ''}`}
                  >
                    <div className="voice-message-role">
                      {message.role === 'assistant' ? 'AI 상담사' : '고객'}
                    </div>
                    <div className="voice-message-text">{message.text}</div>
                  </div>
                ))
              ) : (
                <div className="voice-transcript-placeholder">
                  통화가 시작되면 고객과 AI의 대화가 여기에 표시됩니다.
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          <div className="voice-text-test glass-card">
            <div className="voice-transcript-label">텍스트 테스트 입력</div>
            <p className="voice-text-help">
              마이크 사용이 어려우면 아래 입력창으로 말한 것처럼 테스트할 수 있습니다.
            </p>
            <div className="voice-text-input-row">
              <input
                type="text"
                className="voice-text-input"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    sendTextInput();
                  }
                }}
                placeholder="예: 현재 가입한 보험 점검받고 싶어요"
                disabled={!isConnected || !isCallActive}
              />
              <button
                className="voice-text-send-btn"
                onClick={sendTextInput}
                disabled={!textInput.trim() || !isConnected || !isCallActive}
              >
                보내기
              </button>
            </div>
            <div className="voice-mic-status">
              {isMicEnabled ? '마이크 입력 사용 가능' : '현재 청취/텍스트 테스트 모드'}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="voice-controls">
          <button
            className={`voice-end-btn ${!isCallActive ? 'disabled' : ''}`}
            onClick={endCall}
            disabled={!isCallActive}
            id="end-call"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            통화 종료
          </button>
        </div>

        {!isConnected && (
          <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
            돌아가기
          </button>
        )}
      </div>
    </div>
  );
};

export default VoicePage;
