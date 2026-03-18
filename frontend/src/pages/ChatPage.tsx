import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import './ChatPage.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode?: 'streaming' | 'analysis';
}

type TypingMode = 'streaming' | 'analysis';

const sanitizeAssistantText = (text: string) =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '');

const ChatPage: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [displayedStreamingContent, setDisplayedStreamingContent] = useState('');
  const [typingMode, setTypingMode] = useState<TypingMode>('streaming');
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingQueueRef = useRef<string[]>([]);
  const streamingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io('http://localhost:3005/chat', {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connected', () => {
      setIsConnected(true);
    });

    socket.on('message', (data: Message) => {
      if (data.role === 'assistant') {
        // When a full message is received, clear streaming and add to messages
        setDisplayedStreamingContent('');
        streamingQueueRef.current = [];
        if (streamingIntervalRef.current) {
          clearInterval(streamingIntervalRef.current);
          streamingIntervalRef.current = null;
        }
        setMessages(prev => [...prev, data]);
        setIsTyping(false);
        setTypingMode('streaming');
      }
    });

    socket.on('stream', (data: { content: string }) => {
      // Add incoming content to characters queue
      const chars = data.content.split('');
      streamingQueueRef.current.push(...chars);
      
      // Start processing queue if not already
      if (!streamingIntervalRef.current) {
        streamingIntervalRef.current = setInterval(() => {
          if (streamingQueueRef.current.length > 0) {
            const nextChar = streamingQueueRef.current.shift();
            setDisplayedStreamingContent(prev => prev + (nextChar || ''));
          } else {
            // Keep interval running briefly to await more chunks or use a cleaner stop logic
          }
        }, 30); // 30ms per character for natural typing feel
      }
    });

    socket.on('typing', (data: { isTyping: boolean; mode?: TypingMode }) => {
      setIsTyping(data.isTyping);
      setTypingMode(data.mode || 'streaming');
      if (data.isTyping) {
        setDisplayedStreamingContent('');
        streamingQueueRef.current = [];
        if (streamingIntervalRef.current) {
          clearInterval(streamingIntervalRef.current);
          streamingIntervalRef.current = null;
        }
      }
    });

    socket.on('consultation-ended', () => {
      setIsConnected(false);
    });

    socket.on('error', (data: { message: string }) => {
      console.error('Socket error:', data.message);
    });

    return () => {
      socket.disconnect();
      if (streamingIntervalRef.current) clearInterval(streamingIntervalRef.current);
    };
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, displayedStreamingContent]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || !isConnected) return;

    const message: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, message]);
    socketRef.current.emit('message', { content: input.trim() });
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Fix for Korean IME double-firing: check e.nativeEvent.isComposing
    if (e.key === 'Enter' && !e.shiftKey) {
      if ((e.nativeEvent as any).isComposing) return;
      e.preventDefault();
      sendMessage();
    }
  };

  const endConsultation = () => {
    if (socketRef.current) {
      socketRef.current.emit('end-consultation');
      setTimeout(() => navigate('/'), 2000);
    }
  };

  return (
    <div className="chat-page">
      {/* Header */}
      <div className="chat-header glass-card">
        <div className="chat-header-info">
          <div className="chat-avatar">
            <span>🤖</span>
          </div>
          <div>
            <h2>AI 보험 상담사</h2>
            <span className={`chat-status ${isConnected ? 'online' : ''}`}>
              {isConnected ? '상담 중' : '연결 중...'}
            </span>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={endConsultation} id="end-chat">
          상담 종료
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        <div className="chat-guidance">
          <span className="chat-guidance-chip">실시간 상담</span>
          <p>일반 상담은 실시간으로 답변드리고, 분석/요약이 필요한 단계에서는 정리된 결과를 한 번에 보여드려요.</p>
        </div>

        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-bubble ${msg.role} ${msg.mode === 'analysis' ? 'analysis' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="bubble-avatar">🤖</div>
            )}
            <div className="bubble-content">
              {msg.role === 'assistant' && msg.mode === 'analysis' && (
                <div className="bubble-label">보장 분석 정리</div>
              )}
              <p>{sanitizeAssistantText(msg.content)}</p>
              <span className="bubble-time">
                {new Date(msg.timestamp).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {(isTyping || displayedStreamingContent) && (
          <div className={`chat-bubble assistant ${typingMode === 'analysis' ? 'analysis pending' : ''}`}>
            <div className="bubble-avatar">🤖</div>
            <div className="bubble-content">
              {typingMode === 'analysis' ? (
                <div className="analysis-loader">
                  <div className="analysis-loader-badge">분석 중</div>
                  <strong>고객님 정보를 바탕으로 보장 분석 내용을 정리하고 있어요.</strong>
                  <p>정리된 결과는 한 번에 깔끔하게 보여드릴게요.</p>
                  <div className="analysis-loader-bars">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ) : displayedStreamingContent ? (
                <p>{sanitizeAssistantText(displayedStreamingContent)}<span className="typing-cursor">|</span></p>
              ) : (
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area glass-card">
        <div className="chat-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder={isConnected ? '메시지를 입력하세요...' : '연결 중...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={!isConnected || isTyping}
            id="chat-input"
          />
          <button
            className="chat-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || !isConnected || isTyping}
            id="chat-send"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
