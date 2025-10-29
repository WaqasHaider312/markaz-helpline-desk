import { useState } from 'react';
import Sidebar from '@/components/tickets/Sidebar';
import TicketList from '@/components/tickets/TicketList';
import ChatPanel from '@/components/tickets/ChatPanel';
import InfoPanel from '@/components/tickets/InfoPanel';

export type ViewType = 'my-open' | 'all-unresolved' | 'all-tickets' | 'resolved-today';

const Tickets = () => {
  const [currentView, setCurrentView] = useState<ViewType>('my-open');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);

  return (
    <div className="flex h-screen w-full bg-background">
      {/* Left Sidebar */}
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      {/* Middle Panel - Ticket List */}
      <TicketList
        currentView={currentView}
        selectedTicketId={selectedTicketId}
        onSelectTicket={setSelectedTicketId}
      />

      {/* Center Panel - Chat */}
      <ChatPanel
        ticketId={selectedTicketId}
        onToggleInfo={() => setShowInfo(!showInfo)}
      />

      {/* Right Panel - Info */}
      <InfoPanel ticketId={selectedTicketId || 'test'} />
    </div>
  );
};

export default Tickets;
