import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PdfViewerProps {
  pdfUrl: string;
  onClose: () => void;
}

export function PdfViewer({ pdfUrl, onClose }: PdfViewerProps) {
  const handleDownload = async () => {
    try {
      const response = await fetch(pdfUrl, {
        mode: 'cors',
        credentials: 'omit'
      });
      const blob = await response.blob();
      
      if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
        const file = new File([blob], `document-${Date.now()}.pdf`, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: 'PDF Document'
        });
        return;
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.setAttribute('download', `document-${Date.now()}.pdf`);
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Opening in new tab...');
      window.open(pdfUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-6 h-6" />
        </Button>
        <h3 className="font-semibold">PDF Document</h3>
        <Button variant="ghost" size="icon" onClick={handleDownload}>
          <Download className="w-6 h-6" />
        </Button>
      </div>
      
      <iframe
        src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`}
        className="flex-1 w-full h-full border-0"
        title="PDF Viewer"
      />
    </div>
  );
}