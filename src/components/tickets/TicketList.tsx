import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, Ticket } from '@/lib/supabase';
import { ViewType } from '@/pages/Tickets';
import { Search, SlidersHorizontal, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';

interface TicketListProps {
  currentView: ViewType;
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
}

const TicketList = ({ currentView, selectedTicketId, onSelectTicket }: TicketListProps) => {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('All Topics');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  useEffect(() => {
    fetchTickets();
  }, [currentView, profile, topicFilter, statusFilter, searchQuery]);

  const fetchTickets = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      let query = supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply view filter
      if (currentView === 'my-open') {
        query = query.eq('assigned_agent_id', profile.id).neq('status', 'Resolved');
      } else if (currentView === 'all-unresolved') {
        query = query.in('status', ['Pending', 'In Progress']);
      } else if (currentView === 'resolved-today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.eq('status', 'Resolved').gte('updated_at', today.toISOString());
      }

      // Apply topic filter
      if (topicFilter !== 'All Topics') {
        query = query.eq('issue_type', topicFilter);
      }

      // Apply status filter
      if (statusFilter !== 'All') {
        query = query.eq('status', statusFilter);
      }

      // Apply search
      if (searchQuery) {
        query = query.or(
          `ticket_number.ilike.%${searchQuery}%,reseller_phone.ilike.%${searchQuery}%,order_id.ilike.%${searchQuery}%,reseller_name.ilike.%${searchQuery}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'status-pending';
      case 'In Progress':
        return 'status-in-progress';
      case 'Resolved':
        return 'status-resolved';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-foreground">Tickets</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {searchOpen && (
          <Input
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-3"
          />
        )}

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none"
          >
            <option>All Topics</option>
            <option>Delivery Issues</option>
            <option>Payment Issues</option>
            <option>Return Issues</option>
            <option>App/OTP</option>
            <option>Other</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none"
          >
            <option>All</option>
            <option>Pending</option>
            <option>In Progress</option>
            <option>Resolved</option>
          </select>
        </div>
      </div>

      {/* Ticket List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Loading tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <FileText className="h-12 w-12 text-gray-400 mb-3" />
            <p className="text-foreground font-medium">No tickets found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try adjusting your filters
            </p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => onSelectTicket(ticket.id)}
              className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                selectedTicketId === ticket.id ? 'bg-blue-50 border-l-4 border-primary' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">
                    {ticket.ticket_number}
                  </span>
                </div>
                <span className={`status-badge ${getStatusColor(ticket.status)}`}>
                  {ticket.status}
                </span>
              </div>

              <p className="font-medium text-gray-900 mb-1">{ticket.reseller_name}</p>

              <div className="flex gap-4 text-xs text-gray-600 mb-2">
                <span>Order: {ticket.order_id}</span>
                <span>Assigned: Unassigned</span>
              </div>

              <p className="text-xs text-gray-500 truncate mb-1">
                {ticket.description.slice(0, 50)}...
              </p>

              <p className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default TicketList;
