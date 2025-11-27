import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Clock, CheckCircle, AlertCircle, BarChart3, User, TrendingUp } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  myTickets: number;
  resolvedToday: number;
}

interface ResponseMetrics {
  avgFirstResponse: string;
  avgMessageResponse: string;
  avgResolution: string;
}

interface IssueCategoryData {
  issueType: string;
  count: number;
  avgResolutionTime: string;
}

interface AgentPerformance {
  agentName: string;
  ticketsClosed: number;
  avgResponseTime: string;
  resolvedToday: number;
}

interface HourlyData {
  hour: string;
  created: number;
  resolved: number;
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
  const [responseMetrics, setResponseMetrics] = useState<ResponseMetrics>({
    avgFirstResponse: '0h 0m',
    avgMessageResponse: '0h 0m',
    avgResolution: '0h 0m',
  });
  const [issueCategories, setIssueCategories] = useState<IssueCategoryData[]>([]);
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [volumeTrend, setVolumeTrend] = useState<{ date: string; count: number }[]>([]);
  const [volumePeriod, setVolumePeriod] = useState<'day' | 'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [profile, volumePeriod]);

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const fetchDashboardData = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      // Fetch all tickets
      const { data: allTickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      const tickets = allTickets || [];
      const today = startOfDay(new Date());

      // Calculate basic stats
      const newStats: Stats = {
        total: tickets.length,
        pending: tickets.filter((t) => t.status === 'Pending').length,
        inProgress: tickets.filter((t) => t.status === 'In Progress').length,
        resolved: tickets.filter((t) => t.status === 'Resolved').length,
        myTickets: tickets.filter((t) => t.assigned_agent_id === profile.id && t.status !== 'Resolved').length,
        resolvedToday: tickets.filter(
          (t) => t.status === 'Resolved' && new Date(t.updated_at) >= today
        ).length,
      };
      setStats(newStats);

      // Fetch messages for response metrics
      const { data: messages } = await supabase
        .from('messages')
        .select('ticket_id, sender_type, created_at')
        .order('created_at', { ascending: true });

      // Calculate first response time
      const firstResponseTimes: number[] = [];
      const messageResponseTimes: number[] = [];
      
      tickets.forEach(ticket => {
        const ticketMessages = messages?.filter(m => m.ticket_id === ticket.id) || [];
        const firstAgentMessage = ticketMessages.find(m => m.sender_type === 'agent');
        
        if (firstAgentMessage) {
          const responseTime = (new Date(firstAgentMessage.created_at).getTime() - new Date(ticket.created_at).getTime()) / (1000 * 60);
          firstResponseTimes.push(responseTime);
        }

        // Calculate message response times
        for (let i = 0; i < ticketMessages.length - 1; i++) {
          if (ticketMessages[i].sender_type === 'reseller' && ticketMessages[i + 1].sender_type === 'agent') {
            const responseTime = (new Date(ticketMessages[i + 1].created_at).getTime() - new Date(ticketMessages[i].created_at).getTime()) / (1000 * 60);
            messageResponseTimes.push(responseTime);
          }
        }
      });

      // Calculate resolution times
      const resolvedTickets = tickets.filter(t => t.status === 'Resolved');
      const resolutionTimes = resolvedTickets.map(t => 
        (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60)
      );

      setResponseMetrics({
        avgFirstResponse: firstResponseTimes.length > 0 
          ? formatDuration(firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length)
          : '0m',
        avgMessageResponse: messageResponseTimes.length > 0
          ? formatDuration(messageResponseTimes.reduce((a, b) => a + b, 0) / messageResponseTimes.length)
          : '0m',
        avgResolution: resolutionTimes.length > 0
          ? formatDuration(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
          : '0m',
      });

      // Issue categories
      const categoryMap = new Map<string, { count: number; resolutionTimes: number[] }>();
      tickets.forEach(t => {
        const existing = categoryMap.get(t.issue_type) || { count: 0, resolutionTimes: [] };
        existing.count++;
        if (t.status === 'Resolved') {
          const resTime = (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60);
          existing.resolutionTimes.push(resTime);
        }
        categoryMap.set(t.issue_type, existing);
      });

      const categories: IssueCategoryData[] = Array.from(categoryMap.entries()).map(([type, data]) => ({
        issueType: type,
        count: data.count,
        avgResolutionTime: data.resolutionTimes.length > 0
          ? formatDuration(data.resolutionTimes.reduce((a, b) => a + b, 0) / data.resolutionTimes.length)
          : 'N/A',
      })).sort((a, b) => b.count - a.count);

      setIssueCategories(categories);

      // Agent performance
      const { data: agents } = await supabase
        .from('agent_profiles')
        .select('id, full_name');

      const agentStats: AgentPerformance[] = (agents || []).map(agent => {
        const agentTickets = tickets.filter(t => (t as any).resolved_by === agent.id);
        const agentMessages = messages?.filter(m => m.sender_type === 'agent') || [];
        
        // Calculate agent response times
        const agentResponseTimes: number[] = [];
        tickets.forEach(ticket => {
          const ticketMessages = messages?.filter(m => m.ticket_id === ticket.id) || [];
          for (let i = 0; i < ticketMessages.length - 1; i++) {
            if (ticketMessages[i].sender_type === 'reseller' && ticketMessages[i + 1].sender_type === 'agent') {
              const responseTime = (new Date(ticketMessages[i + 1].created_at).getTime() - new Date(ticketMessages[i].created_at).getTime()) / (1000 * 60);
              agentResponseTimes.push(responseTime);
            }
          }
        });

        return {
          agentName: agent.full_name,
          ticketsClosed: agentTickets.length,
          avgResponseTime: agentResponseTimes.length > 0
            ? formatDuration(agentResponseTimes.reduce((a, b) => a + b, 0) / agentResponseTimes.length)
            : 'N/A',
          resolvedToday: agentTickets.filter(t => new Date(t.updated_at) >= today).length,
        };
      }).sort((a, b) => b.ticketsClosed - a.ticketsClosed);

      setAgentPerformance(agentStats);

      // Today's hourly data
      const hourlyMap = new Map<number, { created: number; resolved: number }>();
      for (let i = 0; i < 24; i++) {
        hourlyMap.set(i, { created: 0, resolved: 0 });
      }

      tickets.forEach(t => {
        const createdHour = new Date(t.created_at).getHours();
        if (new Date(t.created_at) >= today) {
          const data = hourlyMap.get(createdHour)!;
          data.created++;
          hourlyMap.set(createdHour, data);
        }

        if (t.status === 'Resolved' && new Date(t.updated_at) >= today) {
          const resolvedHour = new Date(t.updated_at).getHours();
          const data = hourlyMap.get(resolvedHour)!;
          data.resolved++;
          hourlyMap.set(resolvedHour, data);
        }
      });

      const hourlyArray: HourlyData[] = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        created: data.created,
        resolved: data.resolved,
      }));

      setHourlyData(hourlyArray);

      // Volume trends
      let daysBack = 1;
      if (volumePeriod === 'week') daysBack = 7;
      if (volumePeriod === 'month') daysBack = 30;

      const trendMap = new Map<string, number>();
      for (let i = 0; i < daysBack; i++) {
        const date = format(subDays(new Date(), i), 'MMM dd');
        trendMap.set(date, 0);
      }

      tickets.forEach(t => {
        const dateKey = format(new Date(t.created_at), 'MMM dd');
        if (trendMap.has(dateKey)) {
          trendMap.set(dateKey, (trendMap.get(dateKey) || 0) + 1);
        }
      });

      const trendArray = Array.from(trendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .reverse();

      setVolumeTrend(trendArray);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
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
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">My Tickets</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{stats.myTickets}</p>
                </div>
                <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Resolved Today</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">{stats.resolvedToday}</p>
                </div>
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Today's Performance Chart */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Today's Activity</h2>
            <div className="h-64 flex items-end gap-2">
              {hourlyData.filter(h => h.created > 0 || h.resolved > 0).map((data, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-1 items-end justify-center" style={{ height: '200px' }}>
                    <div
                      className="bg-blue-500 w-1/2 rounded-t"
                      style={{ height: `${(data.created / Math.max(...hourlyData.map(h => Math.max(h.created, h.resolved)))) * 100}%` }}
                      title={`Created: ${data.created}`}
                    />
                    <div
                      className="bg-green-500 w-1/2 rounded-t"
                      style={{ height: `${(data.resolved / Math.max(...hourlyData.map(h => Math.max(h.created, h.resolved)))) * 100}%` }}
                      title={`Resolved: ${data.resolved}`}
                    />
                  </div>
                  <span className="text-xs text-gray-600">{data.hour}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded" />
                <span className="text-sm text-gray-700">Created</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded" />
                <span className="text-sm text-gray-700">Resolved</span>
              </div>
            </div>
          </div>

          {/* Response Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-sm text-muted-foreground mb-2">Avg First Response</p>
              <p className="text-2xl font-bold text-foreground">{responseMetrics.avgFirstResponse}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-sm text-muted-foreground mb-2">Avg Message Response</p>
              <p className="text-2xl font-bold text-foreground">{responseMetrics.avgMessageResponse}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <p className="text-sm text-muted-foreground mb-2">Avg Resolution Time</p>
              <p className="text-2xl font-bold text-foreground">{responseMetrics.avgResolution}</p>
            </div>
          </div>

          {/* Issue Categories */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Issue Categories</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Issue Type</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Count</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Avg Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {issueCategories.map((cat, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-3 px-4 text-sm text-gray-900">{cat.issueType}</td>
                      <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">{cat.count}</td>
                      <td className="py-3 px-4 text-sm text-right text-gray-700">{cat.avgResolutionTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Agent Performance */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Agent Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Agent</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Tickets Closed</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Avg Response</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Resolved Today</th>
                  </tr>
                </thead>
                <tbody>
                  {agentPerformance.map((agent, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="py-3 px-4 text-sm text-gray-900">{agent.agentName}</td>
                      <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">{agent.ticketsClosed}</td>
                      <td className="py-3 px-4 text-sm text-right text-gray-700">{agent.avgResponseTime}</td>
                      <td className="py-3 px-4 text-sm text-right text-green-600 font-semibold">{agent.resolvedToday}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Volume Trends */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Ticket Volume Trend</h2>
              <Select value={volumePeriod} onValueChange={(val: any) => setVolumePeriod(val)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Today</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="h-64 flex items-end gap-2">
              {volumeTrend.map((data, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="bg-purple-500 w-full rounded-t"
                    style={{ 
                      height: `${(data.count / Math.max(...volumeTrend.map(v => v.count))) * 200}px`,
                      minHeight: data.count > 0 ? '4px' : '0'
                    }}
                    title={`${data.date}: ${data.count} tickets`}
                  />
                  <span className="text-xs text-gray-600 transform -rotate-45 origin-top-left mt-4">{data.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;