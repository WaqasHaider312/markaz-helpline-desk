import { useState } from 'react';
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
  | 'all-tickets';

const Tickets = () => {
  const { profile } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('my-open');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);
  const [ticketsList, setTicketsList] = useState<any[]>([]);

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
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />

        {/* Middle Panel - Ticket List */}
        <TicketList
          currentView={currentView}
          selectedTicketId={selectedTicketId}
          onSelectTicket={setSelectedTicketId}
          onTicketOpen={(ticket) => {
            // Don't auto-switch if already in any resolved view
            if (ticket.status === 'Resolved' && 
                (currentView === 'my-resolved-today' || currentView === 'all-resolved-today')) {
              return; // Stay in current resolved view
            }
            
            // Auto-switch for other cases (but not for resolved tickets)
            if (ticket.status !== 'Resolved' && !ticket.assigned_agent_id) {
              setCurrentView('unassigned');
            } else if (ticket.assigned_agent_id === profile?.id && ticket.status !== 'Resolved') {
              setCurrentView('my-open');
            } else if (ticket.status !== 'Resolved') {
              setCurrentView('all-assigned');
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
