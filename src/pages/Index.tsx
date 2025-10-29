import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/tickets');
    }
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <Star className="h-20 w-20 text-primary mx-auto mb-6" />
        <h1 className="mb-4 text-4xl font-bold">Markaz Helpline</h1>
        <p className="text-xl text-muted-foreground mb-8">Premium Agent Dashboard</p>
        <Button onClick={() => navigate('/login')} size="lg">
          Go to Login
        </Button>
      </div>
    </div>
  );
};

export default Index;
