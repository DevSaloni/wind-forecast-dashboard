/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ExecutiveOverview } from './pages/ExecutiveOverview';
import { ForecastExplorer } from './pages/ForecastExplorer';
import { AccuracyAnalysis } from './pages/AccuracyAnalysis';
import { DataQualityMethodology } from './pages/DataQualityMethodology';
import {
  AccuracySeriesResponse,
  ForecastMode,
  HealthResponse,
  NavigationPage,
} from './types';
import { api } from './services/api';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('overview');
  const [selectedDate, setSelectedDate] = useState<string>('2026-01-15');
  const [forecastMode, setForecastMode] = useState<ForecastMode>('decision_time');
  const [cutoffHour, setCutoffHour] = useState<number>(11);
  const [cutoffMinute] = useState<number>(0);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [seriesData, setSeriesData] = useState<AccuracySeriesResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Fetch health check once on mount
  useEffect(() => {
    let mounted = true;
    async function checkHealth() {
      try {
        const h = await api.getHealth();
        if (mounted) setHealth(h);
      } catch (err) {
        console.warn('Backend health check error:', err);
      }
    }
    checkHealth();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch series data when parameters change
  const loadSeriesData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAccuracySeries(
        selectedDate,
        forecastMode,
        cutoffHour,
        cutoffMinute
      );
      setSeriesData(data);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve forecast accuracy series');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, forecastMode, cutoffHour, cutoffMinute]);

  useEffect(() => {
    loadSeriesData();
  }, [loadSeriesData]);

  const renderActivePage = () => {
    switch (currentPage) {
      case 'overview':
        return (
          <ExecutiveOverview
            seriesData={seriesData}
            loading={loading}
            error={error}
            forecastMode={forecastMode}
            onPageChange={setCurrentPage}
            onRetry={loadSeriesData}
          />
        );
      case 'explorer':
        return (
          <ForecastExplorer
            seriesData={seriesData}
            loading={loading}
            forecastMode={forecastMode}
          />
        );
      case 'accuracy':
        return (
          <AccuracyAnalysis
            seriesData={seriesData}
            forecastMode={forecastMode}
            cutoffHour={cutoffHour}
          />
        );
      case 'methodology':
        return (
          <DataQualityMethodology
            seriesData={seriesData}
            health={health}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        upstreamStatus={health?.upstreamElexonStatus || 'nominal'}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          currentPage={currentPage}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          forecastMode={forecastMode}
          onModeChange={setForecastMode}
          cutoffHour={cutoffHour}
          onCutoffChange={setCutoffHour}
          onRefresh={loadSeriesData}
          loading={loading}
          lastRefreshed={lastRefreshed}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto">
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
}
