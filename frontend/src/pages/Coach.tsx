import { useState, useRef, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Send, Bot, User, Sparkles, Copy, Check, Plus } from 'lucide-react';
import { sendChatMessage, type ChatResponse } from '../lib/api';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  "How are my squat and deadlift progressing?",
  "Am I training each muscle group enough?",
  "What does my cardio volume look like this month?",
  "How's my training load — am I overreaching?",
  "What are my strongest lifts right now?",
  "How's my cycling power trending?",
];

export function Coach({ onMenuToggle }: { onMenuToggle?: () => void } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('coach-messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMessages(parsed.map((m: Message) => ({ ...m, timestamp: new Date(m.timestamp) })));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('coach-messages', JSON.stringify(messages));
    }
  }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(messageText);
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'An unexpected error occurred.';
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, something went wrong: ${detail}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    setMessages([]);
    localStorage.removeItem('coach-messages');
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col animate-fade-in">
      <Header
        title="AI Coach"
        subtitle="Your personal fitness advisor powered by your data"
        onMenuToggle={onMenuToggle}
      />

      {/* New Chat button */}
      {messages.length > 0 && (
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="sm" onClick={handleClearHistory}>
            <Plus className="w-4 h-4 mr-1" /> New Chat
          </Button>
        </div>
      )}

      {/* Chat Container */}
      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-gray-100 mb-2">
                Hey! I'm your AI Coach
              </h3>
              <p className="text-gray-400 max-w-md mb-6">
                I can analyze your fitness data and provide personalized insights.
                Ask me anything about your training, recovery, or progress!
              </p>
              
              {/* Suggested Prompts */}
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="px-3 py-2 text-sm bg-card hover:bg-card-border border border-card-border rounded-lg text-gray-300 hover:text-gray-100 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      message.role === 'user'
                        ? 'bg-accent/20'
                        : 'bg-gradient-to-br from-accent to-accent-dark'
                    )}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-accent" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-3 group relative',
                      message.role === 'user'
                        ? 'bg-accent text-white rounded-tr-none'
                        : 'bg-card border border-card-border rounded-tl-none'
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p>{message.content}</p>
                    )}
                    
                    {/* Copy button for assistant messages */}
                    {message.role === 'assistant' && (
                      <button
                        onClick={() => handleCopy(message.id, message.content)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-card-border"
                      >
                        {copiedId === message.id ? (
                          <Check className="w-4 h-4 text-success" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                    )}
                    
                    {/* Timestamp */}
                    <p
                      className={cn(
                        'text-xs mt-1',
                        message.role === 'user' ? 'text-white/60' : 'text-gray-500'
                      )}
                    >
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-card border border-card-border rounded-2xl rounded-tl-none px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Suggested Prompts (when there are messages) */}
        {messages.length > 0 && (
          <div className="px-6 py-3 border-t border-card-border">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
              {SUGGESTED_PROMPTS.slice(0, 4).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs bg-card hover:bg-card-border border border-card-border rounded-full text-gray-400 hover:text-gray-100 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t border-card-border">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask your coach..."
              disabled={isLoading}
              className="flex-1 bg-background border border-card-border rounded-xl px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
            />
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="px-4"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
          
          {messages.length > 0 && (
            <div className="flex justify-end mt-2">
              <button
                onClick={handleClearHistory}
                className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                Clear history
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

