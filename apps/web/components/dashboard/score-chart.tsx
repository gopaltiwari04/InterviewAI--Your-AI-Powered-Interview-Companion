"use client";

import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import React from "react";

// Fallback local Card components to avoid missing module errors in environments
// where ../ui/card is not available. These are lightweight wrappers matching
// the original component API used in this file.
const Card: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => (
  <div className={className}>{children}</div>
);
const CardHeader: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="mb-2">{children}</div>
);
const CardTitle: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <h3 className="text-lg font-semibold">{children}</h3>
);
const CardDescription: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-zinc-400">{children}</p>
);
const CardContent: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className="p-4">{children}</div>
);

interface ChartData {
  date: string;
  techScore: number;
  commScore: number;
  overallScore: number;
}

interface ScoreChartProps {
  data: ChartData[];
}

export function ScoreChart({ data }: ScoreChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="w-full h-96 flex items-center justify-center text-zinc-500">
        No interview data available yet. Complete an interview to see your trends!
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Performance Trends</CardTitle>
        <CardDescription>Your AI-evaluated scores over time</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="#888" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
              />
              <YAxis 
                stroke="#888" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
                domain={[0, 100]} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                itemStyle={{ fontSize: '14px' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line 
                type="monotone" 
                name="Overall Score"
                dataKey="overallScore" 
                stroke="#3b82f6" 
                strokeWidth={3} 
                dot={{ r: 4, strokeWidth: 2 }} 
                activeDot={{ r: 6 }} 
              />
              <Line 
                type="monotone" 
                name="Technical"
                dataKey="techScore" 
                stroke="#22c55e" 
                strokeWidth={2} 
              />
              <Line 
                type="monotone" 
                name="Communication"
                dataKey="commScore" 
                stroke="#a855f7" 
                strokeWidth={2} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}