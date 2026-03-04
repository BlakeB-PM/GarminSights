import { FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';

export function DemoBanner() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>
        <strong>Demo mode</strong> — viewing synthetic data.{' '}
        <Link to="/settings" className="underline hover:text-warning/80">
          Disable in Settings
        </Link>
      </span>
    </div>
  );
}
