import { useEffect, useState } from 'react';
import { supabase, Ticket } from '@/lib/supabase';
import { ChevronLeft, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface InfoPanelProps {
  ticketId: string | null;
}

const InfoPanel = ({ ticketId }: InfoPanelProps) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (ticketId) {
      fetchTicket();
    }
  }, [ticketId]);

  const fetchTicket = async () => {
    if (!ticketId) return;

    try {
      const { data } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      setTicket(data);
    } catch (error) {
      console.error('Error fetching ticket:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
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

  if (!ticketId || !ticket) {
    return null;
  }

  return (
    <div className="w-[300px] bg-white border-l border-gray-200 flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-medium text-foreground">Contact Info</h3>
      </div>

      {/* Contact Card */}
      <div className="p-4">
        <p className="text-lg font-bold text-foreground mb-2">{ticket.reseller_name}</p>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-gray-600">{ticket.reseller_phone}</span>
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

      {/* Ticket Details */}
      <div className="p-4 border-t border-gray-200">
        <h4 className="text-sm font-medium text-foreground mb-3">Ticket Details</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Order ID</p>
            <p className="text-foreground font-medium">{ticket.order_id}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Issue Type</p>
            <p className="text-foreground font-medium">{ticket.issue_type}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <span className={`status-badge ${getStatusColor(ticket.status)}`}>
              {ticket.status}
            </span>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-foreground">
              {format(new Date(ticket.created_at), 'MMM dd, yyyy')}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Ticket #</p>
            <p className="text-foreground font-medium">{ticket.ticket_number}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Assigned to</p>
            <p className="text-foreground">Unassigned</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-t border-gray-200">
        <h4 className="text-sm font-medium text-foreground mb-3">Quick Actions</h4>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start text-sm">
            Copy Ticket Link
          </Button>
          <Button variant="outline" className="w-full justify-start text-sm">
            Export Conversation
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InfoPanel;
