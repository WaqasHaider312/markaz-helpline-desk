import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase, Ticket } from '@/lib/supabase';
import { useAuth } from './AuthContext';

interface TicketsContextType {
  tickets: Ticket[];
  selectedTicketId: string | null;
  setSelectedTicketId: (id: string | null) => void;
  refreshTickets: () => Promise<void>;
  counts: {
    pending: number;
    inProgress: number;
    resolved: number;
  };
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

export const TicketsProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  const refreshTickets = async () => {
    if (!profile) return;

    const { data } = await supabase
        .from('tickets')
        .select('*, agent_profiles!assigned_agent_id(full_name)')
        .order('created_at', { ascending: false });

    setTickets(data || []);
  };

  useEffect(() => {
    if (!profile) return;

    refreshTickets();

    // Realtime subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
        .channel('all-tickets')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'tickets' },  // Change INSERT to *
            () => {
            refreshTickets();
            }
        )
        .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [profile]);

  const counts = {
    pending: tickets.filter(t => t.status === 'Pending').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
  };

  return (
    <TicketsContext.Provider value={{ tickets, selectedTicketId, setSelectedTicketId, refreshTickets, counts }}>
      {children}
    </TicketsContext.Provider>
  );
};

export const useTickets = () => {
  const context = useContext(TicketsContext);
  if (!context) throw new Error('useTickets must be used within TicketsProvider');
  return context;
};