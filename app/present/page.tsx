'use client';

import { useEffect, useState } from 'react';
import { getPresentationKind } from '@/lib/shared-file-types';
import {
  JITSI_SCREEN_PRESENT_EVENT,
  getSharedVideoUrl,
} from '@/lib/jitsi-features';

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        elementId: string,
        config: Record<string, any>,
      ) => {
        destroyEditor?: () => void;
      };
    };
  }
}

const ONLYOFFICE_API =
  'https://docs.melanam.com/web-apps/apps/api/documents/api.js';

function loadOnlyOfficeApi(): Promise<void> {
  if (window.DocsAPI?.DocEditor) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(
      'onlyoffice-api-script',
    ) as HTMLScriptElement | null;

    const script = existing || document.createElement('script');

    const onLoad = () => {
      if (window.DocsAPI?.DocEditor) {
        resolve();
      } else {
        reject(new Error('The document editor API did not initialize.'));
      }
    };

    const onError = () => {
      reject(new Error('Could not load the document editor.'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existing) {
      script.id = 'onlyoffice-api-script';
      script.src = ONLYOFFICE_API;
      script.async = true;
      document.head.appendChild(script);
    } else if (window.DocsAPI?.DocEditor) {
      resolve();
    }
  });
}

export default function PresentPage() {
  const [file, setFile] = useState({
    path: '',
    name: '',
    meetingId: '',
    participantKey: '',
  });

  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [embedded, setEmbedded] = useState(false);
  const [renderMode, setRenderMode] = useState<
    'office' | 'fallback' | 'media' | 'image' | ''
  >('');

  const kind = getPresentationKind(file.name);
  const usesOnlyOffice =
    kind === 'office' || kind === 'slides' || kind === 'pdf';

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setEmbedded(query.get('embedded') === '1');

    setFile({
      path: query.get('path') || '',
      name: query.get('name') || '',
      meetingId: query.get('meetingId') || '',
      participantKey: query.get('participantKey') || '',
    });
  }, []);

  useEffect(() => {
    if (!file.path && !file.name && !file.meetingId) return;

    const controller = new AbortController();
    let editor: { destroyEditor?: () => void } | null = null;
    let objectUrl = '';

    const prepare = async () => {
      setLoading(true);
      setError('');
      setSource('');
      setRenderMode('');

      if (
        !file.path ||
        !file.meetingId ||
        !file.participantKey ||
        !getPresentationKind(file.name)
      ) {
        setError('This file cannot be presented.');
        setLoading(false);
        return;
      }

      try {
        const documentAccessToken = localStorage.getItem(
          `melanam:meeting-document-access:${file.meetingId}:${file.participantKey}`,
        );

        if (!documentAccessToken) {
          throw new Error('Your meeting document access has expired. Return to the meeting and try again.');
        }

        if (usesOnlyOffice) {
          try {
            const response = await fetch(
              `/api/onlyoffice/config?path=${encodeURIComponent(file.path)}&meetingId=${encodeURIComponent(file.meetingId)}`,
              {
                headers: { Authorization: `Bearer ${documentAccessToken}` },
                signal: controller.signal,
                cache: 'no-store',
              },
            );

            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
              throw new Error(
                body.error || 'Could not prepare this document.',
              );
            }

            await loadOnlyOfficeApi();

            if (controller.signal.aborted) return;

            const mount = document.getElementById('onlyoffice-editor');

            if (!mount || !window.DocsAPI?.DocEditor) {
              throw new Error('The document editor could not be initialized.');
            }

            editor = new window.DocsAPI.DocEditor(
              'onlyoffice-editor',
              body.config,
            );

            setRenderMode('office');
            setLoading(false);
            return;
          } catch (officeError: any) {
            if (controller.signal.aborted) return;

            // Preserve the existing PowerPoint-to-PDF fallback.
            if (kind !== 'slides') throw officeError;

            const response = await fetch(
              `/api/files/presentation?path=${encodeURIComponent(file.path)}&meetingId=${encodeURIComponent(file.meetingId)}`,
              {
                headers: { Authorization: `Bearer ${documentAccessToken}` },
                signal: controller.signal,
                cache: 'no-store',
              },
            );

            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              throw new Error(
                body.error || officeError.message ||
                'The presentation could not be opened.',
              );
            }

            const blob = await response.blob();

            if (controller.signal.aborted) return;

            objectUrl = URL.createObjectURL(blob);
            setSource(objectUrl);
            setRenderMode('fallback');
            setNotice(
              'Opened using the presentation compatibility viewer.',
            );
            setLoading(false);
            return;
          }
        }

        if (kind === 'image') {
          setSource(getSharedVideoUrl(file.path, window.location.origin));
          setRenderMode('image');
        } else if (kind === 'media') {
          setSource(getSharedVideoUrl(file.path, window.location.origin));
          setRenderMode('media');
        } else {
          throw new Error('This file type is not supported.');
        }

        setLoading(false);
      } catch (prepareError: any) {
        if (!controller.signal.aborted) {
          setError(
            prepareError?.message || 'The file could not be opened.',
          );
          setLoading(false);
        }
      }
    };

    void prepare();

    return () => {
      controller.abort();

      try {
        editor?.destroyEditor?.();
      } catch {
        // The editor may already have been destroyed.
      }

      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    file.path,
    file.name,
    file.meetingId,
    kind,
    usesOnlyOffice,
  ]);

  const share = () => {
    try {
      if (!window.opener || window.opener.closed) throw new Error();

      const event = new CustomEvent(JITSI_SCREEN_PRESENT_EVENT, {
        cancelable: true,
        detail: { meetingId: file.meetingId },
      });

      window.opener.dispatchEvent(event);

      setNotice(
        event.defaultPrevented
          ? 'Select this presentation tab or window in the browser sharing picker.'
          : 'Join the meeting before presenting.',
      );
    } catch {
      setNotice(
        'Keep the meeting tab open. You can also use Share screen in the meeting and select this tab.',
      );
    }
  };

  return (
    <main className="fixed inset-0 flex flex-col bg-zinc-950 text-white">
      {!embedded && <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-3">
        <h1 className="min-w-0 truncate text-sm font-medium">
          {file.name || 'Presentation'}
        </h1>

        <button
          type="button"
          disabled={loading || !!error}
          onClick={share}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50"
        >
          Share in meeting
        </button>

        {notice && (
          <p role="status" className="basis-full text-sm text-amber-300">
            {notice}
          </p>
        )}
      </header>}

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {usesOnlyOffice && (
          <div
            id="onlyoffice-editor"
            className="absolute inset-0 h-full w-full"
          />
        )}

        {loading && (
          <p role="status" className="absolute z-10 rounded-lg bg-zinc-900 p-4">
            Preparing document...
          </p>
        )}

        {!loading && error && (
          <p role="alert" className="z-10 max-w-xl p-6 text-center text-amber-300">
            {error}
          </p>
        )}

        {!loading && !error && renderMode === 'image' && (
          // Shared file URLs are served by the app rather than the image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={source}
            alt={file.name}
            className="h-full w-full object-contain"
            onError={() => setError('This image could not be opened.')}
          />
        )}

        {!loading &&
          !error &&
          (renderMode === 'media' || renderMode === 'fallback') && (
            <iframe
              title={file.name}
              src={source}
              className="h-full w-full border-0 bg-white"
            />
          )}
      </div>
    </main>
  );
}
