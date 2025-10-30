import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, Ticket } from '@/lib/supabase';
import { ViewType } from '@/pages/Tickets';
import { Search, SlidersHorizontal, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';

interface TicketListProps {
  currentView: ViewType;
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
}

type SortType = 'newest' | 'oldest' | 'longest-wait';

const TicketList = ({ currentView, selectedTicketId, onSelectTicket }: TicketListProps) => {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('All Topics');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortType>('newest');
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchTickets();
    fetchAgents();
  }, [currentView, profile, topicFilter, statusFilter, searchQuery, sortBy]);

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_profiles')
        .select('id, full_name')
        .order('full_name');

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchTickets = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      let query = supabase
        .from('tickets')
        .select('*');

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

      // Apply sorting
      if (sortBy === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sortBy === 'oldest') {
        query = query.order('created_at', { ascending: true });
      } else if (sortBy === 'longest-wait') {
        // For longest wait, we want oldest pending/in-progress tickets first
        query = query.order('created_at', { ascending: true });
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

  const handleSelectAll = () => {
    if (selectedTickets.size === tickets.length) {
      setSelectedTickets(new Set());
    } else {
      setSelectedTickets(new Set(tickets.map(t => t.id)));
    }
  };

  const handleTicketCheckbox = (ticketId: string) => {
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    setSelectedTickets(newSelected);
  };

  const handleBulkAssign = async () => {
    if (!selectedAgent || selectedTickets.size === 0) return;

    setAssigning(true);
    try {
      const updates = Array.from(selectedTickets).map(ticketId => ({
        id: ticketId,
        assigned_agent_id: selectedAgent,
        updated_at: new Date().toISOString()
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('tickets')
          .update({
            assigned_agent_id: update.assigned_agent_id,
            updated_at: update.updated_at
          })
          .eq('id', update.id);

        if (error) throw error;
      }

      // Clear selection and refresh
      setSelectedTickets(new Set());
      setSelectedAgent('');
      await fetchTickets();
    } catch (error) {
      console.error('Error assigning tickets:', error);
    } finally {
      setAssigning(false);
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

  const getSortLabel = (sort: SortType) => {
    switch (sort) {
      case 'newest':
        return 'Newest First';
      case 'oldest':
        return 'Oldest First';
      case 'longest-wait':
        return 'Longest Wait';
    }
  };

  return (
    <div className="w-[360px] bg-white border-r border-gray-200 flex flex-col h-full">
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
            
            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setSortBy('newest')}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Newest First</span>
                  {sortBy === 'newest' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy('oldest')}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Oldest First</span>
                  {sortBy === 'oldest' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy('longest-wait')}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Longest Wait</span>
                  {sortBy === 'longest-wait' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        <div className="flex gap-2 mb-3">
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

        {/* Bulk Actions */}
        {tickets.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="flex-1"
              >
                {selectedTickets.size === tickets.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            {selectedTickets.size > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  <option value="">Select Agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.full_name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={handleBulkAssign}
                  disabled={!selectedAgent || assigning}
                  className="whitespace-nowrap"
                >
                  {assigning ? 'Assigning...' : 'Assign'}
                </Button>
              </div>
            )}

            {selectedTickets.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedTickets.size} ticket{selectedTickets.size !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        )}

        {/* Sort indicator */}
        <p className="text-xs text-muted-foreground mt-2">
          Sorted by: {getSortLabel(sortBy)}
        </p>
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
            <div
              key={ticket.id}
              className={`flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors ${
                selectedTicketId === ticket.id ? 'bg-blue-50 border-l-4 border-primary' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedTickets.has(ticket.id)}
                onChange={() => handleTicketCheckbox(ticket.id)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              />
              
              <button
                onClick={() => onSelectTicket(ticket.id)}
                className="flex-1 text-left"
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
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TicketList;