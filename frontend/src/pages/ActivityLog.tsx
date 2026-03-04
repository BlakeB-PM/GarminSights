import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Search, Filter, ChevronRight, Dumbbell, Footprints, Bike } from 'lucide-react';
import {
  getActivities,
  getActivityTypes,
  type Activity,
} from '../lib/api';
import {
  formatDuration,
  formatDistance,
  formatDateTime,
  getActivityTypeName,
  cn,
} from '../lib/utils';

const activityIcons: Record<string, React.ReactNode> = {
  strength_training: <Dumbbell className="w-5 h-5" />,
  running: <Footprints className="w-5 h-5" />,
  treadmill_running: <Footprints className="w-5 h-5" />,
  cycling: <Bike className="w-5 h-5" />,
};

export function ActivityLog({ onMenuToggle }: { onMenuToggle?: () => void } = {}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    type: '',
    search: '',
  });
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    async function loadTypes() {
      try {
        const { types } = await getActivityTypes();
        setActivityTypes(types);
      } catch (error) {
        console.error('Failed to load activity types:', error);
      }
    }
    loadTypes();
  }, []);

  useEffect(() => {
    async function loadActivities() {
      setLoading(true);
      try {
        const data = await getActivities({
          limit: pageSize,
          offset: page * pageSize,
          activity_type: filter.type || undefined,
        });
        setActivities(data);
      } catch (error) {
        console.error('Failed to load activities:', error);
      } finally {
        setLoading(false);
      }
    }
    loadActivities();
  }, [page, filter.type]);

  const filteredActivities = activities.filter((a) =>
    filter.search
      ? a.name?.toLowerCase().includes(filter.search.toLowerCase())
      : true
  );

  const typeOptions = [
    { value: '', label: 'All Types' },
    ...activityTypes.map((t) => ({ value: t, label: getActivityTypeName(t) })),
  ];

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <Header
        title="Activity Log"
        subtitle="Browse and search your workout history"
        onMenuToggle={onMenuToggle}
      />

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search activities..."
              value={filter.search}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
              className="pl-10"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          </div>
          
          <div className="w-48">
            <Select
              value={filter.type}
              onChange={(e) => {
                setFilter({ ...filter, type: e.target.value });
                setPage(0);
              }}
              options={typeOptions}
            />
          </div>
          
          <Button variant="secondary" className="gap-2">
            <Filter className="w-4 h-4" />
            More Filters
          </Button>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No activities found</p>
              <p className="text-sm mt-1">Try syncing your data or adjusting filters</p>
            </div>
          ) : (
            <div className="divide-y divide-card-border">
              {filteredActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-4 py-4 hover:bg-card/50 -mx-6 px-6 cursor-pointer transition-colors group"
                >
                  {/* Icon */}
                  <div className="p-3 rounded-xl bg-accent/10 text-accent">
                    {activityIcons[activity.activity_type] || <Footprints className="w-5 h-5" />}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-100 truncate">
                      {activity.name || getActivityTypeName(activity.activity_type)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDateTime(activity.start_time)}
                    </p>
                  </div>
                  
                  {/* Stats */}
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-gray-400">Duration</p>
                      <p className="font-mono text-gray-100">
                        {formatDuration(activity.duration_seconds)}
                      </p>
                    </div>
                    
                    {activity.distance_meters > 0 && (
                      <div className="text-right">
                        <p className="text-gray-400">Distance</p>
                        <p className="font-mono text-gray-100">
                          {formatDistance(activity.distance_meters)}
                        </p>
                      </div>
                    )}
                    
                    <div className="text-right">
                      <p className="text-gray-400">Calories</p>
                      <p className="font-mono text-gray-100">
                        {activity.calories || '—'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Arrow */}
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-accent transition-colors" />
                </div>
              ))}
            </div>
          )}
          
          {/* Pagination */}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-card-border">
            <Button
              variant="secondary"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-500">
              Page {page + 1}
            </span>
            <Button
              variant="secondary"
              onClick={() => setPage(page + 1)}
              disabled={filteredActivities.length < pageSize}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

