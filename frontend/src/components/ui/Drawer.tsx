import { useEffect, useState, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Drawer({ open, onClose, title, description, children, className }: DrawerProps) {
  const [width, setWidth] = useState(384); // Default: w-96 (384px)
  const [isResizing, setIsResizing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(384);

  // Close on Escape key and prevent body scroll when open
  useEffect(() => {
    if (!open) return;
    
    // Prevent body scroll when drawer is open
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = originalStyle;
    };
  }, [open, onClose]);

  // Handle mouse down on resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  // Handle mouse move for resizing
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startXRef.current - e.clientX; // Negative because we're dragging left
      const newWidth = Math.max(320, Math.min(1200, startWidthRef.current + deltaX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Reset width when drawer closes
  useEffect(() => {
    if (!open) {
      setWidth(384);
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <div
        ref={drawerRef}
        className={cn(
          'fixed right-0 top-0 h-full z-50',
          'bg-[#12121a] border-l border-card-border',
          'flex flex-col',
          'transform transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
          className
        )}
        style={{ width: `${width}px` }}
      >
        {/* Resize handle */}
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-1 cursor-ew-resize z-10',
            'hover:bg-accent/50 transition-colors',
            isResizing && 'bg-accent'
          )}
          onMouseDown={handleMouseDown}
          aria-label="Resize drawer"
        />

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-card-border">
          <div className="flex-1 pr-4">
            <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
            {description && (
              <p className="text-sm text-gray-400 mt-1">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-card-border transition-colors text-gray-400 hover:text-gray-100"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div 
          className="flex-1 overflow-y-auto p-6"
          onWheel={(e) => {
            // Prevent scroll from propagating to background
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            // Prevent touch scroll from propagating to background
            e.stopPropagation();
          }}
          style={{ 
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

