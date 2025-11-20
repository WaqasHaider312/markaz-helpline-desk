import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MediaViewerProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  onClose: () => void;
}

export function MediaViewer({ mediaUrl, mediaType, onClose }: MediaViewerProps) {
  const handleDownload = async () => {
    try {
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = mediaType === 'image' ? 'jpg' : 'mp4';
      a.download = `${mediaType}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(mediaUrl, '_blank');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      onClick={onClose}
    >
      <div className="flex items-center justify-between p-4 bg-black/50">
        {/* Download button on LEFT */}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          className="text-white hover:bg-white/20"
        >
          <Download className="w-6 h-6" />
        </Button>
        
        {/* Close button on RIGHT */}
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-white hover:bg-white/20"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {mediaType === 'image' ? (
          <img
            src={mediaUrl}
            alt="Full screen"
            className="max-w-full max-h-full w-auto h-auto object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <video
            src={mediaUrl}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full w-auto h-auto"
            style={{ maxHeight: 'calc(100vh - 80px)' }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}