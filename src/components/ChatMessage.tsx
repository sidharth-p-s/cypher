import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  Copy, 
  Check, 
  User, 
  Bot, 
  Clock, 
  Zap, 
  Globe, 
  ExternalLink, 
  BookOpen,
  Sparkles
} from 'lucide-react';
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

  // Map source identifiers (like [S1], [S2], [1]) to genuine SearXNG URLs
  const processedContent = React.useMemo(() => {
    if (!message.content || !message.sources || message.sources.length === 0) {
      return message.content;
    }

    const sourceMap = new Map<string, string>();
    message.sources.forEach((s, idx) => {
      if (s.id && s.url) sourceMap.set(s.id.toUpperCase(), s.url);
      if (s.url) sourceMap.set(String(idx + 1), s.url);
      if (s.url) sourceMap.set(`S${idx + 1}`, s.url);
    });

    // Replace unlinked citation tags like [S1], [S2], [1] with genuine SearXNG links
    return message.content.replace(/\[(S\d+|\d+)\](?!\()/gi, (match, id) => {
      const genuineUrl = sourceMap.get(id.toUpperCase()) || sourceMap.get(id);
      if (genuineUrl) {
        return `[${match}](${genuineUrl})`;
      }
      return match;
    });
  }, [message.content, message.sources]);

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

          {/* Search Status Indicator (when searching the web or analysing results) */}
          {message.searchStatus && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[#0d1217] border border-emerald-900/40 flex items-center space-x-2.5 text-xs font-mono text-emerald-300/90 animate-in fade-in duration-150">
              <Globe className="w-4 h-4 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
              <div className="flex flex-col">
                <span className="font-medium text-emerald-300">{message.searchStatus}</span>
                {message.searchQuery && (
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Query: "{message.searchQuery}"
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Render thinking block if present or actively thinking */}
          {(message.thinking || message.isThinkingActive) && (
            <ThoughtBlock
              thinking={message.thinking || ''}
              isActive={message.isThinkingActive}
              durationMs={message.thinkingDurationMs}
            />
          )}

          {/* Message Markdown Content */}
          <div className="markdown-body text-zinc-200 text-sm leading-relaxed overflow-hidden">
            {processedContent ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  a({ node, href, children, ...props }: any) {
                    const text = String(children).trim();
                    const isCitation = /^\[(S\d+|\d+)\]$/i.test(text);

                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={
                          isCitation
                            ? 'inline-flex items-center text-[11px] font-mono font-medium text-emerald-400 hover:text-emerald-300 px-1 py-0.2 mx-0.5 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/60 rounded transition no-underline align-baseline cursor-pointer'
                            : 'text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition'
                        }
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
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
                {processedContent}
              </ReactMarkdown>
            ) : (
              message.isStreaming && !message.isThinkingActive && !message.searchStatus && (
                <div className="flex items-center space-x-2 text-zinc-500 py-1 text-xs font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"></span>
                  <span>Generating response...</span>
                </div>
              )
            )}
          </div>

          {/* Sources Section (when web search returned source citations) */}
          {!isUser && message.sources && message.sources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border-subtle/80">
              <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400 mb-2.5">
                <BookOpen className="w-3.5 h-3.5 text-emerald-400/80" />
                <span className="font-semibold uppercase tracking-wider text-[11px] text-zinc-300">
                  Sources ({message.sources.length})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {message.sources.map((source, idx) => (
                  <a
                    key={idx}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-lg bg-[#0e1015] hover:bg-[#141720] border border-border-subtle hover:border-zinc-700/80 transition-all flex flex-col justify-between group"
                    title={source.content ? `${source.title}\n\n${source.content}` : source.title}
                  >
                    <div className="flex items-start justify-between space-x-2">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 font-semibold flex-shrink-0">
                          {source.id || `S${idx + 1}`}
                        </span>
                        <span className="text-xs font-medium text-zinc-300 group-hover:text-emerald-300 truncate transition">
                          {source.title}
                        </span>
                      </div>
                      <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-300 flex-shrink-0 mt-0.5 transition" />
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <div className="flex items-center space-x-1.5 truncate">
                        <Globe className="w-2.5 h-2.5 text-zinc-600 flex-shrink-0" />
                        <span className="truncate">{source.domain}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 flex-shrink-0 text-[9px] text-zinc-500">
                        {source.extractionStatus === 'success' && (
                          <span className="px-1 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">
                            Extracted
                          </span>
                        )}
                        {source.extractionStatus === 'unavailable' && (
                          <span className="px-1 py-0.2 rounded bg-zinc-800/60 text-zinc-400 border border-zinc-700/40 font-mono">
                            Unavailable
                          </span>
                        )}
                        {source.extractionStatus === 'failed' && (
                          <span className="px-1 py-0.2 rounded bg-amber-950/40 text-amber-400/80 border border-amber-900/40 font-mono">
                            Failed
                          </span>
                        )}
                        {source.engine && (
                          <span className="px-1 py-0.2 rounded bg-zinc-800/80 uppercase tracking-wider">
                            {source.engine}
                          </span>
                        )}
                        {source.publishedDate && <span>{source.publishedDate}</span>}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

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
