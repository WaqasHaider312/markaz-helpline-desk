import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Clock, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  myTickets: number;
  resolvedToday: number;
}

interface RecentTicket {
  id: string;
  ticket_number: string;
  reseller_name: string;
  issue_type: string;
  status: string;
  created_at: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
    myTickets: 0,
    resolvedToday: 0,
  });
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [profile]);

  const fetchDashboardData = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Fetch all tickets for stats
      const { data: allTickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      const tickets = allTickets || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate stats
      const newStats: Stats = {
        total: tickets.length,
        pending: tickets.filter((t) => t.status === 'Pending').length,
        inProgress: tickets.filter((t) => t.status === 'In Progress').length,
        resolved: tickets.filter((t) => t.status === 'Resolved').length,
        myTickets: tickets.filter((t) => t.assigned_agent_id === profile.id).length,
        resolvedToday: tickets.filter(
          (t) => t.status === 'Resolved' && new Date(t.updated_at) >= today
        ).length,
      };

      setStats(newStats);

      // Get recent tickets (last 10)
      setRecentTickets(tickets.slice(0, 10));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      Pending: 'bg-amber-100 text-amber-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      Resolved: 'bg-green-100 text-green-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b p-4 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/tickets')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Overview of ticket metrics</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Total Tickets */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Tickets</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{stats.total}</p>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Pending */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">{stats.pending}</p>
                </div>
                <div className="h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </div>

            {/* In Progress */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{stats.inProgress}</p>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Resolved */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Resolved</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">{stats.resolved}</p>
                </div>
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </div>

            {/* My Tickets */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">My Tickets</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{stats.myTickets}</p>
                </div>
                <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">👤</span>
                </div>
              </div>
            </div>

            {/* Resolved Today */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Resolved Today</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">{stats.resolvedToday}</p>
                </div>
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Tickets */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-foreground">Recent Tickets</h2>
            </div>
            <div className="divide-y">
              {recentTickets.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No tickets yet
                </div>
              ) : (
                recentTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate('/tickets')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <p className="font-medium text-foreground">{ticket.ticket_number}</p>
                          <span
                            className={`text-xs px-2 py-1 rounded ${getStatusBadge(
                              ticket.status
                            )}`}
                          >
                            {ticket.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{ticket.reseller_name}</p>
                        <p className="text-sm text-muted-foreground">{ticket.issue_type}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(ticket.created_at), 'MMM dd, HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;