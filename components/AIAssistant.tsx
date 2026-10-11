'use client';

import { useEffect, useRef, useState } from 'react';
import { IconBrain, IconX, IconLoader2 } from '@tabler/icons-react';
import { motion } from 'motion/react';
import { resolveMeetingAiHttpUrl } from '@/lib/meeting-ai-client';

interface AIAssistantProps {
  meetingId: string;
  onAIToggle?: (enabled: boolean) => void;
}

interface Language {
  code: string;
  name: string;
}

interface Caption {
  text: string;
  speaker: string;
  timestamp: number;
}

export function AIAssistant({ meetingId, onAIToggle }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [isLoading, setIsLoading] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch supported languages on mount
  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await fetch('/api/ai/languages');
        if (response.ok) {
          const data = await response.json();
          setLanguages(data.languages);
        }
      } catch (error) {
        console.error('Failed to load languages:', error);
      }
    };

    fetchLanguages();
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleAI = async () => {
    if (aiEnabled) {
      // Disable AI
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/ai/init?meetingId=${encodeURIComponent(meetingId)}`,
          { method: 'DELETE' }
        );
        if (response.ok) {
          // Ask caption backend to flush any pending summarization for this meeting
          try {
            if (typeof window !== 'undefined') {
              const flushUrl = `${resolveMeetingAiHttpUrl()}/api/rooms/${encodeURIComponent(meetingId)}/flush`;
              await fetch(flushUrl, { method: 'POST' }).catch(() => {});
            }
          } catch (err) {
            // ignore flush errors; summarizer will run on timer as fallback
            console.warn('[AI] flush request failed', err);
          }

          setAiEnabled(false);
          setStatus('idle');
          setCaptions([]);
          onAIToggle?.(false);
        }
      } catch (error) {
        console.error('Failed to disable AI:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Enable AI
      try {
        setIsLoading(true);
        const response = await fetch('/api/ai/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId,
            language: selectedLanguage,
          }),
        });

        if (response.ok) {
          setAiEnabled(true);
          setStatus('recording');
          onAIToggle?.(true);
        } else {
          const error = await response.json();
          console.error('Failed to enable AI:', error.error);
        }
      } catch (error) {
        console.error('Failed to enable AI:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setSelectedLanguage(newLanguage);
    // In a real implementation, this would trigger re-transcription or translation
  };

  return (
    <div className="relative">
      {/* AI Assistant Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
          aiEnabled
            ? 'border-zinc-600 bg-zinc-800/85 text-zinc-300 shadow-xl dark:border-zinc-600/40 dark:bg-zinc-700/20 dark:text-zinc-300'
            : 'border-zinc-800 bg-zinc-800/80 text-zinc-100 shadow-xl hover:-translate-y-0.5 hover:border-zinc-800 hover:bg-zinc-800/80 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-700'
        }`}
        aria-label="AI assistant"
        title="AI Assistant"
      >
        <IconBrain size={20} />
        {status === 'recording' && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </motion.button>

      {/* AI Assistant Panel */}
      {isOpen && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="absolute right-0 top-12 w-96 bg-zinc-900 dark:bg-zinc-900 rounded-lg shadow-xl border border-zinc-800 dark:border-zinc-600 z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconBrain size={20} />
              <h3 className="font-semibold">AI Assistant</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-zinc-700 p-1 rounded transition"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-100 dark:text-zinc-300">
                Status
              </span>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <>
                    <IconLoader2 size={16} className="animate-spin text-zinc-300" />
                    <span className="text-xs text-zinc-400 dark:text-zinc-400">
                      Updating...
                    </span>
                  </>
                ) : (
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      aiEnabled
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-zinc-800 text-zinc-100 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {aiEnabled ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>
            </div>

            {/* Toggle AI */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-100 dark:text-zinc-300">
                Enable AI Assistant
              </span>
              <button
                onClick={toggleAI}
                disabled={isLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  aiEnabled ? 'bg-zinc-700' : 'bg-zinc-800 dark:bg-zinc-700'
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-zinc-900 transition-transform ${
                    aiEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Language Selection */}
            <div>
              <label className="text-sm font-medium text-zinc-100 dark:text-zinc-300 block mb-2">
                Transcription Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                disabled={aiEnabled || isLoading}
                className="w-full px-3 py-2 border border-zinc-800 dark:border-zinc-600 rounded-lg bg-zinc-900 dark:bg-zinc-800 text-zinc-100 dark:text-zinc-100 text-sm disabled:opacity-50"
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-400 dark:text-zinc-400 mt-1">
                {aiEnabled
                  ? 'Cannot change language while recording'
                  : 'Select language before enabling AI'}
              </p>
            </div>

            {/* Live Captions */}
            {aiEnabled && (
              <div>
                <label className="text-sm font-medium text-zinc-100 dark:text-zinc-300 block mb-2">
                  Live Captions
                </label>
                <div className="max-h-32 overflow-y-auto bg-zinc-900 dark:bg-zinc-800 rounded-lg p-3 border border-zinc-800 dark:border-zinc-600">
                  {captions.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">
                      Captions will appear here...
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {captions.slice(-5).map((caption, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-semibold text-zinc-300 dark:text-zinc-300">
                            {caption.speaker}
                          </span>
                          <p className="text-zinc-100 dark:text-zinc-300 mt-1">
                            {caption.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="bg-zinc-800 dark:bg-zinc-700/20 border border-zinc-600 dark:border-zinc-600 rounded-lg p-3">
              <p className="text-xs text-zinc-100 dark:text-zinc-300">
                <span className="font-semibold">
                  {aiEnabled
                    ? 'Recording with AI Assistant'
                    : 'Enable AI to start real-time captions and post-meeting summary'}
                </span>
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default AIAssistant;
