import { X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

interface PdfViewerProps {
  pdfUrl: string;
  onClose: () => void;
}

export function PdfViewer({ pdfUrl, onClose }: PdfViewerProps) {
  useEffect(() => {
    // Open PDF in new tab immediately
    window.open(pdfUrl, '_blank');
    // Close the viewer overlay after opening
    setTimeout(onClose, 100);
  }, [pdfUrl, onClose]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 text-center">
        <ExternalLink className="w-12 h-12 mx-auto mb-4 text-primary" />
        <p className="text-lg font-medium mb-2">Opening PDF...</p>
        <Button variant="outline" onClick={onClose} className="mt-4">
          Close
        </Button>
      </div>
    </div>
  );
}