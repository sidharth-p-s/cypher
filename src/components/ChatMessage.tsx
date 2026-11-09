import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Copy, Check, Terminal, User, Bot, Clock, Zap } from 'lucide-react';
import { Message } from '../types/chat';
import { ThoughtBlock } from './ThoughtBlock';

interface ChatMessageProps {
  message: Message;
  modelName: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, modelName }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`py-5 px-4 md:px-8 border-b border-border/40 transition-colors ${
        isUser ? 'bg-surface-200/40' : 'bg-transparent'
      }`}
    >
      <div className="max-w-4xl mx-auto flex items-start space-x-3.5">
        {/* Avatar */}
        <div className="flex-shrink-0 pt-0.5">
          {isUser ? (
            <div className="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-md bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-blue-400">
              <Bot className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Content body */}
        <div className="flex-1 min-w-0">
          {/* Header info */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-xs tracking-wide text-zinc-300 font-mono">
                {isUser ? 'YOU' : modelName.toUpperCase()}
              </span>
              <span className="text-[11px] text-zinc-600 font-mono">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <button
              onClick={() => copyToClipboard(message.content)}
              className="opacity-60 hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-200 rounded transition"
              title="Copy response"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Render thinking block if present or actively thinking */}
          {(message.thinking || message.isThinkingActive) && (
            <ThoughtBlock
              thinking={message.thinking || ''}
              isActive={message.isThinkingActive}
            />
          )}

          {/* Message Markdown Content */}
          <div className="markdown-body text-zinc-200 text-sm leading-relaxed overflow-hidden">
            {message.content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeString = String(children).replace(/\n$/, '');

                    if (!inline && match) {
                      return (
                        <div className="relative group my-3 rounded-lg overflow-hidden border border-zinc-800 bg-[#0c0d11]">
                          <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#12141a] border-b border-zinc-800 text-zinc-400 text-xs font-mono">
                            <span className="text-zinc-400">{match[1]}</span>
                            <button
                              onClick={() => copyToClipboard(codeString)}
                              className="hover:text-zinc-100 flex items-center space-x-1 py-0.5 px-1.5 rounded transition"
                            >
                              <Copy className="w-3 h-3" />
                              <span className="text-[10px]">Copy</span>
                            </button>
                          </div>
                          <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed text-zinc-200 font-mono">
                            <code>{codeString}</code>
                          </pre>
                        </div>
                      );
                    }

                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              message.isStreaming && !message.isThinkingActive && (
                <div className="flex items-center space-x-2 text-zinc-500 py-1 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"></span>
                  <span>Generating response...</span>
                </div>
              )
            )}
          </div>

          {/* Metrics bar for Assistant */}
          {!isUser && message.metrics && (
            <div className="mt-3 pt-2 border-t border-border-subtle flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-500">
              {message.metrics.tokensPerSecond && (
                <span className="flex items-center space-x-1 text-emerald-400/80">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>{message.metrics.tokensPerSecond} tok/s</span>
                </span>
              )}
              {message.metrics.evalCount && (
                <span>{message.metrics.evalCount} tokens</span>
              )}
              {message.metrics.totalDurationMs && (
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{(message.metrics.totalDurationMs / 1000).toFixed(2)}s</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

