import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  onSendMessage?: () => void;
  onCloseTicket?: () => void;
  onFocusSearch?: () => void;
  onNextTicket?: () => void;
  onAssignTicket?: () => void;
}

export const useKeyboardShortcuts = ({
  onSendMessage,
  onCloseTicket,
  onFocusSearch,
  onNextTicket,
  onAssignTicket
}: KeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const cannedDropdown = document.querySelector('[data-canned-dropdown]');
        if (cannedDropdown) return;
      
      // Ignore if typing in input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Enter = Send message (only in textarea)
      if (e.key === 'Enter' && !e.shiftKey && isInput && target.tagName === 'TEXTAREA') {
        e.preventDefault();
        onSendMessage?.();
      }

      // Ctrl+F = Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isInput) {
        e.preventDefault();
        onFocusSearch?.();
      }

      // N = Next ticket
      if (e.key === 'n' && !isInput) {
        e.preventDefault();
        onNextTicket?.();
      }

      // Ctrl+A = Assign ticket
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !isInput) {
        e.preventDefault();
        onAssignTicket?.();
      }

      // Escape = Close ticket
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseTicket?.();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onSendMessage, onCloseTicket, onFocusSearch, onNextTicket, onAssignTicket]);
};