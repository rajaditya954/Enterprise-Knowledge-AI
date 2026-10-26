import { useState, useRef, useEffect, useCallback } from 'react';
import { streamQuery } from '../../api.js';
import styles from './Chat.module.css';

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const cancelRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput('');
    setError('');
    setIsStreaming(true);

    // Add user message
    const userMsg = { role: 'user', content: question };
    const assistantMsg = { role: 'assistant', content: '', sources: [], followUps: [], refused: false, streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    cancelRef.current = streamQuery(
      question,
      conversationId,
      // onDelta
      (data) => {
        if (data.conversationId) {
          setConversationId(data.conversationId);
          return;
        }
        if (data.text) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.content += data.text;
            updated[updated.length - 1] = last;
            return updated;
          });
        }
      },
      // onDone
      (data) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = { ...updated[updated.length - 1] };
          last.streaming = false;
          last.sources = data.sources || [];
          last.followUps = data.followUps || [];
          last.refused = data.refused || false;
          updated[updated.length - 1] = last;
          return updated;
        });
        setIsStreaming(false);
      },
      // onError
      (msg) => {
        setError(msg);
        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0) {
            const last = { ...updated[updated.length - 1] };
            last.streaming = false;
            updated[updated.length - 1] = last;
          }
          return updated;
        });
        setIsStreaming(false);
      }
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFollowUp = (question) => {
    setInput(question);
    textareaRef.current?.focus();
  };

  const handleNewChat = () => {
    if (cancelRef.current) cancelRef.current();
    setMessages([]);
    setConversationId(null);
    setError('');
    setIsStreaming(false);
    setInput('');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Knowledge Assistant</h1>
        <button className={styles.newChatBtn} onClick={handleNewChat} id="new-chat-btn">
          + New Chat
        </button>
      </header>

      <div className={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon} aria-hidden="true">🧠</div>
            <h2 className={styles.emptyTitle}>Ask anything about your documents</h2>
            <p className={styles.emptySubtitle}>
              Your questions will be answered using your organization's knowledge base.
              Every answer includes citations to the source documents.
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={styles.message}>
              {msg.role === 'user' ? (
                <div className={styles.userMessage}>
                  <div className={styles.userBubble}>{msg.content}</div>
                </div>
              ) : (
                <div className={styles.assistantMessage}>
                  <div className={styles.assistantAvatar} aria-hidden="true">⚡</div>
                  <div className={styles.assistantContent}>
                    <div
                      className={`${styles.assistantBubble} ${msg.refused ? styles.refusalBubble : ''}`}
                    >
                      {msg.content}
                      {msg.streaming && <span className={styles.streaming} />}
                    </div>

                    {/* Sources */}
                    {!msg.streaming && msg.sources && msg.sources.length > 0 && (
                      <SourcesDrawer sources={msg.sources} />
                    )}

                    {/* Follow-ups */}
                    {!msg.streaming && msg.followUps && msg.followUps.length > 0 && (
                      <div className={styles.followUps}>
                        {msg.followUps.map((q, j) => (
                          <button
                            key={j}
                            className={styles.followUpBtn}
                            onClick={() => handleFollowUp(q)}
                            title={q}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents..."
            rows={1}
            disabled={isStreaming}
            aria-label="Message input"
            id="chat-input"
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            aria-label="Send message"
            id="send-button"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

function SourcesDrawer({ sources }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.sourcesSection}>
      <button
        className={styles.sourcesToggle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="sources-list"
      >
        📎 {sources.length} source{sources.length !== 1 ? 's' : ''} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className={styles.sourcesList} id="sources-list" role="list">
          {sources.map((source, i) => (
            <div key={i} className={styles.sourceCard} role="listitem">
              <div className={styles.sourceHeader}>
                <span className={styles.sourceTitle}>
                  [{source.sourceId}] {source.originalFilename || source.title}
                </span>
                <div className={styles.sourceMeta}>
                  <span>Page {source.pageNumber || 'N/A'}</span>
                  <span className={styles.scoreBadge}>
                    {(source.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className={styles.sourceSnippet}>{source.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
