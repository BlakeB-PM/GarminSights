import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { Dumbbell, TrendingUp, Target, Weight } from 'lucide-react';
import {
  getExercises,
  getExerciseProgress,
  getPersonalRecords,
  getMuscleGroupVolume,
  type ExerciseProgress,
} from '../lib/api';
import { formatWeight, formatDate, cn } from '../lib/utils';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export function StrengthAnalytics() {
  const [exercises, setExercises] = useState<string[]>([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [progress, setProgress] = useState<ExerciseProgress[]>([]);
  const [prs, setPrs] = useState<Array<{ exercise_name: string; estimated_1rm: number; max_weight_lifted: number; date_achieved: string }>>([]);
  const [muscleVolume, setMuscleVolume] = useState<Record<string, { volume: number; sets: number; exercises: string[] }>>({});
  const [loading, setLoading] = useState(true);

  // Load exercises list
  useEffect(() => {
    async function load() {
      try {
        const [exerciseData, prData, volumeData] = await Promise.all([
          getExercises(),
          getPersonalRecords(),
          getMuscleGroupVolume(30),
        ]);
        setExercises(exerciseData.exercises);
        setPrs(prData);
        setMuscleVolume(volumeData);
        
        if (exerciseData.exercises.length > 0) {
          setSelectedExercise(exerciseData.exercises[0]);
        }
      } catch (error) {
        console.error('Failed to load strength data:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load progress for selected exercise
  useEffect(() => {
    if (!selectedExercise) return;
    
    async function loadProgress() {
      try {
        const data = await getExerciseProgress(selectedExercise, 90);
        setProgress(data);
      } catch (error) {
        console.error('Failed to load progress:', error);
      }
    }
    loadProgress();
  }, [selectedExercise]);

  const exerciseOptions = exercises.map((e) => ({ value: e, label: e }));

  // Prepare muscle group data for chart
  const muscleGroupData = Object.entries(muscleVolume)
    .filter(([key]) => key !== 'other')
    .map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      volume: Math.round(data.volume),
      sets: data.sets,
    }))
    .sort((a, b) => b.volume - a.volume);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Header
        title="Strength Analytics"
        subtitle="Track your lifting progress and personal records"
      />

      {/* Exercise Selector */}
      <Card>
        <CardContent className="flex items-center gap-4">
          <Dumbbell className="w-5 h-5 text-accent" />
          <div className="flex-1">
            <Select
              label="Select Exercise"
              value={selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              options={exerciseOptions}
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1RM Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Estimated 1RM Over Time
            </CardTitle>
            <CardDescription>
              Calculated using Epley formula: weight × (1 + reps/30)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {progress.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progress} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      fontSize={12}
                      tickFormatter={(value) => formatDate(value)}
                    />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)} kg`, 'Est. 1RM']}
                      labelFormatter={(label) => formatDate(label, { month: 'long', day: 'numeric', year: 'numeric' })}
                    />
                    <Line
                      type="monotone"
                      dataKey="estimated_1rm"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      dot={{ fill: '#0ea5e9', r: 4 }}
                      name="Est. 1RM"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No data for this exercise
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Volume Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Weight className="w-5 h-5 text-accent" />
              Volume Per Session
            </CardTitle>
            <CardDescription>
              Total volume = sets × reps × weight
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {progress.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={progress} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      fontSize={12}
                      tickFormatter={(value) => formatDate(value)}
                    />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value.toFixed(0)} kg`, 'Volume']}
                      labelFormatter={(label) => formatDate(label, { month: 'long', day: 'numeric' })}
                    />
                    <Bar dataKey="total_volume" fill="#10b981" name="Volume" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No data for this exercise
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Personal Records & Muscle Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Records */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-accent" />
              Personal Records
            </CardTitle>
            <CardDescription>Your top estimated 1RM by exercise</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {prs.slice(0, 8).map((pr, index) => (
                <div
                  key={pr.exercise_name}
                  className="flex items-center justify-between py-2 border-b border-card-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                      index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                      index === 1 ? 'bg-gray-400/20 text-gray-400' :
                      index === 2 ? 'bg-amber-600/20 text-amber-600' :
                      'bg-card-border text-gray-500'
                    )}>
                      {index + 1}
                    </span>
                    <span className="text-gray-100 truncate max-w-[200px]">{pr.exercise_name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-accent">{formatWeight(pr.estimated_1rm)}</p>
                    <p className="text-xs text-gray-500">{formatDate(pr.date_achieved)}</p>
                  </div>
                </div>
              ))}
              {prs.length === 0 && (
                <p className="text-gray-500 text-center py-4">No PRs recorded yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Muscle Group Volume */}
        <Card>
          <CardHeader>
            <CardTitle>Volume by Muscle Group</CardTitle>
            <CardDescription>Last 30 days breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {muscleGroupData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={muscleGroupData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis type="number" stroke="#6b7280" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12121a',
                        border: '1px solid #1e1e2e',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value.toLocaleString()} kg`, 'Volume']}
                    />
                    <Bar dataKey="volume" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No volume data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

