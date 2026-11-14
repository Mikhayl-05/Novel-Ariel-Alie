import { useEffect, useRef } from 'react';
import type { ChapterTransitionPhase } from '../hooks/useChapterNavigation';
import type { Chapter } from '../types/novel';
import { findFirstMatchingParagraph } from '../utils/searchEngine';

interface ChapterReaderProps {
  chapter: Chapter;
  chapterHtml: string;
  fontScale: number;
  transitionPhase: ChapterTransitionPhase;
  subtitleTransitioning: boolean;
  focusMode: boolean;
  pendingHighlightQuery: string | null;
  onHighlightConsumed: () => void;
  onBrandClick: () => void;
  onToggleFocusUi: () => void;
}

export function ChapterReader({
  chapter,
  chapterHtml,
  fontScale,
  transitionPhase,
  subtitleTransitioning,
  focusMode,
  pendingHighlightQuery,
  onHighlightConsumed,
  onBrandClick,
  onToggleFocusUi,
}: ChapterReaderProps) {
  const articleRef = useRef<HTMLElement | null>(null);

  const isPrologue = !!chapter.isPrologue;
  const metaThemeClass = isPrologue ? 'theme-prologue' : 'theme-main';
  const subtitleText = isPrologue
    ? 'Bagian Pembuka / Flashback'
    : 'Kisah Utama & Lanjutan';

  const articleTransitionClass =
    transitionPhase === 'fade-out'
      ? ' fade-out'
      : transitionPhase === 'fade-in'
        ? ' fade-in'
        : '';

  // Apply dynamic font scaling to .prose and .dialogue elements inside rendered chapter HTML
  useEffect(() => {
    const container = articleRef.current;
    if (!container) return;
    const proseSize = `${1.05 * (fontScale / 100)}rem`;
    const dialogueSize = `${0.98 * (fontScale / 100)}rem`;
    container.querySelectorAll<HTMLElement>('.prose').forEach((el) => {
      el.style.fontSize = proseSize;
    });
    container.querySelectorAll<HTMLElement>('.dialogue').forEach((el) => {
      el.style.fontSize = dialogueSize;
    });
  }, [chapterHtml, fontScale]);

  // Scroll & flash-highlight matching paragraph when jumping from full-text search
  useEffect(() => {
    if (!pendingHighlightQuery || !articleRef.current) return;
    const container = articleRef.current;
    const target = findFirstMatchingParagraph(container, pendingHighlightQuery);
    onHighlightConsumed();
    if (!target) return;

    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    const scrollTimer = setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('para-highlight-flash');
      flashTimer = setTimeout(() => {
        target.classList.remove('para-highlight-flash');
      }, 1800);
    }, 400);

    return () => {
      clearTimeout(scrollTimer);
      if (flashTimer !== null) clearTimeout(flashTimer);
    };
  }, [pendingHighlightQuery, chapterHtml, onHighlightConsumed]);

  return (
    <main>
      <div className={`book-meta ${metaThemeClass}`}>
        <a
          href="#"
          className="book-title"
          onClick={(e) => {
            e.preventDefault();
            onBrandClick();
          }}
          style={{
            textDecoration: 'none',
            display: 'block',
            color: 'inherit',
          }}
        >
          Selamanya Itu Lama Banget
        </a>
        <span className="ornament">✦</span>
        <p
          className={`book-subtitle${
            subtitleTransitioning ? ' transitioning' : ''
          }`}
          id="book-subtitle-text"
        >
          {subtitleText}
        </p>
      </div>

      <article
        ref={articleRef}
        className={`chapter-content${articleTransitionClass}`}
        id="chapter-container"
        onClick={() => {
          if (focusMode) onToggleFocusUi();
        }}
        dangerouslySetInnerHTML={{ __html: chapterHtml }}
      />
    </main>
  );
}
