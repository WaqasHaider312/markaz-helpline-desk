import { X, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

interface PdfViewerProps {
  pdfUrl: string;
  onClose: () => void;
}

export function PdfViewer({ pdfUrl, onClose }: PdfViewerProps) {
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    // Reset error state when URL changes
    setIframeError(false);
  }, [pdfUrl]);

  const handleDownload = () => {
    window.open(pdfUrl, '_blank');
  };

  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`;

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-6 h-6" />
        </Button>
        <h3 className="font-semibold">PDF Document</h3>
        <Button variant="ghost" size="icon" onClick={handleDownload}>
          <ExternalLink className="w-6 h-6" />
        </Button>
      </div>
      
      {iframeError ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <p className="text-gray-600 mb-4">Unable to display PDF in viewer</p>
          <Button onClick={handleDownload}>
            Open in New Tab
          </Button>
        </div>
      ) : (
        <iframe
          src={viewerUrl}
          className="flex-1 w-full border-0"
          title="PDF Viewer"
          onError={() => setIframeError(true)}
        />
      )}
    </div>
  );
}