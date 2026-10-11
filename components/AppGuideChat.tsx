'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, MessageCircle, Send, X } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; text: string };

const suggestions = ['How do I start a meeting?', 'Where are my recordings?'];

export function AppGuideChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const question = (suggested ?? input).trim();
    if (!question || loading) return;
    const next = [...messages, { role: 'user' as const, text: question }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const response = await fetch('/api/guide-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-10).map(({ role, text }) => ({ role, content: text })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'I couldn’t get an answer just now. Please try again.');
      setMessages(current => [...current, { role: 'assistant', text: data.answer }]);
    } catch (error) {
      setMessages(current => [...current, { role: 'assistant', text: error instanceof Error ? error.message : 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-guide-chat">
      {open && <section className="app-guide-chat__panel" aria-label="Melanam app guide" aria-live="polite">
        <header className="app-guide-chat__header">
          <span className="app-guide-chat__avatar"><Bot size={18} /></span>
          <div><strong>Melanam Guide</strong><small>Quick help for using the app</small></div>
          <button className="app-guide-chat__icon" onClick={() => setOpen(false)} aria-label="Close guide"><X size={18} /></button>
        </header>
        <div className="app-guide-chat__messages">
          {!messages.length && <div className="app-guide-chat__welcome">
            <p>Hi! I can guide you through meetings, recordings, notes, and courses.</p>
            <div className="app-guide-chat__suggestions">{suggestions.map(item => <button key={item} onClick={() => void sendMessage(undefined, item)}>{item}</button>)}</div>
          </div>}
          {messages.map((message, index) => <p key={index} className={`app-guide-chat__message app-guide-chat__message--${message.role}`}>{message.text}</p>)}
          {loading && <p className="app-guide-chat__message app-guide-chat__message--assistant app-guide-chat__thinking"><LoaderCircle size={14} /> Thinking…</p>}
          <div ref={endRef} />
        </div>
        <form className="app-guide-chat__form" onSubmit={event => void sendMessage(event)}>
          <input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask how to do something…" aria-label="Ask the Melanam Guide" maxLength={1000} />
          <button type="submit" aria-label="Send message" disabled={!input.trim() || loading}><Send size={17} /></button>
        </form>
      </section>}
      <button className="app-guide-chat__toggle" onClick={() => setOpen(value => !value)} aria-label={open ? 'Close Melanam Guide' : 'Open Melanam Guide'} aria-expanded={open}>
        {open ? <X size={21} /> : <><MessageCircle size={20} /><span>Need help?</span></>}
      </button>
    </div>
  );
}
