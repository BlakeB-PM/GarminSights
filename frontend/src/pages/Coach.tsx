import { useState, useRef, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Send, Bot, User, Sparkles, Copy, Check, Plus } from 'lucide-react';
import { sendChatMessage, type ChatResponse } from '../lib/api';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Splits a string of concatenated pipe-delimited table rows into individual rows.
 * Uses the separator row (|---|---|) to determine column count, then splits by
 * counting pipes-per-row.  Returns null if no valid table is detected.
 */
function splitTableRows(tableText: string): string[] | null {
  // Find the separator portion to determine column count.
  const sepRegex = /\|(?:[\s]*[-:]+[\s]*\|)+/g;
  const sepMatches = tableText.match(sepRegex);
  if (!sepMatches) return null;

  const separator = sepMatches.reduce((a, b) => (a.length >= b.length ? a : b));
  const colCount = (separator.match(/\|/g) || []).length - 1;
  if (colCount < 2) return null;

  const pipePositions: number[] = [];
  for (let i = 0; i < tableText.length; i++) {
    if (tableText[i] === '|') pipePositions.push(i);
  }

  const pipesPerRow = colCount + 1;
  if (pipePositions.length < pipesPerRow * 2) return null; // Need at least 2 rows

  const rows: string[] = [];
  for (let i = 0; i + pipesPerRow <= pipePositions.length; i += pipesPerRow) {
    const start = pipePositions[i];
    const end = pipePositions[i + pipesPerRow - 1];
    rows.push(tableText.substring(start, end + 1));
  }
  return rows.length >= 2 ? rows : null;
}

/**
 * Preprocesses markdown so that pipe-delimited tables always have each row on
 * its own line with a blank line before the header — the format remark-gfm needs.
 *
 * Handles:
 *  - Entire table flattened onto one line
 *  - Table embedded after paragraph text on the same line
 *  - Header on its own line but separator+data rows concatenated
 *  - Already-correct tables (no-op)
 */
function preprocessMarkdown(content: string): string {
  if (!content.includes('|')) return content;

  const lines = content.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip lines without a table separator pattern — nothing to fix.
    if (!/\|[\s]*[-:]+[\s]*\|/.test(trimmed)) {
      out.push(lines[i]);
      continue;
    }

    // Locate the first pipe to separate any leading prose from the table.
    const firstPipe = trimmed.indexOf('|');
    const prefix = trimmed.substring(0, firstPipe).trim();
    const tableText = trimmed.substring(firstPipe);

    const rows = splitTableRows(tableText);
    if (!rows) {
      // Line has a separator-like pattern but couldn't be split into rows.
      // It might be a single separator row for a table whose header is on the
      // previous line.  Check the *next* line for concatenated data rows.
      out.push(lines[i]);
      continue;
    }

    // Emit any prose prefix as its own paragraph.
    if (prefix) {
      out.push(prefix);
      out.push('');
    } else {
      // Ensure a blank line before the table UNLESS the previous output line
      // is already a table row (e.g. the header was on its own line).
      const prev = out.length > 0 ? out[out.length - 1].trim() : '';
      const prevIsTableRow = prev.startsWith('|') && prev.endsWith('|');
      if (out.length > 0 && prev !== '' && !prevIsTableRow) {
        out.push('');
      }
    }

    out.push(...rows);
  }

  // Second pass: merge a standalone header row with the table rows that follow.
  // If we have:
  //   | Header1 | Header2 |   <-- single row, no separator
  //   (blank line)
  //   |---------|---------|   <-- separator (from split above)
  //   | data ...
  // Remove the blank line so they form a contiguous table.
  const merged: string[] = [];
  for (let i = 0; i < out.length; i++) {
    if (
      out[i].trim() === '' &&
      i > 0 &&
      i < out.length - 1 &&
      out[i - 1].trim().startsWith('|') &&
      out[i - 1].trim().endsWith('|') &&
      /^\|[\s]*[-:]/.test(out[i + 1].trim())
    ) {
      // Drop the blank line between a header row and its separator.
      continue;
    }
    merged.push(out[i]);
  }

  return merged.join('\n');
}

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
      let detail: string;
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        detail = 'Cannot reach the server. Is the backend running?';
      } else if (error instanceof Error) {
        detail = error.message;
      } else {
        detail = 'An unexpected error occurred.';
      }
      console.error('[AI Coach] Chat error:', error);
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
    <div className="h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] flex flex-col animate-fade-in -mx-1 sm:mx-0">
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
        <div className="flex-1 overflow-y-auto p-2 sm:p-6 space-y-4">
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
                      'min-w-0 rounded-2xl px-2 py-2 sm:px-4 sm:py-3 group relative',
                      message.role === 'user'
                        ? 'max-w-[85%] sm:max-w-[75%] bg-accent text-white rounded-tr-none'
                        : 'w-full bg-card border border-card-border rounded-tl-none'
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none
                        prose-p:text-gray-200 prose-p:leading-relaxed
                        prose-headings:text-gray-100 prose-headings:font-semibold
                        prose-strong:text-gray-100
                        prose-code:text-accent prose-code:bg-background prose-code:px-1 prose-code:rounded prose-code:text-xs
                        prose-pre:bg-background prose-pre:text-xs prose-pre:overflow-x-auto
                        prose-li:text-gray-200 prose-li:marker:text-accent
                        prose-a:text-accent
                        prose-hr:border-card-border
                        [&_table]:w-full [&_table]:text-sm [&_table]:border-collapse
                        [&_thead]:bg-background
                        [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-gray-300 [&_th]:font-semibold [&_th]:border [&_th]:border-card-border
                        [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-gray-200 [&_td]:border [&_td]:border-card-border
                        [&_tr:nth-child(even)]:bg-background/50">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-3 -mx-1">
                                <table className="min-w-full">{children}</table>
                              </div>
                            ),
                          }}
                        >{preprocessMarkdown(message.content)}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm sm:text-base">{message.content}</p>
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
          <div className="px-3 sm:px-6 py-3 border-t border-card-border">
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
        <div className="p-3 sm:p-4 border-t border-card-border">
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

