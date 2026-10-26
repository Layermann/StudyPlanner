import React from 'react';
import { viewStats } from '../multi-degree.mjs';

export default function DegreeProgress({ modules, requirements }) {
  const stats = viewStats(modules, requirements);
  const { required: totalRequiredCredits, completed: totalEarnedCredits, inProgress: totalInProgressCredits, planned: totalPlannedCredits } = stats;
  const averageGrade = stats.average == null ? null : stats.average.toFixed(2);
  const totalEarnedPercentage = totalRequiredCredits > 0 ? Math.min((totalEarnedCredits / totalRequiredCredits) * 100, 100) : 0;
  const totalInProgressPercentage = totalRequiredCredits > 0 ? Math.min((totalInProgressCredits / totalRequiredCredits) * 100, 100 - totalEarnedPercentage) : 0;
  const totalPlannedPercentage = totalRequiredCredits > 0 ? Math.min((totalPlannedCredits / totalRequiredCredits) * 100, 100 - totalEarnedPercentage - totalInProgressPercentage) : 0;

  return (
<div className="overall-progress-section">
        <div className="op-header">
          <h2>Degree Progress</h2>
          <span className="fraction">{totalEarnedCredits} / {totalRequiredCredits} ECTS</span>
        </div>
        <div className="op-header">
          <h2>Current Average</h2>
          <span className="fraction">{averageGrade ?? '-'}</span>
        </div>
        <div className="progress-bar-large">
          <div className="progress-fill earned" style={{ width: `${totalEarnedPercentage}%` }} />
          <div className="progress-fill in-progress" style={{ width: `${totalInProgressPercentage}%` }} />
          <div className="progress-fill planned" style={{ width: `${totalPlannedPercentage}%` }} />
        </div>
        <div className="credit-summary" aria-label="ECTS by status" aria-live="polite">
          <div className="credit-stat planned"><span>Planned</span><strong>{totalPlannedCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat in-progress"><span>In Progress</span><strong>{totalInProgressCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat completed"><span>Completed</span><strong>{totalEarnedCredits}<small>ECTS</small></strong></div>
          <div className="credit-stat total"><span>Total allocated</span><strong>{totalPlannedCredits + totalInProgressCredits + totalEarnedCredits}<small>/ {totalRequiredCredits} ECTS</small></strong></div>
        </div>
        <p className="credit-summary-hint">Only included requirements count toward these totals.</p>
      </div>
  );
}
