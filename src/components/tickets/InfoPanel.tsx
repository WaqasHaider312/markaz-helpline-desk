import { useEffect, useState } from 'react';
import { supabase, Ticket } from '@/lib/supabase';
import { Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTickets } from '@/contexts/TicketsContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';

interface InfoPanelProps {
  ticketId: string | null;
  onNextTicket?: () => void;
  onClose?: () => void;
}

interface AgentProfile {
  id: string;
  full_name: string;
}

interface ResellerStats {
  avgPerDay: number;
  last7Days: number;
  last30Days: number;
  activeTickets: {
    total: number;
    byType: { [key: string]: number };
  };
  resolvedTickets: {
    total: number;
    byType: { [key: string]: number };
  };
}

const InfoPanel = ({ ticketId, onNextTicket, onClose }: InfoPanelProps) => {
  const { tickets } = useTickets();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [updating, setUpdating] = useState(false);
  const [resellerStats, setResellerStats] = useState<ResellerStats | null>(null);
  const [showResolvedBreakdown, setShowResolvedBreakdown] = useState(false);
  const [resellerStatus, setResellerStatus] = useState<'blocked' | 'restricted' | 'genuine'>('genuine');
  const [ticketQuota, setTicketQuota] = useState(3);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const { profile } = useAuth();

  useEffect(() => {
    if (ticketId) {
      const currentTicket = tickets.find(t => t.id === ticketId);
      setTicket(currentTicket || null);
      fetchAgents();
      
      if (currentTicket) {
        fetchResellerStats(currentTicket.reseller_id);
      }
    }
  }, [ticketId, tickets]);

  const fetchResellerStats = async (resellerId: string) => {
    try {
      // Get all tickets for this reseller
      const { data: allTickets, error } = await supabase
        .from('tickets')
        .select('status, issue_type, created_at')
        .eq('reseller_id', resellerId);

      if (error) throw error;

      if (!allTickets) {
        setResellerStats(null);
        return;
      }

      const now = new Date();
      const sevenDaysAgo = subDays(now, 7);
      const thirtyDaysAgo = subDays(now, 30);

      // Calculate stats
      const activeTickets = allTickets.filter(t => t.status !== 'Resolved');
      const resolvedTickets = allTickets.filter(t => t.status === 'Resolved');
      const last7DaysTickets = allTickets.filter(t => new Date(t.created_at) >= sevenDaysAgo);
      const last30DaysTickets = allTickets.filter(t => new Date(t.created_at) >= thirtyDaysAgo);

      // Count by issue type
      const activeByType: { [key: string]: number } = {};
      activeTickets.forEach(t => {
        activeByType[t.issue_type] = (activeByType[t.issue_type] || 0) + 1;
      });

      const resolvedByType: { [key: string]: number } = {};
      resolvedTickets.forEach(t => {
        resolvedByType[t.issue_type] = (resolvedByType[t.issue_type] || 0) + 1;
      });

      // Calculate average per day (based on first ticket date to now)
      const firstTicketDate = allTickets.length > 0 
        ? new Date(Math.min(...allTickets.map(t => new Date(t.created_at).getTime())))
        : now;
      const daysSinceFirst = Math.max(1, Math.ceil((now.getTime() - firstTicketDate.getTime()) / (1000 * 60 * 60 * 24)));
      const avgPerDay = parseFloat((allTickets.length / daysSinceFirst).toFixed(1));

      setResellerStats({
        avgPerDay,
        last7Days: last7DaysTickets.length,
        last30Days: last30DaysTickets.length,
        activeTickets: {
          total: activeTickets.length,
          byType: activeByType
        },
        resolvedTickets: {
          total: resolvedTickets.length,
          byType: resolvedByType
        }
      });

      // Fetch reseller profile status
      const { data: profileData } = await supabase
        .from('reseller_profiles')
        .select('reseller_status, ticket_quota')
        .eq('reseller_id', resellerId)
        .single();

      if (profileData) {
        setResellerStatus(profileData.reseller_status);
        setTicketQuota(profileData.ticket_quota);
      } else {
        // Create default profile if doesn't exist
        await supabase
          .from('reseller_profiles')
          .insert({
            reseller_id: resellerId,
            reseller_status: 'genuine',
            ticket_quota: 3
          });
        setResellerStatus('genuine');
        setTicketQuota(3);
      }

      // Count open tickets
      setOpenTicketsCount(activeTickets.length);
    } catch (error) {
      console.error('Error fetching reseller stats:', error);
      setResellerStats(null);
    }
  };

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

  const { refreshTickets } = useTickets();

  const handleFlagReseller = async (status: 'blocked' | 'restricted' | 'genuine') => {
    if (!ticket) return;
    
    setUpdating(true);
    try {
      let newQuota: number;

      if (status === 'blocked') {
        // Block logic: reduce quota to nearest lower multiple of 3, minimum 1
        if (openTicketsCount > 3) {
          newQuota = Math.floor((openTicketsCount - 1) / 3) * 3;
          if (newQuota < 3) newQuota = 3;
        } else {
          newQuota = 1;
        }
      } else if (status === 'restricted') {
        // Restrict logic: set quota to current active count (minimum 3)
        newQuota = Math.max(openTicketsCount, 3);
      } else {
        // Genuine: default to 3
        newQuota = 3;
      }

      const { error } = await supabase
        .from('reseller_profiles')
        .upsert({
          reseller_id: ticket.reseller_id,
          reseller_status: status,
          ticket_quota: newQuota
        }, {
          onConflict: 'reseller_id'
        });

      if (error) throw error;
      
      setResellerStatus(status);
      setTicketQuota(newQuota);
      
      const statusLabels = {
        blocked: 'Blocked',
        restricted: 'Restricted',
        genuine: 'Genuine'
      };
      
      toast.success(`Reseller marked as ${statusLabels[status]} (quota: ${newQuota})`);
    } catch (error) {
      console.error('Error flagging reseller:', error);
      toast.error('Failed to update reseller status');
    } finally {
      setUpdating(false);
    }
  };

  const handleAllowMoreTickets = async () => {
    if (!ticket) return;
    
    setUpdating(true);
    try {
      let newQuota: number;
      let newStatus: 'blocked' | 'restricted' | 'genuine' = resellerStatus;

      if (resellerStatus === 'blocked') {
        // Blocked -> grant 3 tickets total, change to restricted
        newQuota = 3;
        newStatus = 'restricted';
      } else {
        // Restricted or Genuine -> add +3 to current quota
        newQuota = ticketQuota + 3;
      }

      const { error } = await supabase
        .from('reseller_profiles')
        .update({ 
          ticket_quota: newQuota,
          reseller_status: newStatus
        })
        .eq('reseller_id', ticket.reseller_id);

      if (error) throw error;
      
      setTicketQuota(newQuota);
      setResellerStatus(newStatus);
      
      toast.success(`Quota increased to ${newQuota} tickets`);
    } catch (error) {
      console.error('Error increasing quota:', error);
      toast.error('Failed to increase quota');
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!ticketId) return;

    setUpdating(true);
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'Resolved') {
        updates.resolved_by = profile?.id;
      }

      const { error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', ticketId);

      if (error) throw error;
      
      await refreshTickets();

      // Create activity record
      let activityDetails = '';
      if (newStatus === 'Resolved') {
        activityDetails = `${profile?.full_name} marked ticket as Resolved`;
      } else if (newStatus === 'Pending') {
        activityDetails = `${profile?.full_name} reopened the ticket`;
      } else {
        activityDetails = `${profile?.full_name} changed status to ${newStatus}`;
      }
      
      await supabase.from('ticket_activities').insert({
        ticket_id: ticketId,
        activity_type: 'status_changed',
        actor_name: profile?.full_name || 'Agent',
        details: activityDetails
      });

      toast.success(`Status updated to ${newStatus}`);
      
      if (newStatus === 'Resolved') {
        setTimeout(() => {
          onNextTicket?.();
        }, 500);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignChange = async (agentId: string) => {
    if (!ticketId) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ assigned_agent_id: agentId === 'unassigned' ? null : agentId })
        .eq('id', ticketId);

      if (error) throw error;
      await refreshTickets();

      // Create activity record
      const assignedTo = agentId === 'unassigned' ? null : agents.find(a => a.id === agentId)?.full_name;
      let activityDetails = '';

      if (agentId === 'unassigned') {
        activityDetails = `${profile?.full_name} unassigned the ticket`;
      } else if (agentId === profile?.id) {
        activityDetails = `${profile?.full_name} assigned ticket to self`;
      } else {
        activityDetails = `${profile?.full_name} assigned ticket to ${assignedTo}`;
      }

      await supabase.from('ticket_activities').insert({
        ticket_id: ticketId,
        activity_type: 'assigned',
        actor_name: profile?.full_name || 'Agent',
        details: activityDetails
      });

      toast.success('Assignment updated');
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error('Failed to update assignment');
    } finally {
      setUpdating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  if (!ticketId || !ticket) {
    return (
      <div className="w-[320px] bg-white border-l border-gray-200 flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">Select a ticket to view details</p>
      </div>
    );
  }

  return (
    <div className="w-[320px] bg-white border-l border-gray-200 flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-lg text-foreground">Ticket Info</h3>
      </div>

      {/* Section 1: Contact & Current Ticket */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
          Contact & Ticket Info
        </h4>
        
        <div className="space-y-2.5">
          {/* Reseller Name */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Reseller</p>
            <p className="text-sm font-semibold text-gray-900">{ticket.reseller_name}</p>
          </div>

          {/* Phone */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Phone</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-900">{ticket.reseller_phone}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyToClipboard(ticket.reseller_phone)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Reseller Status Badge */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Status</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
              resellerStatus === 'blocked' 
                ? 'bg-red-600 text-white' 
                : resellerStatus === 'restricted' 
                ? 'bg-yellow-600 text-white' 
                : 'bg-green-600 text-white'
            }`}>
              {resellerStatus === 'blocked' && '🚫 Blocked'}
              {resellerStatus === 'restricted' && '⚠️ Restricted'}
              {resellerStatus === 'genuine' && '✅ Genuine'}
            </span>
          </div>

          {/* Quota Info */}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Ticket Quota</p>
            <p className="text-sm font-medium text-gray-900">
              Open Tickets: <span className="font-bold">{openTicketsCount}/{ticketQuota}</span>
            </p>
          </div>

          {/* Flag Dropdown Button */}
          <div>
            <Select onValueChange={handleFlagReseller}>
              <SelectTrigger className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs">
                <SelectValue placeholder="Flag Reseller Status" className="text-center" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blocked" className="text-white">
                  🚫 Block Reseller
                </SelectItem>
                <SelectItem value="restricted" className="text-white">
                  ⚠️ Restrict Reseller
                </SelectItem>
                <SelectItem value="genuine" className="text-white">
                  ✅ Mark as Genuine
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Allow More Tickets Button */}
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs"
            onClick={handleAllowMoreTickets}
            disabled={updating}
          >
            {resellerStatus === 'blocked' ? 'Allow 3 Tickets' : 'Allow Next Quota (+3)'}
          </Button>

          {/* Ticket Number & Order ID (Side by Side) */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Ticket #</p>
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-900 truncate">{ticket.ticket_number}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 flex-shrink-0"
                  onClick={() => copyToClipboard(ticket.ticket_number)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-0.5">Order ID</p>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-900 truncate">{ticket.order_id || 'N/A'}</span>
                {ticket.order_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 flex-shrink-0"
                    onClick={() => copyToClipboard(ticket.order_id)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Issue Type & Created Date (Side by Side) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Issue Type</p>
              <p className="text-xs text-gray-900">{ticket.issue_type}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-0.5">Created</p>
              <p className="text-xs text-gray-900">
                {format(new Date(ticket.created_at), 'MMM dd, HH:mm')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Status Controls */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Status
            </label>
            <Select
              value={ticket.status}
              onValueChange={handleStatusChange}
              disabled={updating}
            >
              <SelectTrigger className="w-full h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Assign to
            </label>
            <Select
              value={ticket.assigned_agent_id || 'unassigned'}
              onValueChange={handleAssignChange}
              disabled={updating}
            >
              <SelectTrigger className="w-full h-9">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {ticket.status === 'Resolved' ? (
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => handleStatusChange('Pending')}
            disabled={updating}
          >
            ↻ Reopen Ticket
          </Button>
        ) : (
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => handleStatusChange('Resolved')}
            disabled={updating}
          >
            ✓ Mark Resolved
          </Button>
        )}
      </div>

      {/* Section 3: Reseller Ticket History */}
      <div className="p-4">
        <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
          Reseller Ticket History
        </h4>

        {resellerStats ? (
          <div className="space-y-4">
            {/* Overview Stats */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg">
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-0.5">Avg/Day</p>
                <p className="text-base font-bold text-gray-900">{resellerStats.avgPerDay}</p>
              </div>
              <div className="text-center border-l border-gray-200">
                <p className="text-xs text-gray-500 mb-0.5">Last 7d</p>
                <p className="text-base font-bold text-gray-900">{resellerStats.last7Days}</p>
              </div>
              <div className="text-center border-l border-gray-200">
                <p className="text-xs text-gray-500 mb-0.5">Last 30d</p>
                <p className="text-base font-bold text-gray-900">{resellerStats.last30Days}</p>
              </div>
            </div>

            {/* Active Tickets Breakdown */}
            <div className="border border-orange-200 rounded-lg p-3 bg-orange-50">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-sm font-semibold text-orange-900">Active Tickets</h5>
                <span className="text-lg font-bold text-orange-600">
                  {resellerStats.activeTickets.total}
                </span>
              </div>
              
              {Object.keys(resellerStats.activeTickets.byType).length > 0 ? (
                <div className="space-y-1 mt-2">
                  {Object.entries(resellerStats.activeTickets.byType).map(([type, count]) => (
                    <div key={type} className="flex items-center text-xs">
                      <span className="text-orange-900 mr-1">•</span>
                      <span className="text-orange-800">{type}:</span>
                      <span className="font-semibold text-orange-900 ml-1">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-orange-600 mt-2">No active tickets</p>
              )}
            </div>

            {/* Resolved Tickets */}
            <div className="border border-green-200 rounded-lg p-3 bg-green-50">
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowResolvedBreakdown(!showResolvedBreakdown)}
              >
                <h5 className="text-sm font-semibold text-green-900">Resolved Tickets</h5>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-600">
                    {resellerStats.resolvedTickets.total}
                  </span>
                  {showResolvedBreakdown ? (
                    <ChevronUp className="h-4 w-4 text-green-700" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-green-700" />
                  )}
                </div>
              </div>

              {showResolvedBreakdown && Object.keys(resellerStats.resolvedTickets.byType).length > 0 && (
                <div className="space-y-1 mt-2 pt-2 border-t border-green-200">
                  {Object.entries(resellerStats.resolvedTickets.byType).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-xs">
                      <span className="text-green-800">{type}</span>
                      <span className="font-semibold text-green-900">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs text-gray-500">Loading stats...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InfoPanel;