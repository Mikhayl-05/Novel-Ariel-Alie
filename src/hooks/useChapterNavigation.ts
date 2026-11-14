import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  allChapters,
  getChapterById,
  getChapterIndexById,
} from '../data/chapters';
import { audioManager } from '../services/audioManager';
import { saveCurrentChapterProgress } from '../services/storageService';
import type { Chapter, ChapterId } from '../types/novel';
import { ChapterHtmlCache } from '../utils/chapterCache';
import { vibrate } from '../utils/haptics';

export type ChapterTransitionPhase = 'idle' | 'fade-out' | 'fade-in';

interface UseChapterNavigationParams {
  initialChapterId: ChapterId;
  storyOpened: boolean;
  focusMode: boolean;
  onCloseModals: () => void;
}

export function useChapterNavigation({
  initialChapterId,
  storyOpened,
  focusMode,
  onCloseModals,
}: UseChapterNavigationParams) {
  const { chapterId: routeChapterId } = useParams<{ chapterId?: string }>();
  const navigate = useNavigate();

  const resolvedInitialId = useMemo(() => {
    if (routeChapterId && getChapterById(routeChapterId)) {
      return routeChapterId;
    }
    return getChapterById(initialChapterId)
      ? initialChapterId
      : allChapters[0].id;
  }, [initialChapterId, routeChapterId]);

  const [activeChapterId, setActiveChapterId] =
    useState<ChapterId>(resolvedInitialId);
  const [displayedChapterId, setDisplayedChapterId] =
    useState<ChapterId>(resolvedInitialId);
  const [transitionPhase, setTransitionPhase] =
    useState<ChapterTransitionPhase>('idle');
  const [subtitleTransitioning, setSubtitleTransitioning] = useState(false);
  const [endingCinematicOpen, setEndingCinematicOpen] = useState(false);

  const chapterCacheRef = useRef<ChapterHtmlCache>(new ChapterHtmlCache());
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEndingCallbackRef = useRef<(() => void) | null>(null);
  const activeChapterIdRef = useRef<ChapterId>(activeChapterId);
  activeChapterIdRef.current = activeChapterId;

  const activeChapter: Chapter = useMemo(
    () => getChapterById(activeChapterId) ?? allChapters[0],
    [activeChapterId],
  );

  const displayedChapter: Chapter = useMemo(
    () => getChapterById(displayedChapterId) ?? allChapters[0],
    [displayedChapterId],
  );

  const activeIndex = useMemo(
    () => Math.max(0, getChapterIndexById(activeChapter.id)),
    [activeChapter.id],
  );

  const displayedIndex = useMemo(
    () => Math.max(0, getChapterIndexById(displayedChapter.id)),
    [displayedChapter.id],
  );

  const displayedChapterHtml = useMemo(
    () => chapterCacheRef.current.get(displayedChapter),
    [displayedChapter],
  );

  const preloadAdjacent = useCallback((idx: number) => {
    const cache = chapterCacheRef.current;
    const keepIds: ChapterId[] = [];
    for (const nIdx of [idx - 1, idx, idx + 1]) {
      if (nIdx >= 0 && nIdx < allChapters.length) {
        keepIds.push(allChapters[nIdx].id);
      }
    }
    cache.prune(keepIds);

    for (const nIdx of [idx - 1, idx + 1]) {
      if (nIdx < 0 || nIdx >= allChapters.length) continue;
      const neighbor = allChapters[nIdx];
      if (cache.has(neighbor.id)) continue;
      const doPreload = () => cache.preload(neighbor);
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(doPreload, { timeout: 1500 });
      } else {
        setTimeout(doPreload, 400);
      }
    }
  }, []);

  // Preload neighbors & save initial progress on mount
  useEffect(() => {
    saveCurrentChapterProgress(displayedChapter.id);
    preloadAdjacent(displayedIndex);
  }, [displayedChapter.id, displayedIndex, preloadAdjacent]);

  const executeChapterTransition = useCallback(
    (targetChapter: Chapter, onComplete?: () => void) => {
      if (fadeOutTimerRef.current !== null) {
        clearTimeout(fadeOutTimerRef.current);
      }
      if (fadeInTimerRef.current !== null) {
        clearTimeout(fadeInTimerRef.current);
      }

      if (storyOpened) {
        const targetAudio = targetChapter.bgm || 'default';
        if (targetAudio !== audioManager.getCurrentKey()) {
          audioManager.play(targetAudio);
        }
      }

      setTransitionPhase('fade-out');
      setSubtitleTransitioning(true);

      fadeOutTimerRef.current = setTimeout(() => {
        setDisplayedChapterId(targetChapter.id);
        setSubtitleTransitioning(false);
        setTransitionPhase('fade-in');

        fadeInTimerRef.current = setTimeout(() => {
          setTransitionPhase('idle');
        }, 600);

        if (typeof onComplete === 'function') {
          onComplete();
        }
      }, 250);
    },
    [storyOpened],
  );

  const goToChapter = useCallback(
    (targetId: ChapterId, onComplete?: () => void) => {
      const targetChapter = getChapterById(targetId);
      if (!targetChapter) return;

      setActiveChapterId(targetChapter.id);
      if (routeChapterId !== targetChapter.id) {
        navigate(`/chapter/${targetChapter.id}`);
      }

      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      if (targetChapter.isEnding && storyOpened) {
        pendingEndingCallbackRef.current = () => {
          executeChapterTransition(targetChapter, onComplete);
        };
        setEndingCinematicOpen(true);
        return;
      }

      executeChapterTransition(targetChapter, onComplete);
    },
    [executeChapterTransition, navigate, routeChapterId, storyOpened],
  );

  const completeEndingCinematic = useCallback(() => {
    setEndingCinematicOpen(false);
    const cb = pendingEndingCallbackRef.current;
    pendingEndingCallbackRef.current = null;
    if (cb) cb();
  }, []);

  const goToIndex = useCallback(
    (idx: number, onComplete?: () => void) => {
      if (idx < 0 || idx >= allChapters.length) return;
      goToChapter(allChapters[idx].id, onComplete);
    },
    [goToChapter],
  );

  const changeChapter = useCallback(
    (direction: -1 | 1) => {
      const currentIdx = getChapterIndexById(activeChapterIdRef.current);
      const targetIdx = currentIdx + direction;
      if (targetIdx >= 0 && targetIdx < allChapters.length) {
        goToIndex(targetIdx);
        vibrate(10);
      }
    },
    [goToIndex],
  );

  // Sync browser back/forward route changes
  useEffect(() => {
    if (
      routeChapterId &&
      routeChapterId !== activeChapterIdRef.current &&
      getChapterById(routeChapterId)
    ) {
      const targetChapter = getChapterById(routeChapterId)!;
      setActiveChapterId(targetChapter.id);
      executeChapterTransition(targetChapter);
    }
  }, [routeChapterId, executeChapterTransition]);

  // Keyboard navigation (ArrowLeft / ArrowRight / Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        onCloseModals();
        return;
      }

      if (isEditable) return;
      if (e.key === 'ArrowLeft') changeChapter(-1);
      if (e.key === 'ArrowRight') changeChapter(1);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [changeChapter, onCloseModals]);

  // Swipe navigation (only active when Focus Mode is ON and touch starts inside <main>)
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let swipeTrackingActive = false;

    const handleTouchStart = (e: TouchEvent) => {
      swipeTrackingActive = false;
      touchStartX = 0;
      touchStartY = 0;
      if (!focusMode) return;
      if (!e.changedTouches || !e.changedTouches[0]) return;
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest || !target.closest('main')) return;
      swipeTrackingActive = true;
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!swipeTrackingActive || !focusMode) {
        swipeTrackingActive = false;
        return;
      }
      if (!e.changedTouches || !e.changedTouches[0]) {
        swipeTrackingActive = false;
        return;
      }
      swipeTrackingActive = false;
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const threshold = 80;
      const swipeLength = touchEndX - touchStartX;
      const verticalDrift = Math.abs(touchEndY - touchStartY);
      if (Math.abs(swipeLength) > threshold && verticalDrift < 60) {
        changeChapter(swipeLength < 0 ? 1 : -1);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [focusMode, changeChapter]);

  useEffect(() => {
    return () => {
      if (fadeOutTimerRef.current !== null) clearTimeout(fadeOutTimerRef.current);
      if (fadeInTimerRef.current !== null) clearTimeout(fadeInTimerRef.current);
    };
  }, []);

  return {
    activeChapter,
    activeIndex,
    displayedChapter,
    displayedIndex,
    displayedChapterHtml,
    totalChapters: allChapters.length,
    transitionPhase,
    subtitleTransitioning,
    endingCinematicOpen,
    completeEndingCinematic,
    goToChapter,
    goToIndex,
    changeChapter,
  };
}
