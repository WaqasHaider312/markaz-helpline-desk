import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Star, Inbox, Clock, CheckCircle, LayoutDashboard, MessageSquare, Settings, LogOut } from 'lucide-react';
import { ViewType } from '@/pages/Tickets';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

interface ViewCounts {
  myOpen: number;
  allUnresolved: number;
  allTickets: number;
  resolvedToday: number;
}

const Sidebar = ({ currentView, onViewChange }: SidebarProps) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<ViewCounts>({
    myOpen: 0,
    allUnresolved: 0,
    allTickets: 0,
    resolvedToday: 0,
  });

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [profile]);

  const fetchCounts = async () => {
    if (!profile) return;

    try {
      // My Open Tickets
      const { count: myOpen } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_agent_id', profile.id)
        .neq('status', 'Resolved');

      // All Unresolved
      const { count: allUnresolved } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['Pending', 'In Progress']);

      // All Tickets
      const { count: allTickets } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true });

      // Resolved Today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: resolvedToday } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Resolved')
        .gte('updated_at', today.toISOString());

      setCounts({
        myOpen: myOpen || 0,
        allUnresolved: allUnresolved || 0,
        allTickets: allTickets || 0,
        resolvedToday: resolvedToday || 0,
      });
    } catch (error) {
      console.error('Error fetching counts:', error);
    }
  };

  const views = [
    { id: 'my-open' as ViewType, label: 'My Open Tickets', icon: Inbox, count: counts.myOpen },
    { id: 'all-unresolved' as ViewType, label: 'All Unresolved', icon: Clock, count: counts.allUnresolved },
    { id: 'all-tickets' as ViewType, label: 'All Tickets', icon: LayoutDashboard, count: counts.allTickets },
    { id: 'resolved-today' as ViewType, label: 'Resolved Today', icon: CheckCircle, count: counts.resolvedToday },
  ];

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { id: 'canned', label: 'Canned Messages', icon: MessageSquare, path: '/canned-messages' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ];

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="w-60 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Star className="h-8 w-8 text-primary" />
          <span className="text-lg font-bold text-foreground">Markaz Helpline</span>
        </div>
      </div>

      {/* Views Section */}
      <div className="py-4 px-2">
        <h3 className="text-xs uppercase text-muted-foreground px-3 mb-2 font-medium">
          Views
        </h3>
        <div className="space-y-1">
          {views.map((view) => {
            const Icon = view.icon;
            const isActive = currentView === view.id;
            
            return (
              <button
                key={view.id}
                onClick={() => onViewChange(view.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-primary border-l-4 border-primary'
                    : 'text-foreground hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{view.label}</span>
                </div>
                <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                  {view.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu Section */}
      <div className="py-4 px-2">
        <h3 className="text-xs uppercase text-muted-foreground px-3 mb-2 font-medium">
          Menu
        </h3>
        <div className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-gray-100 transition-colors"
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Profile Section */}
      <div className="mt-auto p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile?.avatar_url} />
            <AvatarFallback className="bg-primary text-white">
              {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {profile?.full_name || 'Agent'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {profile?.email}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
