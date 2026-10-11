'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from './Loader';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';

const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then((module) => module.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-100">
        <Loader />
      </div>
    ),
  }
);

type WhiteboardScene = {
  meetingId: string;
  updatedAt?: string | Date;
} & ExcalidrawInitialDataState;

interface WhiteboardProps {
  meetingId: string;
  onClose: () => void;
  closeRequestId?: number;
}

export function Whiteboard({ meetingId, onClose, closeRequestId = 0 }: WhiteboardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [status, setStatus] = useState('Loading whiteboard...');
  const [scene, setScene] = useState<WhiteboardScene | null>(null);

  const elementsRef = useRef<ExcalidrawInitialDataState['elements']>([]);
  const appStateRef = useRef<ExcalidrawInitialDataState['appState']>({});
  const filesRef = useRef<ExcalidrawInitialDataState['files']>({});
  const lastSavedSnapshotRef = useRef('');
  const lastRemoteVersionRef = useRef('');
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const excalidrawApiRef = useRef<any>(null);
  const closeInFlightRef = useRef(false);
  // A close request can have been handled by a previous Whiteboard instance.
  // Treat the ID supplied at mount as already handled so reopening the board
  // does not immediately process that stale request and close itself.
  const handledCloseRequestRef = useRef(closeRequestId);

  const sanitizeAppState = (appState: ExcalidrawInitialDataState['appState']) => {
    const { collaborators, ...rest } = (appState || {}) as Record<string, unknown>;
    return rest;
  };

  const syncSceneFromApi = () => {
    const api = excalidrawApiRef.current;

    if (!api) {
      console.warn('[whiteboard] ⚠️ syncSceneFromApi: No API available');
      return;
    }

    const newElements = api.getSceneElements?.();
    const newAppState = api.getAppState?.();
    const newFiles = api.getFiles?.();
    
    // CRITICAL: Only update refs if we got valid data from API
    // This prevents overwriting saved elements with empty arrays from failed API calls
    const hasValidElements = Array.isArray(newElements) && newElements.length > 0;
    const hasValidAppState = newAppState && typeof newAppState === 'object';
    
    console.log('[whiteboard] 🔄 syncSceneFromApi:', {
      elementsFromAPI: newElements?.length || 0,
      appStateFromAPI: Object.keys(newAppState || {}).length,
      filesFromAPI: Object.keys(newFiles || {}).length,
      hadValidData: hasValidElements || hasValidAppState,
    });

    // Only update if we have valid data - don't overwrite good cached data with empty results
    if (hasValidElements) {
      elementsRef.current = newElements;
    }
    if (hasValidAppState) {
      appStateRef.current = newAppState;
    }
    if (newFiles) {
      filesRef.current = newFiles;
    }
  };

  const serializeSnapshot = () => {
    syncSceneFromApi();

    const snapshot = JSON.stringify({
      meetingId,
      elements: elementsRef.current,
      appState: sanitizeAppState(appStateRef.current),
      files: filesRef.current || {},
    });
    
    console.log('[whiteboard] 📸 SNAPSHOT created:', {
      elementsCount: elementsRef.current?.length || 0,
      appStateKeys: Object.keys(appStateRef.current || {}).length,
      filesCount: Object.keys(filesRef.current || {}).length,
      snapshotSize: snapshot.length,
    });

    return snapshot;
  };

  const schedulePersistScene = () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void persistScene();
    }, 500);
  };

  const persistSceneOnExit = () => {
    if (!meetingId) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const snapshot = serializeSnapshot();

    // Don't save empty snapshot - protect against clearing previously saved data
    // This can happen when the component is unmounting and API is no longer available
    const snapshotObj = JSON.parse(snapshot);
    if (!snapshotObj.elements || snapshotObj.elements.length === 0) {
      console.log('[whiteboard] ⏭️ Skipping exit save - no elements to persist. Protecting existing data.');
      return;
    }

    if (snapshot === lastSavedSnapshotRef.current) {
      console.log('[whiteboard] ⏭️ Exit save skipped - no changes since last save');
      return;
    }

    // Use fetch with keepalive instead of sendBeacon for better JSON handling
    void fetch('/api/whiteboards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: snapshot,
      keepalive: true,
    })
      .then((response) => {
        if (response.ok) {
          lastSavedSnapshotRef.current = snapshot;
          console.log('[whiteboard] exit save succeeded');
          return;
        }
        return response.json().then(body => {
          console.error('[whiteboard] exit save failed:', body?.error || 'Unknown error');
        }).catch(() => {
          console.error('[whiteboard] exit save failed: invalid response');
        });
      })
      .catch((err) => {
        console.error('[whiteboard] exit save failed:', err?.message || String(err));
      });
  };

  const whiteboardUrl = useMemo(
    () => `/api/whiteboards?meetingId=${encodeURIComponent(meetingId)}`,
    [meetingId]
  );

  useEffect(() => {
    let active = true;

    const loadScene = async () => {
      try {
        setIsLoaded(false);
        setError('');
        setStatus('Loading whiteboard...');

        console.log('[whiteboard] 🔄 LOAD START - meetingId:', meetingId, 'url:', whiteboardUrl);
        const response = await fetch(whiteboardUrl, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));

        console.log('[whiteboard] 📡 RESPONSE STATUS:', response.status, 'body keys:', Object.keys(body));

        if (!active) {
          return;
        }

        if (!response.ok) {
          const errMsg = body?.error || 'Failed to load whiteboard';
          console.error('[whiteboard] load error:', errMsg);
          throw new Error(errMsg);
        }

        const loadedScene = body?.whiteboard || null;
        console.log('[whiteboard] 📦 LOADED SCENE:', {
          exists: !!loadedScene,
          elementsCount: loadedScene?.elements?.length || 0,
          appStateKeys: Object.keys(loadedScene?.appState || {}).length,
          filesKeys: Object.keys(loadedScene?.files || {}).length,
          updatedAt: loadedScene?.updatedAt,
        });
        const nextScene: WhiteboardScene = loadedScene
          ? {
              meetingId: String(loadedScene.meetingId || meetingId),
              elements: (loadedScene.elements || []) as ExcalidrawInitialDataState['elements'],
              appState: {
                collaborators: [],
                ...(loadedScene.appState || {}),
              },
              files: loadedScene.files || {},
            }
          : {
              meetingId,
              elements: [],
              appState: {
                collaborators: [],
              },
              files: {},
            };

        elementsRef.current = nextScene.elements;
        appStateRef.current = nextScene.appState;
        filesRef.current = nextScene.files || {};
        lastRemoteVersionRef.current = String(loadedScene?.updatedAt || '');
        lastSavedSnapshotRef.current = serializeSnapshot();
        setScene(nextScene);
        setStatus(loadedScene ? 'Loaded saved whiteboard' : 'New whiteboard ready');
        setIsLoaded(true);
      } catch (loadError: any) {
        if (!active) {
          return;
        }

        const msg = loadError?.message || 'Unable to load whiteboard';
        console.error('[whiteboard] load exception:', msg, loadError?.stack);
        setError(msg);
        setStatus('Unable to load whiteboard');
        setIsLoaded(true);
      }
    };

    loadScene();

    return () => {
      active = false;
    };
  }, [meetingId, whiteboardUrl]);

  const persistScene = async (flushQueued = false): Promise<void> => {
    if (!meetingId) {
      return;
    }

    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      await savePromiseRef.current;

      if (flushQueued) {
        await persistScene(true);
      }

      return;
    }

    const snapshot = serializeSnapshot();

    if (snapshot === lastSavedSnapshotRef.current) {
      setStatus('Saved');
      return;
    }

    console.log('[whiteboard] 💾 PERSIST START - snapshot size:', snapshot.length, 'bytes');

    saveInFlightRef.current = true;
    setIsSaving(true);
    setStatus('Saving...');

    const savePromise = (async () => {
      try {
        console.log('[whiteboard] 📤 FETCH request to /api/whiteboards (PUT)');
        const response = await fetch('/api/whiteboards', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: snapshot,
        });

        let body: any = {};
        try {
          body = await response.json();
        } catch (parseErr) {
          console.error('[whiteboard] response parse error:', parseErr);
          throw new Error('Invalid server response');
        }

        if (!response.ok) {
          const errorMsg = body?.error || 'Failed to save whiteboard';
          console.error('[whiteboard] save error response:', errorMsg);
          throw new Error(errorMsg);
        }

        console.log('[whiteboard] ✅ save succeeded, updatedAt:', body?.updatedAt, 'elementCount:', body?.elementCount);
        lastSavedSnapshotRef.current = snapshot;
        lastRemoteVersionRef.current = String(body?.updatedAt || Date.now());
        setStatus('Saved');
      } catch (error: any) {
        console.error('[whiteboard] persist error:', error?.message || String(error));
        throw error;
      }
    })();

    savePromiseRef.current = savePromise;

    try {
      await savePromise;
    } catch (saveError: any) {
      const msg = saveError?.message || 'Autosave failed';
      console.error('[whiteboard] final error:', msg);
      setStatus(msg);
    } finally {
      saveInFlightRef.current = false;
      savePromiseRef.current = null;
      setIsSaving(false);

      if (saveQueuedRef.current) {
        saveQueuedRef.current = false;
        await persistScene(flushQueued);
      }
    }
  };

  const handleClose = async () => {
    if (closeInFlightRef.current) {
      return;
    }

    closeInFlightRef.current = true;
    setIsClosing(true);
    setStatus('Saving before close...');
    syncSceneFromApi();

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    await persistScene(true);
    onClose();
  };

  useEffect(() => {
    if (!closeRequestId || closeRequestId === handledCloseRequestRef.current) {
      return;
    }

    handledCloseRequestRef.current = closeRequestId;
    void handleClose();
  }, [closeRequestId]);

  useEffect(() => {
    if (!isLoaded || error) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void persistScene();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
      void persistScene(true);
    };
  }, [error, isLoaded]);

  useEffect(() => {
    const flushPendingScene = () => {
      persistSceneOnExit();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingScene();
      }
    };

    window.addEventListener('beforeunload', flushPendingScene);
    window.addEventListener('pagehide', flushPendingScene);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushPendingScene);
      window.removeEventListener('pagehide', flushPendingScene);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      persistSceneOnExit();
    };
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center bg-zinc-950 text-zinc-100">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center bg-zinc-950 px-6 text-center text-zinc-100">
        <div className="max-w-md space-y-3">
          <p className="text-lg font-semibold text-white">Whiteboard unavailable</p>
          <p className="text-sm text-zinc-300">{error}</p>
          <button
            onClick={onClose}
            className="rounded-full border border-white/15 bg-zinc-900/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-900/15"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const initialData = scene
    ? {
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files || {},
      }
    : undefined;

  return (
    <CollaborativeWhiteboard
      meetingId={meetingId}
      onClose={handleClose}
      scene={scene}
      initialData={initialData}
      status={status}
      isSaving={isSaving}
      isClosing={isClosing}
      whiteboardUrl={whiteboardUrl}
      lastRemoteVersionRef={lastRemoteVersionRef}
      setStatus={setStatus}
      onRemoteSceneApplied={(snapshot, updatedAt) => {
        lastSavedSnapshotRef.current = snapshot;
        lastRemoteVersionRef.current = updatedAt;
      }}
      schedulePersistScene={schedulePersistScene}
      onSceneChange={(elements, appState, files) => {
        elementsRef.current = elements;
        appStateRef.current = appState;
        filesRef.current = files || {};
      }}
      onApiReady={(api) => {
        excalidrawApiRef.current = api;
      }}
    />
  );
}

function CollaborativeWhiteboard({
  meetingId,
  onClose,
  scene,
  initialData,
  status,
  isSaving,
  isClosing,
  whiteboardUrl,
  lastRemoteVersionRef,
  setStatus,
  onRemoteSceneApplied,
  schedulePersistScene,
  onSceneChange,
  onApiReady,
}: {
  meetingId: string;
  onClose: () => void;
  scene: WhiteboardScene | null;
  initialData: ExcalidrawInitialDataState | null | undefined;
  status: string;
  isSaving: boolean;
  isClosing: boolean;
  whiteboardUrl: string;
  lastRemoteVersionRef: React.MutableRefObject<string>;
  setStatus: (value: string) => void;
  onRemoteSceneApplied: (snapshot: string, updatedAt: string) => void;
  schedulePersistScene: () => void;
  onSceneChange: (
    elements: ExcalidrawInitialDataState['elements'],
    appState: ExcalidrawInitialDataState['appState'],
    files: ExcalidrawInitialDataState['files']
  ) => void;
  onApiReady: (api: any) => void;
}) {
  const appliedRemoteSnapshotRef = useRef('');
  const lastLocalChangeAtRef = useRef(0);
  const isApplyingRemoteRef = useRef(false);
  const excalidrawApiRef = useRef<any>(null);

  useEffect(() => {
    if (!scene) {
      return;
    }

    appliedRemoteSnapshotRef.current = JSON.stringify(scene);
  }, [scene]);

  useEffect(() => {
    let active = true;

    const applyRemoteScene = async () => {
      if (Date.now() - lastLocalChangeAtRef.current < 1200) {
        return;
      }

      try {
        const response = await fetch(whiteboardUrl, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));

        if (!active || !response.ok) {
          return;
        }

        const nextScene = body?.whiteboard as WhiteboardScene | null;
        const nextRemoteVersion = String(nextScene?.updatedAt || '');

        if (!nextScene || !nextRemoteVersion || nextRemoteVersion === lastRemoteVersionRef.current) {
          return;
        }

        const persistedSnapshot = JSON.stringify({
          meetingId,
          elements: nextScene.elements || [],
          appState: nextScene.appState || {},
          files: nextScene.files || {},
        });

        if (persistedSnapshot === appliedRemoteSnapshotRef.current) {
          lastRemoteVersionRef.current = nextRemoteVersion;
          return;
        }

        lastRemoteVersionRef.current = nextRemoteVersion;
        appliedRemoteSnapshotRef.current = persistedSnapshot;
        isApplyingRemoteRef.current = true;
        excalidrawApiRef.current?.updateScene({
          elements: nextScene.elements || [],
          appState: {
            collaborators: [],
            ...(nextScene.appState || {}),
          },
          files: nextScene.files || {},
        });
        onSceneChange(nextScene.elements || [], nextScene.appState || {}, nextScene.files || {});
        onRemoteSceneApplied(persistedSnapshot, nextRemoteVersion);
        setStatus('Live update received');
        window.setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 150);
      } catch (err) {
        console.warn('[whiteboard] realtime sync failed:', err);
      }
    };

    const intervalId = window.setInterval(() => {
      void applyRemoteScene();
    }, 900);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [lastRemoteVersionRef, meetingId, onRemoteSceneApplied, onSceneChange, setStatus, whiteboardUrl]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-white">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.24em] text-zinc-400">Whiteboard session</div>
          <div className="truncate text-sm font-medium text-white">{meetingId}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-zinc-900/5 px-3 py-1 text-xs text-zinc-200">
            Shared realtime
          </span>
          <span className="rounded-full border border-white/10 bg-zinc-900/5 px-3 py-1 text-xs text-zinc-200">
            {isClosing ? 'Saving before close' : isSaving ? 'Saving' : status}
          </span>
          <button
            onClick={onClose}
            disabled={isClosing}
            className="rounded-full border border-white/15 bg-zinc-900/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-900/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-zinc-900">
        <Excalidraw
          key={meetingId}
          name={meetingId}
          theme={'light'}
          initialData={initialData}
          autoFocus
          handleKeyboardGlobally={false}
          detectScroll={false}
          excalidrawAPI={(api) => {
            excalidrawApiRef.current = api;
            onApiReady(api);
          }}
          onChange={(elements, appState, files) => {
            onSceneChange(elements, appState, files);

            if (!isApplyingRemoteRef.current) {
              lastLocalChangeAtRef.current = Date.now();
              setStatus('Unsaved changes');
              schedulePersistScene();
            }
          }}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: true,
              clearCanvas: true,
              export: { saveFileToDisk: true },
              loadScene: true,
              saveAsImage: true,
              saveToActiveFile: true,
              toggleTheme: true,
            },
            tools: {
              image: true,
            },
          }}
        />
      </div>
    </div>
  );
}

export default Whiteboard;
