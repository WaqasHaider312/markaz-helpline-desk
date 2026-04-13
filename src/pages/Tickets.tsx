import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/tickets/Sidebar';
import TicketList from '@/components/tickets/TicketList';
import ChatPanel from '@/components/tickets/ChatPanel';
import InfoPanel from '@/components/tickets/InfoPanel';
import { useKeyboardShortcuts } from '@/components/tickets/KeyboardShortcuts';
import { TicketsProvider } from '@/contexts/TicketsContext';

export type ViewType =
  | 'my-open'
  | 'unassigned'
  | 'all-assigned'
  | 'my-resolved-today'
  | 'all-resolved-today'
  | 'all-tickets'
  | 'ai-handling';

const Tickets = () => {
  const { profile } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('my-open');
  const currentViewRef = useRef<ViewType>('my-open');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);
  const [ticketsList, setTicketsList] = useState<any[]>([]);

  const handleViewChange = (view: ViewType) => {
    currentViewRef.current = view;
    setCurrentView(view);
  };

  const handleNextTicket = () => {
    if (!selectedTicketId || ticketsList.length === 0) return;

    const currentIndex = ticketsList.findIndex(t => t.id === selectedTicketId);
    const nextIndex = (currentIndex + 1) % ticketsList.length;
    setSelectedTicketId(ticketsList[nextIndex].id);
  };

  useKeyboardShortcuts({
    onCloseTicket: () => setSelectedTicketId(null),
    onNextTicket: handleNextTicket
  });

  return (
    <TicketsProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar currentView={currentView} onViewChange={handleViewChange} />

        {/* Middle Panel - Ticket List */}
        <TicketList
          currentView={currentView}
          selectedTicketId={selectedTicketId}
          onSelectTicket={setSelectedTicketId}
          onTicketOpen={(ticket) => {
            const view = currentViewRef.current;

            // Stay in these views — never auto-switch away
            if (
              view === 'ai-handling' ||
              view === 'all-tickets' ||
              (ticket.status === 'Resolved' && (view === 'my-resolved-today' || view === 'all-resolved-today'))
            ) {
              return;
            }

            // Auto-switch for other cases
            if (ticket.status !== 'Resolved' && (ticket as any).ai_handled) {
              handleViewChange('ai-handling');
            } else if (ticket.status !== 'Resolved' && !ticket.assigned_agent_id) {
              handleViewChange('unassigned');
            } else if (ticket.assigned_agent_id === profile?.id && ticket.status !== 'Resolved') {
              handleViewChange('my-open');
            } else if (ticket.status !== 'Resolved') {
              handleViewChange('all-assigned');
            }
          }}
          onTicketsLoad={(tickets) => setTicketsList(tickets)}
        />

        {/* Right Panel - Chat */}
        <ChatPanel
          ticketId={selectedTicketId}
          onToggleInfo={() => setShowInfo(!showInfo)}
          showInfo={showInfo}
          onSelectTicket={setSelectedTicketId}
        />

        {/* Far Right - Info Panel */}
        {showInfo && (
          <InfoPanel
            ticketId={selectedTicketId}
            onNextTicket={handleNextTicket}
            onClose={() => setSelectedTicketId(null)}
          />
        )}
      </div>
    </TicketsProvider>
  );
};

export default Tickets;